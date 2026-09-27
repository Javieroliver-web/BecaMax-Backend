'use strict';
// Tests del boletín semanal (node --test, sin red ni Supabase real).
const test = require('node:test');
const assert = require('node:assert');
const boletin = require('../src/services/boletin');
const { supabaseMemoria } = require('./helpers/supabaseMemoria');

const AHORA = new Date('2026-10-05T09:00:00Z'); // lunes
const VERSION = '2026-10';
const ENV = { FRONTEND_URL: 'https://becamax.vercel.app', BACKEND_URL: 'https://beca-max-backend.vercel.app' };
const UNICOS = { suscriptores_boletin: ['email', 'token_baja', 'token_confirmacion_hash'] };

function correoFalso({ falla = false } = {}) {
  const enviados = [];
  const lotes = [];
  return {
    enviados, lotes,
    enviar: async (m) => { if (falla) throw new Error('Resend: dominio no verificado'); enviados.push(m); },
    enviarLote: async (ms) => { if (falla) throw new Error('Resend: dominio no verificado'); lotes.push(ms); },
  };
}
const tokenDe = (mensaje, ruta) => new RegExp(`${ruta}\\?token=([A-Za-z0-9_-]{43})`).exec(mensaje.text)[1];

// ---------------- alta y doble confirmación ----------------

test('alta: guarda el consentimiento con su texto y versión y manda SOLO el correo de confirmación', async () => {
  const sb = supabaseMemoria({ suscriptores_boletin: [] }, { unicos: UNICOS });
  const correo = correoFalso();
  const r = await boletin.darDeAlta(sb, correo, { email: '  Ana@Example.COM ', version: VERSION, ahora: AHORA, env: ENV });

  assert.strictEqual(r, 'enviado');
  const [fila] = sb.tablas.suscriptores_boletin;
  assert.strictEqual(fila.email, 'ana@example.com');
  assert.strictEqual(fila.confirmado_en, undefined, 'sigue pendiente hasta confirmar');
  assert.strictEqual(fila.consentimiento_texto, boletin.CONSENTIMIENTOS[VERSION]);
  assert.strictEqual(fila.consentimiento_version, VERSION);
  assert.strictEqual(fila.consentimiento_en, AHORA.toISOString());
  assert.strictEqual(correo.enviados.length, 1);
  assert.match(correo.enviados[0].subject, /Confirma/);
  const t = tokenDe(correo.enviados[0], 'confirmar');
  assert.notStrictEqual(fila.token_confirmacion_hash, t, 'en la base de datos solo se guarda el hash');
});

test('alta: correo o versión no válidos no escriben ni envían nada', async () => {
  const sb = supabaseMemoria({ suscriptores_boletin: [] }, { unicos: UNICOS });
  const correo = correoFalso();
  for (const [email, version] of [['no-es-un-correo', VERSION], ['a@b.co', '1999-01'], ['<x>@b.co', VERSION], [null, VERSION]]) {
    assert.strictEqual(await boletin.darDeAlta(sb, correo, { email, version, ahora: AHORA, env: ENV }), 'invalido');
  }
  assert.strictEqual(sb.tablas.suscriptores_boletin.length, 0);
  assert.strictEqual(correo.enviados.length, 0);
});

test('alta repetida: espera 10 min entre correos y no toca a quien ya confirmó', async () => {
  const sb = supabaseMemoria({ suscriptores_boletin: [] }, { unicos: UNICOS });
  const correo = correoFalso();
  await boletin.darDeAlta(sb, correo, { email: 'ana@example.com', version: VERSION, ahora: AHORA, env: ENV });
  assert.strictEqual(await boletin.darDeAlta(sb, correo, { email: 'ana@example.com', version: VERSION, ahora: new Date(AHORA.getTime() + 60000), env: ENV }), 'esperar');
  assert.strictEqual(await boletin.darDeAlta(sb, correo, { email: 'ana@example.com', version: VERSION, ahora: new Date(AHORA.getTime() + 11 * 60000), env: ENV }), 'enviado');
  assert.strictEqual(sb.tablas.suscriptores_boletin.length, 1);

  sb.tablas.suscriptores_boletin[0].confirmado_en = AHORA.toISOString();
  assert.strictEqual(await boletin.darDeAlta(sb, correo, { email: 'ana@example.com', version: VERSION, ahora: new Date(AHORA.getTime() + 3600000), env: ENV }), 'ya_confirmado');
  assert.strictEqual(correo.enviados.length, 2);
});

test('confirmar: el enlace activa la suscripción una sola vez; caducado o falso no', async () => {
  const sb = supabaseMemoria({ suscriptores_boletin: [] }, { unicos: UNICOS });
  const correo = correoFalso();
  await boletin.darDeAlta(sb, correo, { email: 'ana@example.com', version: VERSION, ahora: AHORA, env: ENV });
  const t = tokenDe(correo.enviados[0], 'confirmar');

  assert.strictEqual(await boletin.confirmar(sb, 'x'.repeat(43), { ahora: AHORA }), 'invalido');
  assert.strictEqual(await boletin.confirmar(sb, "'; drop table--", { ahora: AHORA }), 'invalido');
  assert.strictEqual(await boletin.confirmar(sb, t, { ahora: new Date(AHORA.getTime() + 49 * 3600000) }), 'caducado');
  assert.strictEqual(await boletin.confirmar(sb, t, { ahora: AHORA }), 'confirmado');
  assert.ok(sb.tablas.suscriptores_boletin[0].confirmado_en);
  assert.strictEqual(await boletin.confirmar(sb, t, { ahora: AHORA }), 'invalido', 'el token no sirve dos veces');
});

test('baja: un clic borra la fila entera; repetirla no falla', async () => {
  const sb = supabaseMemoria({ suscriptores_boletin: [{ id: 1, email: 'ana@example.com', token_baja: 'b'.repeat(43), confirmado_en: AHORA.toISOString() }] }, { unicos: UNICOS });
  assert.strictEqual(await boletin.darDeBaja(sb, 'b'.repeat(43)), 'baja');
  assert.strictEqual(sb.tablas.suscriptores_boletin.length, 0);
  assert.strictEqual(await boletin.darDeBaja(sb, 'b'.repeat(43)), 'baja');
  assert.strictEqual(await boletin.darDeBaja(sb, 'corto'), 'invalido');
});

// ---------------- envío semanal ----------------

const beca = (id, extra) => ({ id, codigo_bdns: String(900000 + id), nombre: `Beca ${id}`, entidad: 'Universidad de Granada', region: 'Andalucía', url: 'https://example.org/b.pdf', ...extra });
const BECAS = [
  beca(1, { created_at: '2026-10-02T06:00:00Z', deadline: '2026-12-04' }),   // nueva
  beca(2, { created_at: '2026-08-01T06:00:00Z', deadline: '2026-10-12' }),   // cierra pronto
  beca(3, { created_at: '2026-08-01T06:00:00Z', deadline: '2026-10-01' }),   // caducada
  beca(4, { created_at: '2026-10-03T06:00:00Z', deadline: '2026-10-10', codigo_bdns: null }), // de ejemplo
];
const SUBS = [
  { id: 1, email: 'ana@example.com', token_baja: 'a'.repeat(43), confirmado_en: '2026-09-01T00:00:00Z', creado_en: '2026-09-01T00:00:00Z' },
  { id: 2, email: 'pendiente@example.com', token_baja: 'p'.repeat(43), confirmado_en: null, creado_en: '2026-10-04T00:00:00Z' },
  { id: 3, email: 'viejo-pendiente@example.com', token_baja: 'v'.repeat(43), confirmado_en: null, creado_en: '2026-09-01T00:00:00Z' },
  { id: 4, email: 'luis@example.com', token_baja: 'l'.repeat(43), confirmado_en: '2026-09-02T00:00:00Z', creado_en: '2026-09-02T00:00:00Z', ultimo_envio_en: '2026-10-04T09:00:00Z' },
];

test('semanal: solo a confirmados, con becas reales vigentes y enlace de baja de un clic', async () => {
  const sb = supabaseMemoria({ becas: BECAS, suscriptores_boletin: SUBS }, { unicos: UNICOS });
  const correo = correoFalso();
  const r = await boletin.enviarBoletinSemanal(sb, correo, { ahora: AHORA, env: ENV });

  assert.deepStrictEqual(r.becas, { nuevas: 1, cierran: 1 });
  assert.strictEqual(r.enviados, 1, 'Luis ya lo recibió ayer; los pendientes no reciben nada');
  const [m] = correo.lotes[0];
  assert.strictEqual(m.to, 'ana@example.com');
  assert.match(m.html, /Beca 1/);
  assert.match(m.html, /Beca 2/);
  assert.doesNotMatch(m.html, /Beca 3|Beca 4/, 'ni caducadas ni de ejemplo');
  assert.match(m.html, /utm_source=boletin/);
  assert.strictEqual(m.headers['List-Unsubscribe'], `<https://beca-max-backend.vercel.app/api/boletin/baja?token=${'a'.repeat(43)}>`);
  assert.strictEqual(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(m.text, /Darme de baja: https:\/\/beca-max-backend\.vercel\.app\/api\/boletin\/baja\?token=a{43}/);

  const emails = sb.tablas.suscriptores_boletin.map((s) => s.email);
  assert.ok(!emails.includes('viejo-pendiente@example.com'), 'altas sin confirmar de más de 7 días se borran');
  assert.ok(emails.includes('pendiente@example.com'));
  assert.strictEqual(sb.tablas.suscriptores_boletin.find((s) => s.id === 1).ultimo_envio_en, AHORA.toISOString());
});

test('semanal: si se dispara dos veces, no se repite', async () => {
  const sb = supabaseMemoria({ becas: BECAS, suscriptores_boletin: SUBS }, { unicos: UNICOS });
  const correo = correoFalso();
  await boletin.enviarBoletinSemanal(sb, correo, { ahora: AHORA, env: ENV });
  const r2 = await boletin.enviarBoletinSemanal(sb, correo, { ahora: new Date(AHORA.getTime() + 3600000), env: ENV });
  assert.strictEqual(r2.enviados, 0);
  assert.strictEqual(correo.lotes.length, 1);
});

test('semanal: sin becas que contar no se manda nada', async () => {
  const sb = supabaseMemoria({ becas: [BECAS[2], BECAS[3]], suscriptores_boletin: SUBS }, { unicos: UNICOS });
  const correo = correoFalso();
  const r = await boletin.enviarBoletinSemanal(sb, correo, { ahora: AHORA, env: ENV });
  assert.strictEqual(r.enviados, 0);
  assert.strictEqual(correo.lotes.length, 0);
});

test('semanal: si Resend falla se cuenta el fallo y no se marca como enviado', async () => {
  const sb = supabaseMemoria({ becas: BECAS, suscriptores_boletin: SUBS }, { unicos: UNICOS });
  const r = await boletin.enviarBoletinSemanal(sb, correoFalso({ falla: true }), { ahora: AHORA, env: ENV });
  assert.strictEqual(r.errores, 1);
  assert.match(r.primerError, /dominio no verificado/);
  assert.strictEqual(sb.tablas.suscriptores_boletin.find((s) => s.id === 1).ultimo_envio_en, undefined);
});

test('los datos de la BDNS se escapan en el HTML del correo', () => {
  const { html } = boletin.componerBoletin({ nuevas: [beca(9, { nombre: '<script>alert(1)</script>', deadline: '2026-12-01' })], cierran: [] }, 'https://x/baja', ENV);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
