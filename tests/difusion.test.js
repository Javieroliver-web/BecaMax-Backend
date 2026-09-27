'use strict';
// Tests de la difusión automática (node --test, sin red ni Supabase real).
//
// Supabase se sustituye por una base en memoria que entiende justo las
// consultas que hace src/services/difusion, y Telegram por un fetch simulado.
const test = require('node:test');
const assert = require('node:assert');
const { componerMensaje, motivoNoPublicable, formatearFecha, formatearImporte } = require('../src/services/difusion/plantilla');
const { publicarNovedades } = require('../src/services/difusion');
const telegram = require('../src/services/difusion/canales/telegram');
const { ErrorCanal } = require('../src/services/difusion/errores');

const AHORA = new Date('2026-10-01T08:00:00Z');

const beca = (n, extra = {}) => ({
  id: n,
  codigo_bdns: String(900000 + n),
  nombre: `Beca de prueba ${n}`,
  entidad: 'Universidad de Granada',
  importe: null,
  deadline: '2026-12-04',
  region: 'Andalucía',
  url: 'https://example.org/bases.pdf',
  created_at: `2026-09-${String(10 + n).padStart(2, '0')}T06:00:00Z`,
  ...extra,
});

// ---------- Supabase en memoria ----------
function supabaseFalso({ becas = [], publicaciones = [], fallaTabla = false } = {}) {
  const tablas = { becas: becas.map((b) => ({ ...b })), difusion_publicaciones: publicaciones.map((p) => ({ ...p })) };
  class Consulta {
    constructor(tabla) { this.tabla = tabla; this.filtros = []; this.op = 'select'; this.lim = Infinity; }
    select() { if (this.op === 'select') this.op = 'select'; this.devolver = true; return this; }
    not(c, _op, v) { this.filtros.push((f) => f[c] !== v && f[c] !== undefined); return this; }
    gte(c, v) { this.filtros.push((f) => f[c] >= v); return this; }
    lt(c, v) { this.filtros.push((f) => f[c] < v); return this; }
    eq(c, v) { this.filtros.push((f) => f[c] === v); return this; }
    in(c, vs) { this.filtros.push((f) => vs.includes(f[c])); return this; }
    order(c, { ascending }) { this.orden = [c, ascending]; return this; }
    limit(n) { this.lim = n; return this; }
    insert(fila) { this.op = 'insert'; this.fila = fila; return this; }
    update(campos) { this.op = 'update'; this.campos = campos; return this; }
    then(ok, ko) { return Promise.resolve().then(() => this.ejecutar()).then(ok, ko); }
    ejecutar() {
      if (fallaTabla && this.tabla === 'difusion_publicaciones') return { data: null, error: { message: 'relation does not exist', code: '42P01' } };
      const t = tablas[this.tabla];
      if (this.op === 'insert') {
        if (t.some((f) => f.codigo_bdns === this.fila.codigo_bdns && f.canal === this.fila.canal)) {
          return { data: null, error: { message: 'duplicate key', code: '23505' } };
        }
        t.push({ ...this.fila });
        return { data: null, error: null };
      }
      const filas = t.filter((f) => this.filtros.every((fn) => fn(f)));
      if (this.op === 'update') {
        for (const f of filas) Object.assign(f, this.campos);
        return { data: filas.map((f) => ({ ...f })), error: null };
      }
      if (this.orden) {
        const [c, asc] = this.orden;
        filas.sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1));
      }
      return { data: filas.slice(0, this.lim).map((f) => ({ ...f })), error: null };
    }
  }
  return { tablas, from: (tabla) => new Consulta(tabla) };
}

// ---------- Telegram simulado ----------
function telegramFalso(respuesta = () => ({ status: 200, body: { ok: true, result: { message_id: 1 } } })) {
  const enviados = [];
  const fetchImpl = async (url, init) => {
    const cuerpo = JSON.parse(init.body);
    enviados.push({ url, ...cuerpo });
    const r = respuesta(enviados.length, cuerpo);
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { enviados, fetchImpl };
}

const ENV = { DIFUSION_TELEGRAM: 'on', TELEGRAM_BOT_TOKEN: 'token-falso', TELEGRAM_CHANNEL_ID: '@becamax_prueba', FRONTEND_URL: 'https://becamax.vercel.app' };
const ejecutar = (supabase, extra = {}) => publicarNovedades(supabase, { env: ENV, ahora: AHORA, canales: [telegram], ...extra });

// =================== PLANTILLA ===================

test('plantilla: datos reales, fecha dd/mm/aaaa, región, enlace con UTM y fuente', () => {
  const { texto, enlace } = componerMensaje(beca(7, { importe: { min: 1500, max: 1500 } }), { canal: 'telegram', limite: 4096 });
  assert.match(texto, /Beca de prueba 7/);
  assert.match(texto, /Universidad de Granada/);
  assert.match(texto, /1500 €/); // norma RAE: con 4 cifras no se pone punto
  assert.match(texto, /hasta el 04\/12\/2026/);
  assert.match(texto, /Andalucía/);
  assert.match(texto, /Fuente: BDNS/);
  assert.strictEqual(enlace, 'https://becamax.vercel.app/pages/beca-detalle.html?id=7&utm_source=telegram&utm_medium=social&utm_campaign=difusion');
  assert.ok(texto.includes(enlace));
});

test('plantilla: un dato que falta no aparece (nada inventado)', () => {
  const { texto } = componerMensaje(beca(3, { importe: null, entidad: null, region: null }), { canal: 'telegram', limite: 4096 });
  assert.doesNotMatch(texto, /💶|€/);
  assert.doesNotMatch(texto, /🏛️/);
  assert.doesNotMatch(texto, /📍/);
  assert.doesNotMatch(texto, /undefined|null/);
});

test('plantilla: respeta el límite de caracteres (300 de Bluesky) sin romper el enlace', () => {
  const larga = beca(12, { nombre: 'Convocatoria de becas y ayudas al estudio '.repeat(10), entidad: 'Consejería de Desarrollo Educativo y Formación Profesional '.repeat(3) });
  const { texto, enlace } = componerMensaje(larga, { canal: 'bluesky', limite: 300 });
  assert.ok([...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(texto)].length <= 300);
  assert.ok(texto.includes(enlace), 'el enlace sale entero');
  assert.match(texto, /…/);
});

test('plantilla: fechas e importes', () => {
  assert.strictEqual(formatearFecha('2026-10-31'), '31/10/2026');
  assert.strictEqual(formatearFecha('2026-10-31T00:00:00+00:00'), '31/10/2026');
  assert.strictEqual(formatearFecha(null), null);
  assert.strictEqual(formatearImporte({ min: 300, max: 6000 }), '300 € – 6000 €');
  assert.strictEqual(formatearImporte({ min: null, max: 6000 }), 'Hasta 6000 €');
  assert.strictEqual(formatearImporte({ min: 0, max: 0 }), null);
  assert.strictEqual(formatearImporte(null), null);
});

test('plantilla: no se publica lo caducado, sin enlace oficial o sin id', () => {
  assert.strictEqual(motivoNoPublicable(beca(1), '2026-10-01'), null);
  assert.strictEqual(motivoNoPublicable(beca(1, { deadline: '2026-09-30' }), '2026-10-01'), 'caducada');
  assert.strictEqual(motivoNoPublicable(beca(1, { url: 'javascript:alert(1)' }), '2026-10-01'), 'sin enlace oficial válido');
  assert.strictEqual(motivoNoPublicable(beca(1, { id: null }), '2026-10-01'), 'sin id para la ficha');
  assert.strictEqual(motivoNoPublicable(beca(1, { codigo_bdns: null }), '2026-10-01'), 'sin codigo_bdns');
});

// =================== PUBLICACIÓN ===================

test('publica las becas nuevas y apunta cada una como publicada', async () => {
  const sb = supabaseFalso({ becas: [beca(1), beca(2)] });
  const tg = telegramFalso();
  const r = await ejecutar(sb, { fetchImpl: tg.fetchImpl });
  assert.strictEqual(r.canales.telegram.publicadas, 2);
  assert.strictEqual(tg.enviados.length, 2);
  assert.strictEqual(tg.enviados[0].chat_id, '@becamax_prueba');
  assert.deepStrictEqual(sb.tablas.difusion_publicaciones.map((p) => [p.codigo_bdns, p.estado, p.intentos]),
    [['900001', 'publicado', 1], ['900002', 'publicado', 1]]);
});

test('idempotencia: una segunda ejecución no vuelve a publicar nada', async () => {
  const sb = supabaseFalso({ becas: [beca(1), beca(2)] });
  const tg = telegramFalso();
  await ejecutar(sb, { fetchImpl: tg.fetchImpl });
  const r2 = await ejecutar(sb, { fetchImpl: tg.fetchImpl });
  assert.strictEqual(tg.enviados.length, 2);
  assert.strictEqual(r2.canales.telegram.publicadas, 0);
});

test('una fila en "publicando" (post salió pero no se apuntó) no se repite', async () => {
  const sb = supabaseFalso({ becas: [beca(1)], publicaciones: [{ codigo_bdns: '900001', canal: 'telegram', estado: 'publicando', intentos: 0 }] });
  const tg = telegramFalso();
  await ejecutar(sb, { fetchImpl: tg.fetchImpl });
  assert.strictEqual(tg.enviados.length, 0);
});

test('omite becas que cierran en menos de 3 días y las de ejemplo sin codigo_bdns', async () => {
  const sb = supabaseFalso({ becas: [beca(1, { deadline: '2026-10-03' }), beca(2, { codigo_bdns: null }), beca(3, { deadline: '2026-10-04' })] });
  const tg = telegramFalso();
  const r = await ejecutar(sb, { fetchImpl: tg.fetchImpl });
  assert.strictEqual(r.becasVigentes, 1);
  assert.deepStrictEqual(tg.enviados.map((e) => e.text.includes('Beca de prueba 3')), [true]);
});

test('como mucho 5 por ejecución y canal; el resto espera', async () => {
  const sb = supabaseFalso({ becas: Array.from({ length: 8 }, (_, i) => beca(i + 1)) });
  const tg = telegramFalso();
  const r1 = await ejecutar(sb, { fetchImpl: tg.fetchImpl });
  assert.strictEqual(r1.canales.telegram.publicadas, 5);
  assert.strictEqual(r1.canales.telegram.pendientes, 8);
  const r2 = await ejecutar(sb, { fetchImpl: tg.fetchImpl });
  assert.strictEqual(r2.canales.telegram.publicadas, 3);
  assert.strictEqual(tg.enviados.length, 8);
});

test('DIFUSION_DESDE: no se anuncian becas creadas antes de activar la difusión', async () => {
  const sb = supabaseFalso({ becas: [beca(1), beca(9)] }); // created_at 11/09 y 19/09
  const tg = telegramFalso();
  await publicarNovedades(sb, { env: { ...ENV, DIFUSION_DESDE: '2026-09-15' }, ahora: AHORA, canales: [telegram], fetchImpl: tg.fetchImpl });
  assert.deepStrictEqual(tg.enviados.map((e) => e.text.split('\n')[0]), ['🎓 Beca de prueba 9']);
});

test('canal caído: se para el canal, la beca no gasta intento y se reintenta después', async () => {
  const sb = supabaseFalso({ becas: [beca(1), beca(2)] });
  const caido = telegramFalso(() => ({ status: 401, body: { ok: false, error_code: 401, description: 'Unauthorized' } }));
  const r = await ejecutar(sb, { fetchImpl: caido.fetchImpl });
  assert.strictEqual(caido.enviados.length, 1, 'tras el primer fallo del canal no insiste');
  assert.ok(r.canales.telegram.parado);
  assert.match(r.canales.telegram.primerError, /401/);
  assert.deepStrictEqual(sb.tablas.difusion_publicaciones.map((p) => [p.estado, p.intentos]), [['error', 0]]);
  assert.ok(!JSON.stringify(r).includes('token-falso'), 'el token nunca sale en el resumen');

  const tg = telegramFalso();
  const r2 = await ejecutar(sb, { fetchImpl: tg.fetchImpl });
  assert.strictEqual(r2.canales.telegram.publicadas, 2);
});

test('error del mensaje: gasta intento y a los 3 intentos se abandona', async () => {
  const sb = supabaseFalso({ becas: [beca(1)] });
  const rechaza = telegramFalso(() => ({ status: 400, body: { ok: false, description: 'Bad Request: message is too long' } }));
  for (let i = 0; i < 4; i++) await ejecutar(sb, { fetchImpl: rechaza.fetchImpl });
  assert.strictEqual(rechaza.enviados.length, 3);
  assert.deepStrictEqual(sb.tablas.difusion_publicaciones.map((p) => [p.estado, p.intentos]), [['error', 3]]);
});

test('un canal caído no rompe los demás', async () => {
  const roto = { nombre: 'roto', limite: 300, incluirEnlace: true, credenciales: () => ({}), publicar: async () => { throw new ErrorCanal('servicio caído'); } };
  const sb = supabaseFalso({ becas: [beca(1)] });
  const tg = telegramFalso();
  const r = await publicarNovedades(sb, { env: { ...ENV, DIFUSION_ROTO: 'on' }, ahora: AHORA, canales: [roto, telegram], fetchImpl: tg.fetchImpl });
  assert.ok(r.canales.roto.parado);
  assert.strictEqual(r.canales.telegram.publicadas, 1);
});

test('canal apagado o sin credenciales: se omite sin publicar', async () => {
  const sb = supabaseFalso({ becas: [beca(1)] });
  const tg = telegramFalso();
  const r1 = await publicarNovedades(sb, { env: { ...ENV, DIFUSION_TELEGRAM: 'off' }, ahora: AHORA, canales: [telegram], fetchImpl: tg.fetchImpl });
  const r2 = await publicarNovedades(sb, { env: { DIFUSION_TELEGRAM: 'on' }, ahora: AHORA, canales: [telegram], fetchImpl: tg.fetchImpl });
  assert.deepStrictEqual([r1.canales, r2.canales], [{}, {}]);
  assert.strictEqual(tg.enviados.length, 0);
});

test('--dry-run: enseña los mensajes sin publicar ni escribir, aunque falte la tabla', async () => {
  const sb = supabaseFalso({ becas: [beca(1)], fallaTabla: true });
  const tg = telegramFalso();
  const r = await publicarNovedades(sb, { dryRun: true, env: {}, ahora: AHORA, canales: [telegram], fetchImpl: tg.fetchImpl });
  assert.strictEqual(tg.enviados.length, 0);
  assert.strictEqual(r.canales.telegram.propuestas.length, 1);
  assert.match(r.canales.telegram.propuestas[0].texto, /Beca de prueba 1/);
});

test('sin la tabla de control, la ejecución real falla con un mensaje claro', async () => {
  const sb = supabaseFalso({ becas: [beca(1)], fallaTabla: true });
  await assert.rejects(ejecutar(sb, { fetchImpl: telegramFalso().fetchImpl }), /difusion_setup\.sql/);
});
