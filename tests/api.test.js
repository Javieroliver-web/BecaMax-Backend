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
      // Solo hay una sesión válida: la de «javi». Cualquier otro token, 401.
      if (req.headers.authorization === 'Bearer token-de-javi') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({
          id: 'id-de-javi', email: 'javi@example.com', aud: 'authenticated', role: 'authenticated',
          created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {},
        }));
      }
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

// ── Descargar mis datos (arts. 15 y 20 RGPD) ─────────────────────────────────

const SESION_JAVI = { cookie: 'sb-access-token=token-de-javi' };

test('descargar mis datos exige sesión', async () => {
  assert.strictEqual((await fetch(`${base}/api/auth/mis-datos`)).status, 401);
  const falsa = await fetch(`${base}/api/auth/mis-datos`, { headers: { cookie: 'sb-access-token=inventado' } });
  assert.strictEqual(falsa.status, 401);
  assert.ok(recibidas.every((x) => x.url.startsWith('/auth/v1/user')), 'sin sesión no se lee ninguna tabla');
});

test('descargar mis datos: solo los tuyos, aunque la petición diga otra cosa', async () => {
  // Intento de pedir los de otro por todas las vías que usaba Vesta.
  const r = await fetch(`${base}/api/auth/mis-datos?user_id=id-de-otro&usuarioId=id-de-otro`, {
    headers: { ...SESION_JAVI, 'x-user-id': 'id-de-otro' },
  });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="becamax-mis-datos-\d{4}-\d\d-\d\d\.json"/);
  assert.strictEqual(r.headers.get('cache-control'), 'no-store');
  const datos = await r.json();
  assert.strictEqual(datos.cuenta.id, 'id-de-javi');
  assert.strictEqual(datos.cuenta.email, 'javi@example.com');

  const consultas = recibidas.filter((x) => x.url.startsWith('/rest/v1/'));
  const tabla = (x) => x.url.split('?')[0].replace('/rest/v1/', '');
  // Las suyas, con SU token: RLS pone el filtro.
  for (const t of ['perfiles', 'favoritos', 'filtros_guardados', 'notificaciones', 'incidencias']) {
    const c = consultas.find((x) => tabla(x) === t);
    assert.ok(c, `falta ${t}`);
    assert.strictEqual(c.headers.authorization, 'Bearer token-de-javi', t);
  }
  // Las de admin, con la clave de servicio pero filtradas por SU id verificado.
  for (const t of ['eventos_embudo', 'system_logs']) {
    const c = consultas.find((x) => tabla(x) === t);
    assert.ok(c, `falta ${t}`);
    assert.strictEqual(c.headers.authorization, 'Bearer clave-servicio-de-prueba', t);
    assert.match(decodeURIComponent(c.url), /user_id=eq\.id-de-javi/, t);
  }
  assert.ok(!consultas.some((x) => decodeURIComponent(x.url).includes('id-de-otro')),
    'nada de la petición puede apuntar a otro usuario');
});

test('si falla la base de datos, 500 genérico sin detalles', async () => {
  respuestaFalsa = { status: 500, body: '{"message":"relation secreta does not exist"}', headers: {} };
  const r = await fetch(`${base}/api/auth/mis-datos`, { headers: SESION_JAVI });
  assert.strictEqual(r.status, 500);
  assert.doesNotMatch(await r.text(), /secreta|relation/);
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
