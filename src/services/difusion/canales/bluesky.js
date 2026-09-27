// ============================================================
//  CANAL BLUESKY: un post por beca con tarjeta del enlace.
//  Variables: BLUESKY_HANDLE (p. ej. becamax.bsky.social) y
//  BLUESKY_APP_PASSWORD (contraseña de aplicación, NUNCA la de la cuenta).
//  BLUESKY_SERVICE es opcional (por defecto https://bsky.social).
//
//  XRPC con fetch, sin @atproto/api: son dos llamadas y así no entra una
//  dependencia grande. El enlace va en la tarjeta (app.bsky.embed.external),
//  no en el texto: así el texto tiene los 300 caracteres para los datos y
//  no hace falta calcular facets en bytes UTF-8.
// ============================================================

const { ErrorCanal, ErrorMensaje } = require('../errores');
const { formatearFecha } = require('../plantilla');

const nombre = 'bluesky';
const limite = 300; // grafemas (app.bsky.feed.post#text maxGraphemes)
const SESION_MS = 10 * 60 * 1000;

let sesion = null; // { clave, accessJwt, did, caduca }

function credenciales(env = process.env) {
  const handle = env.BLUESKY_HANDLE;
  const password = env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) return null;
  return { handle, password, servicio: (env.BLUESKY_SERVICE || 'https://bsky.social').replace(/\/+$/, '') };
}

async function llamar(fetchImpl, url, cuerpo, token) {
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new ErrorCanal(`red: ${err.name === 'TimeoutError' ? 'tiempo agotado' : 'sin conexión con Bluesky'}`);
  }
  let datos = {};
  try { datos = await res.json(); } catch { /* respuesta no JSON */ }
  return { res, datos };
}

const describir = (res, datos) => `HTTP ${res.status}: ${String(datos.error || '')} ${String(datos.message || '').slice(0, 200)}`.trim();

async function iniciarSesion(cred, fetchImpl, ahora) {
  const clave = `${cred.servicio}|${cred.handle}`;
  if (sesion && sesion.clave === clave && sesion.caduca > ahora) return sesion;
  const { res, datos } = await llamar(fetchImpl, `${cred.servicio}/xrpc/com.atproto.server.createSession`,
    { identifier: cred.handle, password: cred.password });
  if (!res.ok || !datos.accessJwt || !datos.did) {
    sesion = null;
    throw new ErrorCanal(`no se pudo iniciar sesión (${describir(res, datos)})`);
  }
  sesion = { clave, accessJwt: datos.accessJwt, did: datos.did, caduca: ahora + SESION_MS };
  return sesion;
}

// Tarjeta del enlace: solo datos reales de la beca.
function tarjeta(beca, enlace) {
  const plazo = formatearFecha(beca.deadline);
  const partes = [plazo && `Plazo hasta el ${plazo}`, beca.entidad, beca.region].filter(Boolean);
  return {
    $type: 'app.bsky.embed.external',
    external: {
      uri: enlace,
      title: String(beca.nombre || 'Beca en BecaMax').slice(0, 300),
      description: partes.join(' · ').slice(0, 1000),
    },
  };
}

async function publicar({ texto, enlace, beca }, { env = process.env, fetchImpl = fetch, ahora = Date.now() } = {}) {
  const cred = credenciales(env);
  if (!cred) throw new ErrorCanal('faltan BLUESKY_HANDLE o BLUESKY_APP_PASSWORD');

  const s = await iniciarSesion(cred, fetchImpl, ahora);
  const { res, datos } = await llamar(fetchImpl, `${cred.servicio}/xrpc/com.atproto.repo.createRecord`, {
    repo: s.did,
    collection: 'app.bsky.feed.post',
    record: {
      $type: 'app.bsky.feed.post',
      text: texto,
      langs: ['es'],
      embed: tarjeta(beca, enlace),
      createdAt: new Date(ahora).toISOString(),
    },
  }, s.accessJwt);

  if (res.ok && datos.uri) return { referencia: String(datos.uri) };
  if (res.status === 401) sesion = null; // sesión caducada: se renueva la próxima vez
  // 400 InvalidRequest = el propio post no es válido (reintentar esa beca).
  // 401, 429, 5xx = problema del canal.
  if (res.status === 400 && datos.error === 'InvalidRequest') throw new ErrorMensaje(describir(res, datos));
  throw new ErrorCanal(describir(res, datos));
}

// Solo para tests: olvida la sesión guardada.
const _reiniciarSesion = () => { sesion = null; };

module.exports = { nombre, limite, incluirEnlace: false, credenciales, publicar, tarjeta, _reiniciarSesion };
