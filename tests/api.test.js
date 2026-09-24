'use strict';
// Primeros tests del backend (node --test, sin dependencias nuevas).
//
// Se arranca la app de verdad en un puerto libre y SUPABASE_URL apunta a un
// Supabase FALSO local que apunta lo que le llega: así se comprueba qué pasa
// el proxy hacia la base de datos sin tocar la de verdad. Las variables se
// fijan ANTES de cargar la app: dotenv no pisa las que ya existen, así que el
// .env real no se usa.
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const recibidas = [];
let respuestaFalsa = { status: 200, body: '[{"id":1}]', headers: { 'content-range': '0-0/1' } };

const supabaseFalso = http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (c) => { cuerpo += c; });
  req.on('end', () => {
    recibidas.push({ method: req.method, url: req.url, headers: req.headers, cuerpo });
    if (req.url.startsWith('/auth/v1/user')) {
      // Cualquier token es inválido para el Supabase falso.
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end('{"message":"invalid JWT"}');
    }
    res.writeHead(respuestaFalsa.status, { 'content-type': 'application/json', ...respuestaFalsa.headers });
    res.end(respuestaFalsa.body);
  });
});

let base;
let servidorApp;

test.before(async () => {
  await new Promise((ok) => supabaseFalso.listen(0, '127.0.0.1', ok));
  Object.assign(process.env, {
    SUPABASE_URL: `http://127.0.0.1:${supabaseFalso.address().port}`,
    SUPABASE_ANON_KEY: 'clave-anonima-de-prueba',
    SUPABASE_SERVICE_KEY: 'clave-servicio-de-prueba',
    FRONTEND_URL: 'https://becamax.vercel.app',
    DISCORD_WEBHOOK_URL: '',
    RESEND_API_KEY: '',
    VERCEL: '1',
  });
  const app = require('../src/app');
  servidorApp = app.listen(0, '127.0.0.1');
  await new Promise((ok) => servidorApp.once('listening', ok));
  base = `http://127.0.0.1:${servidorApp.address().port}`;
});

test.after(() => {
  servidorApp?.close();
  supabaseFalso.close();
});

test.beforeEach(() => {
  recibidas.length = 0;
  respuestaFalsa = { status: 200, body: '[{"id":1}]', headers: { 'content-range': '0-0/1' } };
});

const ESCRITURA = { 'x-becamax-client': '1', 'content-type': 'application/json' };

test('CORS con credenciales solo para el frontend de BecaMax', async () => {
  // Si cualquier web recibiera Access-Control-Allow-Origin con credenciales,
  // podría leer los datos de un usuario usando su sesión.
  const bueno = await fetch(`${base}/api/no-existe`, { headers: { origin: 'https://becamax.vercel.app' } });
  assert.strictEqual(bueno.headers.get('access-control-allow-origin'), 'https://becamax.vercel.app');
  assert.strictEqual(bueno.headers.get('access-control-allow-credentials'), 'true');

  for (const origen of ['https://evil.example', 'https://becamax.vercel.app.evil.example', 'null']) {
    const malo = await fetch(`${base}/api/no-existe`, { headers: { origin: origen } });
    assert.strictEqual(malo.headers.get('access-control-allow-origin'), null, origen);
  }
});

test('las rutas de administración exigen una sesión válida', async () => {
  const peticiones = [
    ['DELETE', '/api/admin/users/otro-usuario'],
    ['POST', '/api/admin/news'],
    ['DELETE', '/api/admin/news'],
  ];
  // Cuerpo bien formado: postNews valida el contenido ANTES que la sesión
  // (400), y lo que se quiere probar aquí es la sesión.
  const cuerpo = JSON.stringify({ content: 'noticia de prueba', id: 1 });
  for (const [method, ruta] of peticiones) {
    const sinSesion = await fetch(`${base}${ruta}`, { method, headers: ESCRITURA, body: cuerpo });
    assert.strictEqual(sinSesion.status, 401, `${method} ${ruta} sin sesión`);
    const falsa = await fetch(`${base}${ruta}`, {
      method, headers: { ...ESCRITURA, cookie: 'sb-access-token=inventado' }, body: cuerpo,
    });
    assert.strictEqual(falsa.status, 401, `${method} ${ruta} con un token inventado`);
  }
  // Solo se preguntó a Auth por el token; nada llegó a las tablas.
  assert.ok(recibidas.every((x) => x.url.startsWith('/auth/v1/user')));
});

test('una ruta que no existe da 404 en JSON', async () => {
  const r = await fetch(`${base}/api/no-existe`);
  assert.strictEqual(r.status, 404);
  assert.match(r.headers.get('content-type'), /json/);
});

test('el proxy solo deja pasar las tablas permitidas', async () => {
  for (const ruta of ['/api/db/becas_secretas', '/api/db/perfilesX', '/api/db/rpc/is_admin']) {
    const r = await fetch(`${base}${ruta}`);
    assert.strictEqual(r.status, 403, ruta);
  }
  assert.strictEqual(recibidas.length, 0, 'nada debe llegar a la base de datos');
});

test('una lectura permitida llega a PostgREST con la clave anónima y sin cookies', async () => {
  const r = await fetch(`${base}/api/db/favoritos?select=*`, {
    headers: { cookie: 'otra=cosa', origin: 'https://evil.example' },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(await r.text(), '[{"id":1}]');
  assert.strictEqual(r.headers.get('content-range'), '0-0/1');

  const [llegada] = recibidas;
  assert.strictEqual(llegada.url, '/rest/v1/favoritos?select=*');
  assert.strictEqual(llegada.headers.apikey, 'clave-anonima-de-prueba');
  assert.strictEqual(llegada.headers.authorization, 'Bearer clave-anonima-de-prueba');
  assert.strictEqual(llegada.headers.cookie, undefined, 'las cookies del navegador no se reenvían');
});

test('sin la cabecera propia, una escritura se rechaza (defensa CSRF)', async () => {
  const r = await fetch(`${base}/api/db/incidencias`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"tipo":"x"}',
  });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(recibidas.length, 0);
});

test('con la cabecera propia, la escritura llega con su cuerpo', async () => {
  respuestaFalsa = { status: 201, body: '', headers: {} };
  const r = await fetch(`${base}/api/db/incidencias`, {
    method: 'POST', headers: ESCRITURA, body: JSON.stringify({ tipo: 'error', descripcion: 'no carga' }),
  });
  assert.strictEqual(r.status, 201);
  const escritura = recibidas.find((x) => x.method === 'POST');
  assert.deepStrictEqual(JSON.parse(escritura.cuerpo), { tipo: 'error', descripcion: 'no carga' });
});

test('una cookie de sesión falsa no se hace pasar por el usuario', async () => {
  const r = await fetch(`${base}/api/db/perfiles?select=*`, {
    headers: { cookie: 'sb-access-token=token-inventado' },
  });
  assert.strictEqual(r.status, 200);
  const lectura = recibidas.find((x) => x.url.startsWith('/rest/v1/perfiles'));
  assert.strictEqual(lectura.headers.authorization, 'Bearer clave-anonima-de-prueba',
    'con un token que Supabase rechaza, se usa la clave anónima, no el token');
});

test('si la base de datos no responde, 502 genérico y sin detalles internos', async () => {
  const puerto = supabaseFalso.address().port;
  supabaseFalso.close();
  try {
    const r = await fetch(`${base}/api/db/noticias?select=*`);
    assert.strictEqual(r.status, 502);
    const cuerpo = await r.text();
    assert.doesNotMatch(cuerpo, /ECONNREFUSED|at \w+ \(|node:internal|127\.0\.0\.1/);
  } finally {
    await new Promise((ok) => supabaseFalso.listen(puerto, '127.0.0.1', ok));
  }
});
