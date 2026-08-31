// Proxy transparente hacia PostgREST (Supabase) para las tablas que antes
// llamaba el frontend directamente. El unico trabajo de este proxy es
// convertir la cookie httpOnly en la cabecera Authorization real -- la
// autorizacion de verdad la sigue haciendo RLS en Postgres exactamente
// igual que antes, este backend no reimplementa ninguna regla de permisos.
const ALLOWED_PREFIXES = [
  'perfiles', 'favoritos', 'filtros_guardados', 'notificaciones',
  'incidencias', 'system_logs', 'noticias', 'eventos_embudo',
  'rpc/delete_my_account'
];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// No reenviar: cabeceras de la conexion navegador->nuestro servidor, y las
// que sobreescribimos nosotros con el valor derivado de la cookie.
const SKIP_HEADERS = new Set([
  'host', 'connection', 'content-length', 'cookie',
  'authorization', 'apikey', 'origin', 'referer'
]);

async function proxyDb(req, res) {
  const [resourcePath] = req.url.slice(1).split('?'); // quita la "/" inicial y la query
  const allowed = ALLOWED_PREFIXES.some(p => resourcePath === p || resourcePath.startsWith(p + '/'));
  if (!allowed) {
    return res.status(403).json({ status: 'error', message: 'Recurso no permitido' });
  }

  const targetUrl = `${SUPABASE_URL}/rest/v1${req.url}`;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!SKIP_HEADERS.has(k) && typeof v === 'string') headers[k] = v;
  }
  headers['apikey'] = SUPABASE_ANON_KEY;
  // Sin sesion (ej. incidencias anonimas): mismo comportamiento que el
  // cliente de Supabase en el navegador cuando no hay sesion, que tambien
  // usa la anon key como Authorization por defecto.
  headers['authorization'] = `Bearer ${req.accessToken || SUPABASE_ANON_KEY}`;

  const init = { method: req.method, headers };
  const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body && Object.keys(req.body).length > 0;
  if (hasBody) {
    init.body = JSON.stringify(req.body);
    headers['content-type'] = 'application/json';
  }

  try {
    const upstream = await fetch(targetUrl, init);
    const bodyText = await upstream.text();

    res.status(upstream.status);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.set('Content-Range', contentRange);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);
    res.send(bodyText);
  } catch (err) {
    res.status(502).json({ status: 'error', message: 'Error al conectar con la base de datos' });
  }
}

module.exports = { proxyDb };
