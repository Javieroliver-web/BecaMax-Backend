const { notifyDiscord } = require('./discordAlert');

// Respuesta 500 que NO filtra detalles internos al navegador.
//
// Antes los controladores devolvian `err.message` tal cual: textos de
// PostgREST, de la red o de Supabase Auth que dicen a quien este mirando
// que tablas, servicios o librerias hay detras (revision de seguridad del
// 23/09/2026, criterio "los errores no filtran informacion interna").
// El detalle completo sigue sin perderse: va a los logs y a Discord.
async function serverError(res, err, contexto) {
  console.error(`[${contexto}]`, err);
  try {
    await notifyDiscord(`API: error en ${contexto}`, { error: err });
  } catch {
    // avisar es best-effort: nunca debe tapar la respuesta al usuario
  }
  if (res.headersSent) return;
  res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
}

module.exports = { serverError };
