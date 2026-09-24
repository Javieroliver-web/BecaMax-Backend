// Proxy hacia PostgREST (Supabase) para las tablas que antes llamaba el
// frontend directamente. Convierte la cookie httpOnly en la cabecera
// Authorization real; la autorización de las FILAS la sigue haciendo RLS.
//
// Lo que sí decide este proxy (24/09/2026, decisión de Javier: "los usuarios
// no deberían poder hacer nada directamente"): QUÉ OPERACIONES existen. Solo
// pasan las que hace la web con sus botones — tabla, método y campos —, así
// que alguien que use la API a mano no puede escribir campos que la web no
// toca (p. ej. `rol`) ni lanzar un borrado/edición sin filtro. Si la web
// empieza a hacer algo nuevo con la base de datos, hay que añadirlo aquí.
//
//   lectura: GET/HEAD permitidos (RLS decide qué filas ve cada uno).
//   escribe: método → campos que se pueden enviar ([] = sin cuerpo).
//   valores: campo → valores admitidos, cuando la web solo envía uno fijo.
const PERMISOS = {
  perfiles: {
    lectura: true,
    escribe: {
      // perfil.js (estudios, datos para recomendar, foto) y admin.js (bloquear).
      PATCH: ['tipo_estudio', 'region', 'area', 'provincia', 'curso_actual', 'centro_educativo',
        'fecha_nacimiento', 'renta_familiar_anual', 'avatar_url', 'estado'],
    },
  },
  favoritos: {
    lectura: true,
    escribe: { POST: ['user_id', 'beca_id'], DELETE: [] },
  },
  filtros_guardados: {
    lectura: true,
    escribe: { POST: ['user_id', 'nombre', 'filtros', 'activo'], PATCH: ['activo', 'nombre'], DELETE: [] },
  },
  notificaciones: {
    lectura: true,
    escribe: { PATCH: ['leida'] },
  },
  incidencias: {
    lectura: true,
    escribe: { POST: ['user_id', 'tipo', 'descripcion', 'estado'], PATCH: ['estado'] },
    valores: { POST: { estado: ['pendiente'] } },
  },
  system_logs: {
    lectura: true,
    escribe: { POST: ['admin_id', 'user_id', 'action', 'details'] },
  },
  noticias: { lectura: true, escribe: {} },
  eventos_embudo: {
    lectura: true,
    escribe: { POST: ['evento', 'meta', 'user_id', 'analytics_id'] },
  },
  'rpc/delete_my_account': { lectura: false, escribe: { POST: [] } },
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// No reenviar: cabeceras de la conexion navegador->nuestro servidor, y las
// que sobreescribimos nosotros con el valor derivado de la cookie.
const SKIP_HEADERS = new Set([
  'host', 'connection', 'content-length', 'cookie',
  'authorization', 'apikey', 'origin', 'referer'
]);

// Devuelve el motivo del rechazo, o null si la operación es de las de la web.
function motivoDeRechazo(recurso, method, query, body) {
  const permiso = Object.prototype.hasOwnProperty.call(PERMISOS, recurso) ? PERMISOS[recurso] : null;
  if (!permiso) return 'Recurso no permitido';

  if (method === 'GET' || method === 'HEAD') {
    return permiso.lectura ? null : 'Operación no permitida';
  }

  const campos = permiso.escribe[method];
  if (!campos) return 'Operación no permitida';

  // Editar o borrar siempre sobre filas concretas (la web siempre filtra por
  // un id o por el usuario): nunca "todas las que la RLS me deje".
  if ((method === 'PATCH' || method === 'DELETE') &&
      !Object.values(query).some((v) => typeof v === 'string' && v.startsWith('eq.'))) {
    return 'Falta indicar sobre qué registro se actúa';
  }

  const filas = Array.isArray(body) ? body : [body || {}];
  const valores = (permiso.valores && permiso.valores[method]) || {};
  for (const fila of filas) {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) return 'Datos no válidos';
    for (const [campo, valor] of Object.entries(fila)) {
      if (!campos.includes(campo)) return 'Campo no permitido';
      if (valores[campo] && !valores[campo].includes(valor)) return 'Valor no permitido';
    }
  }
  return null;
}

async function proxyDb(req, res) {
  const [resourcePath] = req.url.slice(1).split('?'); // quita la "/" inicial y la query
  const motivo = motivoDeRechazo(resourcePath, req.method, req.query || {}, req.body);
  if (motivo) {
    return res.status(403).json({ status: 'error', message: motivo });
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

module.exports = { proxyDb, motivoDeRechazo, PERMISOS };
