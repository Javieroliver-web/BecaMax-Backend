'use strict';
// Tests del canal Bluesky (node --test, fetch simulado: nunca sale a la red).
const test = require('node:test');
const assert = require('node:assert');
const bluesky = require('../src/services/difusion/canales/bluesky');
const { componerMensaje } = require('../src/services/difusion/plantilla');
const { ErrorCanal, ErrorMensaje } = require('../src/services/difusion/errores');
const { publicarNovedades } = require('../src/services/difusion');

const ENV = { BLUESKY_HANDLE: 'becamax.bsky.social', BLUESKY_APP_PASSWORD: 'xxxx-xxxx-xxxx-xxxx' };
const BECA = {
  id: 23, codigo_bdns: '904941', nombre: 'Becas Santander de ayuda al estudio', entidad: 'Universidad Internacional de Andalucía',
  importe: null, deadline: '2026-10-07', region: 'Andalucía', url: 'https://example.org/bases.pdf', created_at: '2026-09-20T06:00:00Z',
};

function blueskyFalso({ sesion = { status: 200 }, post = { status: 200 } } = {}) {
  const llamadas = [];
  const fetchImpl = async (url, init) => {
    const cuerpo = JSON.parse(init.body);
    llamadas.push({ url, cuerpo, auth: init.headers.Authorization });
    const esSesion = url.endsWith('com.atproto.server.createSession');
    const r = esSesion ? sesion : post;
    const body = r.body || (esSesion
      ? { accessJwt: 'jwt-falso', did: 'did:plc:becamax' }
      : { uri: 'at://did:plc:becamax/app.bsky.feed.post/3abc', cid: 'bafy' });
    return { ok: r.status < 300, status: r.status, json: async () => body };
  };
  return { llamadas, fetchImpl };
}

test.beforeEach(() => bluesky._reiniciarSesion());

test('bluesky: inicia sesión y publica el post con tarjeta del enlace, en español', async () => {
  const bs = blueskyFalso();
  const mensaje = componerMensaje(BECA, { canal: 'bluesky', limite: bluesky.limite, incluirEnlace: false });
  const r = await bluesky.publicar({ ...mensaje, beca: BECA }, { env: ENV, fetchImpl: bs.fetchImpl, ahora: Date.parse('2026-10-01T08:00:00Z') });

  assert.strictEqual(r.referencia, 'at://did:plc:becamax/app.bsky.feed.post/3abc');
  assert.deepStrictEqual(bs.llamadas[0].cuerpo, { identifier: 'becamax.bsky.social', password: 'xxxx-xxxx-xxxx-xxxx' });
  const { repo, collection, record } = bs.llamadas[1].cuerpo;
  assert.strictEqual(bs.llamadas[1].auth, 'Bearer jwt-falso');
  assert.strictEqual(repo, 'did:plc:becamax');
  assert.strictEqual(collection, 'app.bsky.feed.post');
  assert.deepStrictEqual(record.langs, ['es']);
  assert.ok(!record.text.includes('http'), 'el enlace va en la tarjeta, no en el texto');
  assert.strictEqual(record.embed.external.uri, 'https://becamax.vercel.app/pages/beca-detalle.html?id=23&utm_source=bluesky&utm_medium=social&utm_campaign=difusion');
  assert.strictEqual(record.embed.external.description, 'Plazo hasta el 07/10/2026 · Universidad Internacional de Andalucía · Andalucía');
});

test('bluesky: el texto nunca pasa de 300 caracteres', () => {
  const larga = { ...BECA, nombre: 'Convocatoria de becas y ayudas al estudio de carácter general '.repeat(8) };
  const { texto } = componerMensaje(larga, { canal: 'bluesky', limite: bluesky.limite, incluirEnlace: false });
  assert.ok([...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(texto)].length <= 300);
});

test('bluesky: la sesión se reutiliza entre publicaciones de la misma ejecución', async () => {
  const bs = blueskyFalso();
  const m = componerMensaje(BECA, { canal: 'bluesky', limite: 300, incluirEnlace: false });
  await bluesky.publicar({ ...m, beca: BECA }, { env: ENV, fetchImpl: bs.fetchImpl, ahora: 1000 });
  await bluesky.publicar({ ...m, beca: BECA }, { env: ENV, fetchImpl: bs.fetchImpl, ahora: 2000 });
  assert.strictEqual(bs.llamadas.filter((l) => l.url.endsWith('createSession')).length, 1);
});

test('bluesky: contraseña mala o límite de peticiones = error del canal; post inválido = error del mensaje', async () => {
  const m = componerMensaje(BECA, { canal: 'bluesky', limite: 300, incluirEnlace: false });
  const mala = blueskyFalso({ sesion: { status: 401, body: { error: 'AuthenticationRequired', message: 'Invalid identifier or password' } } });
  await assert.rejects(bluesky.publicar({ ...m, beca: BECA }, { env: ENV, fetchImpl: mala.fetchImpl }), ErrorCanal);

  bluesky._reiniciarSesion();
  const limite = blueskyFalso({ post: { status: 429, body: { error: 'RateLimitExceeded' } } });
  await assert.rejects(bluesky.publicar({ ...m, beca: BECA }, { env: ENV, fetchImpl: limite.fetchImpl }), ErrorCanal);

  bluesky._reiniciarSesion();
  const invalido = blueskyFalso({ post: { status: 400, body: { error: 'InvalidRequest', message: 'Invalid app.bsky.feed.post record' } } });
  await assert.rejects(bluesky.publicar({ ...m, beca: BECA }, { env: ENV, fetchImpl: invalido.fetchImpl }), ErrorMensaje);
});

test('bluesky: la contraseña no aparece nunca en los errores', async () => {
  const mala = blueskyFalso({ sesion: { status: 401, body: { error: 'AuthenticationRequired' } } });
  const m = componerMensaje(BECA, { canal: 'bluesky', limite: 300, incluirEnlace: false });
  await assert.rejects(bluesky.publicar({ ...m, beca: BECA }, { env: ENV, fetchImpl: mala.fetchImpl }),
    (err) => !err.message.includes(ENV.BLUESKY_APP_PASSWORD));
});

test('bluesky caído no impide publicar en Telegram (difusión completa)', async () => {
  const tablas = { becas: [BECA], difusion_publicaciones: [] };
  const supabase = {
    from(tabla) {
      const q = { filtros: [], op: 'select' };
      const api = {
        select() { return api; }, not() { return api; }, gte() { return api; }, order() { return api; }, limit() { return api; }, lt() { return api; }, in() { return api; },
        eq(c, v) { q.filtros.push((f) => f[c] === v); return api; },
        insert(fila) { q.op = 'insert'; q.fila = fila; return api; },
        update(c) { q.op = 'update'; q.campos = c; return api; },
        then(ok) {
          const t = tablas[tabla];
          if (q.op === 'insert') { t.push({ ...q.fila }); return Promise.resolve({ error: null }).then(ok); }
          const filas = t.filter((f) => q.filtros.every((fn) => fn(f)));
          if (q.op === 'update') filas.forEach((f) => Object.assign(f, q.campos));
          return Promise.resolve({ data: filas, error: null }).then(ok);
        },
      };
      return api;
    },
  };
  const fetchImpl = async (url) => {
    if (url.includes('bsky')) return { ok: false, status: 503, json: async () => ({ error: 'ServiceUnavailable' }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 7 } }) };
  };
  const env = { ...ENV, DIFUSION_TELEGRAM: 'on', DIFUSION_BLUESKY: 'on', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHANNEL_ID: '@c' };
  const r = await publicarNovedades(supabase, { env, fetchImpl, ahora: new Date('2026-10-01T08:00:00Z') });
  assert.strictEqual(r.canales.telegram.publicadas, 1);
  assert.ok(r.canales.bluesky.parado);
  assert.deepStrictEqual(tablas.difusion_publicaciones.map((p) => [p.canal, p.estado, p.intentos]).sort(),
    [['bluesky', 'error', 0], ['telegram', 'publicado', 1]]);
});
