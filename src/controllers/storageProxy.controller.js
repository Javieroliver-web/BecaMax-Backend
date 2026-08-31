// Proxy transparente hacia Supabase Storage, solo para el bucket de
// avatares (unico uso real del frontend). Mismo principio que dbProxy: la
// autorizacion la sigue haciendo la policy de Storage sobre el bucket, este
// proxy solo traduce la cookie httpOnly en el Authorization real.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const SKIP_HEADERS = new Set([
  'host', 'connection', 'content-length', 'cookie',
  'authorization', 'apikey', 'origin', 'referer'
]);

async function proxyStorage(req, res) {
  const [resourcePath] = req.url.slice(1).split('?');
  if (!resourcePath.startsWith('object/avatars/')) {
    return res.status(403).json({ status: 'error', message: 'Bucket no permitido' });
  }
  if (!req.accessToken) {
    return res.status(401).json({ status: 'error', message: 'No autenticado' });
  }

  const targetUrl = `${SUPABASE_URL}/storage/v1${req.url}`;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!SKIP_HEADERS.has(k) && typeof v === 'string') headers[k] = v;
  }
  headers['apikey'] = SUPABASE_ANON_KEY;
  headers['authorization'] = `Bearer ${req.accessToken}`;

  const init = { method: req.method, headers };
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    init.body = req.body;
  }

  try {
    const upstream = await fetch(targetUrl, init);
    const bodyText = await upstream.text();
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);
    res.send(bodyText);
  } catch (err) {
    res.status(502).json({ status: 'error', message: 'Error al conectar con el almacenamiento' });
  }
}

module.exports = { proxyStorage };
