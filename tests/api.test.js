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

// ── Registro del consentimiento de cookies (RGPD art. 7.1) ───────────────────

const CONSENTIMIENTO = {
  consent_id: '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b', analisis: true, marketing: false,
  accion: 'personalizar', version_politica: '2026-09',
};

test('el consentimiento se guarda con la clave de servicio, sin IP y sin usuario', async () => {
  respuestaFalsa = { status: 201, body: '', headers: {} };
  const r = await fetch(`${base}/api/consentimiento`, {
    method: 'POST', headers: { ...ESCRITURA, 'user-agent': 'Navegador de prueba', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ ...CONSENTIMIENTO, ip: '1.2.3.4', user_id: 'id-de-otro' }),
  });
  assert.strictEqual(r.status, 201);
  const insercion = recibidas.find((x) => x.method === 'POST' && x.url.startsWith('/rest/v1/consentimientos_cookies'));
  assert.ok(insercion, 'no llegó la inserción');
  assert.strictEqual(insercion.headers.authorization, 'Bearer clave-servicio-de-prueba');
  const [fila] = JSON.parse(insercion.cuerpo);
  assert.deepStrictEqual(Object.keys(fila).sort(),
    ['accion', 'analisis', 'consent_id', 'marketing', 'user_agent', 'version_politica']);
  assert.strictEqual(fila.user_agent, 'Navegador de prueba');
  assert.ok(!JSON.stringify(fila).includes('203.0.113.9') && !JSON.stringify(fila).includes('1.2.3.4'), 'sin IP');
  // Y se borran los de hace más de 24 meses.
  assert.ok(recibidas.some((x) => x.method === 'DELETE' && decodeURIComponent(x.url).includes('creado=lt.')));
});

test('un consentimiento mal formado se rechaza sin tocar la base de datos', async () => {
  const malos = [
    { ...CONSENTIMIENTO, consent_id: 'no-es-un-uuid' },
    { ...CONSENTIMIENTO, analisis: 'true' },
    { ...CONSENTIMIENTO, accion: 'borrar_todo' },
    { ...CONSENTIMIENTO, version_politica: '2026-09; drop table' },
  ];
  for (const cuerpo of malos) {
    const r = await fetch(`${base}/api/consentimiento`, { method: 'POST', headers: ESCRITURA, body: JSON.stringify(cuerpo) });
    assert.strictEqual(r.status, 400, JSON.stringify(cuerpo));
  }
  const sinCabecera = await fetch(`${base}/api/consentimiento`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(CONSENTIMIENTO),
  });
  assert.strictEqual(sinCabecera.status, 403, 'un <form> de otra web no puede registrar elecciones');
  assert.ok(!recibidas.some((x) => x.url.startsWith('/rest/v1/consentimientos_cookies')));
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

// ── Solo las operaciones que hace la web (24/09/2026) ────────────────────────

test('el proxy rechaza lo que la web nunca hace, sin tocar la base de datos', async () => {
  const intentos = [
    ['PATCH', '/api/db/perfiles?user_id=eq.id-de-javi', { rol: 'admin' }, 'hacerse admin'],
    ['POST', '/api/db/perfiles', { user_id: 'id-de-javi', rol: 'admin' }, 'crear un perfil'],
    ['DELETE', '/api/db/perfiles?user_id=eq.id-de-javi', null, 'borrar el perfil'],
    ['PATCH', '/api/db/filtros_guardados', { activo: false }, 'editar sin filtro'],
    ['DELETE', '/api/db/favoritos', null, 'borrar sin filtro'],
    ['DELETE', '/api/db/notificaciones?id=eq.1', null, 'borrar notificaciones'],
    ['POST', '/api/db/noticias', { content: 'x' }, 'publicar noticias'],
    ['POST', '/api/db/incidencias', { tipo: 'error', descripcion: 'x', estado: 'resuelta' }, 'incidencia ya resuelta'],
    ['PATCH', '/api/db/notificaciones?id=eq.1', { leida: true, user_id: 'id-de-otro' }, 'mover una notificación'],
    ['POST', '/api/db/favoritos', [{ user_id: 'a', beca_id: 1 }, 'no es una fila'], 'fila mal formada'],
    ['GET', '/api/db/rpc/delete_my_account', null, 'la RPC por GET'],
  ];
  for (const [method, ruta, cuerpo, caso] of intentos) {
    const r = await fetch(`${base}${ruta}`, {
      method, headers: ESCRITURA, body: cuerpo === null ? undefined : JSON.stringify(cuerpo),
    });
    assert.strictEqual(r.status, 403, caso);
  }
  assert.strictEqual(recibidas.length, 0, 'nada debe llegar a la base de datos');
});

test('las operaciones de la web siguen pasando', async () => {
  respuestaFalsa = { status: 201, body: '', headers: {} };
  const operaciones = [
    ['PATCH', '/api/db/perfiles?user_id=eq.id-de-javi', { tipo_estudio: 'FP', region: 'andalucia', area: 'ciencias' }],
    ['PATCH', '/api/db/perfiles?user_id=eq.id-de-javi', { avatar_url: 'https://ejemplo/foto.png' }],
    ['POST', '/api/db/favoritos?on_conflict=user_id%2Cbeca_id', { user_id: 'id-de-javi', beca_id: 7 }],
    ['DELETE', '/api/db/favoritos?user_id=eq.id-de-javi&beca_id=eq.7', null],
    ['POST', '/api/db/filtros_guardados', [{ user_id: 'id-de-javi', nombre: 'FP', filtros: {}, activo: true }]],
    ['PATCH', '/api/db/filtros_guardados?id=eq.3', { nombre: 'Nuevo nombre' }],
    ['DELETE', '/api/db/filtros_guardados?id=eq.3', null],
    ['PATCH', '/api/db/notificaciones?user_id=eq.id-de-javi&leida=eq.false', { leida: true }],
    ['POST', '/api/db/incidencias', [{ user_id: null, tipo: 'error', descripcion: 'no carga', estado: 'pendiente' }]],
    ['POST', '/api/db/eventos_embudo', [{ evento: 'ver_beca', meta: {}, user_id: null, analytics_id: 'x' }]],
    ['POST', '/api/db/rpc/delete_my_account', null],
  ];
  for (const [method, ruta, cuerpo] of operaciones) {
    const r = await fetch(`${base}${ruta}`, {
      method, headers: ESCRITURA, body: cuerpo === null ? undefined : JSON.stringify(cuerpo),
    });
    assert.strictEqual(r.status, 201, `${method} ${ruta}`);
  }
  assert.strictEqual(recibidas.length, operaciones.length);
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

test('una cuenta bloqueada pierde la sesión que ya tenía abierta', async () => {
  // Bloquear desde el panel solo cambia perfiles.estado: sin esta comprobación,
  // quien ya estaba dentro seguía dentro (el refresco renovaba la cookie).
  // Con .single() PostgREST devuelve un objeto, no una lista.
  respuestaFalsa = { status: 200, body: '{"estado":"bloqueado"}', headers: {} };
  const r = await fetch(`${base}/api/auth/session`, { headers: { cookie: 'sb-access-token=token-de-javi' } });
  const cuerpo = await r.json();
  assert.strictEqual(cuerpo.data.session, null);
  assert.ok(r.headers.getSetCookie().some((c) => c.startsWith('sb-access-token=;')), 'debe borrar la cookie');
  assert.ok(recibidas.some((q) => q.url.startsWith('/auth/v1/logout')), 'debe revocar la sesión en Supabase');
});

test('una cuenta activa conserva la sesión', async () => {
  respuestaFalsa = { status: 200, body: '{"estado":"activo"}', headers: {} };
  const r = await fetch(`${base}/api/auth/session`, { headers: { cookie: 'sb-access-token=token-de-javi' } });
  const cuerpo = await r.json();
  assert.strictEqual(cuerpo.data.session.user.id, 'id-de-javi');
  assert.ok(!recibidas.some((q) => q.url.startsWith('/auth/v1/logout')));
});

test('cerrar sesión revoca la sesión en Supabase, no solo borra las cookies', async () => {
  const r = await fetch(`${base}/api/auth/logout`, {
    method: 'POST', headers: { ...ESCRITURA, cookie: 'sb-access-token=token-de-javi' },
  });
  assert.strictEqual(r.status, 200);
  const logout = recibidas.find((q) => q.url.startsWith('/auth/v1/logout'));
  assert.ok(logout, 'debe llamar a /auth/v1/logout');
  assert.strictEqual(logout.headers.authorization, 'Bearer token-de-javi');
  assert.match(logout.url, /scope=local/);
});

test('cambiar nombre o contraseña llega a Supabase con el token del usuario', async () => {
  respuestaFalsa = { status: 200, body: '{"id":"id-de-javi","user_metadata":{"full_name":"Javi"}}', headers: {} };
  const r = await fetch(`${base}/api/auth/update-user`, {
    method: 'POST',
    headers: { ...ESCRITURA, cookie: 'sb-access-token=token-de-javi' },
    body: JSON.stringify({ data: { full_name: ' Javi ' }, email: 'otro@example.com' }),
  });
  assert.strictEqual(r.status, 200, await r.clone().text());
  const put = recibidas.find((q) => q.method === 'PUT' && q.url.startsWith('/auth/v1/user'));
  assert.ok(put, 'debe llamar a PUT /auth/v1/user');
  assert.strictEqual(put.headers.authorization, 'Bearer token-de-javi');
  assert.deepStrictEqual(JSON.parse(put.cuerpo), { data: { full_name: 'Javi' } }, 'solo lo permitido');
});
