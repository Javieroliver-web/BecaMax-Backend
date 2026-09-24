// "Descargar mis datos": derechos de acceso y portabilidad (arts. 15 y 20 RGPD).
//
// De QUIÉN son los datos lo decide SIEMPRE req.user.id, que sale del token de
// sesión ya verificado contra Supabase Auth (middleware attachUser). Nada de la
// petición puede cambiarlo. Es justo lo que le faltaba al portal de derechos
// de Vesta, donde el usuarioId venía en el cuerpo y cualquiera podía pedir los
// datos (o el borrado) de otro (revisión del 24/09/2026).
//
// - Las tablas que el usuario ya puede leer se consultan CON SU TOKEN: RLS
//   garantiza que solo salen sus filas.
// - eventos_embudo y system_logs solo las lee el admin por RLS, pero también
//   son datos suyos (art. 15): se leen con la clave de servicio, filtrando por
//   su id verificado y nada más.
const { getSupabaseAsUser } = require('../config/supabaseAnon');
const supabaseServicio = require('../config/supabase');
const { serverError } = require('../utils/serverError');
const { withTimeout } = require('../utils/withTimeout');

const TABLAS_PROPIAS = ['perfiles', 'favoritos', 'filtros_guardados', 'notificaciones', 'incidencias'];
const TABLAS_ADMIN = { eventos_embudo: 'pasos_de_uso', system_logs: 'registro_de_accesos' };
const MAXIMO_FILAS = 10000;

async function leer(consulta, nombre) {
  const { data, error } = await withTimeout(consulta, 10000, `mis-datos: ${nombre}`);
  if (error) throw Object.assign(new Error(`${nombre}: ${error.message}`), { cause: error });
  return data || [];
}

async function exportar(req, res) {
  try {
    const usuario = req.user;               // requireAuth garantiza que existe
    const comoUsuario = getSupabaseAsUser(req.accessToken);

    const datos = {};
    for (const tabla of TABLAS_PROPIAS) {
      // Sin filtro por usuario a propósito: lo pone RLS. Si una política se
      // abriera por error, el test de la ruta lo detectaría (ver tests/).
      datos[tabla] = await leer(comoUsuario.from(tabla).select('*').limit(MAXIMO_FILAS), tabla);
    }
    for (const [tabla, clave] of Object.entries(TABLAS_ADMIN)) {
      datos[clave] = await leer(
        supabaseServicio.from(tabla).select('*').eq('user_id', usuario.id).limit(MAXIMO_FILAS), tabla);
    }

    const [perfil] = datos.perfiles;
    delete datos.perfiles;
    const exportacion = {
      servicio: 'BecaMax',
      generado: new Date().toISOString(),
      explicacion: 'Todos los datos personales que BecaMax guarda sobre ti (derechos de acceso y '
        + 'portabilidad, arts. 15 y 20 del RGPD). Si ves algo incorrecto, puedes corregirlo desde tu '
        + 'perfil o escribir a la dirección que figura en la política de privacidad.',
      cuenta: {
        id: usuario.id,
        email: usuario.email,
        creada: usuario.created_at,
        ultimo_acceso: usuario.last_sign_in_at,
        acceso_con: usuario.app_metadata?.providers || [usuario.app_metadata?.provider].filter(Boolean),
        nombre: usuario.user_metadata?.nombre || usuario.user_metadata?.full_name || null,
      },
      perfil: perfil || null,
      ...datos,
    };

    const fecha = new Date().toISOString().slice(0, 10);
    res.set('Content-Disposition', `attachment; filename="becamax-mis-datos-${fecha}.json"`);
    res.set('Cache-Control', 'no-store');   // datos personales: que no se guarden en cachés
    res.type('application/json').send(JSON.stringify(exportacion, null, 2));
  } catch (err) {
    return serverError(res, err, 'misDatos.exportar');
  }
}

module.exports = { exportar };
