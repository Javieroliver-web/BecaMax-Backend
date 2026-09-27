// Envío de correos del boletín con Resend.
//
// BOLETIN_FROM tiene que ser una dirección de un dominio VERIFICADO en
// Resend (p. ej. "BecaMax <boletin@tudominio.es>"). Sin dominio propio,
// Resend solo deja enviar a la dirección de la propia cuenta: por eso el
// boletín se queda apagado hasta que esté configurado.
const { Resend } = require('resend');

function crearCorreo(env = process.env) {
  if (!env.RESEND_API_KEY || !env.BOLETIN_FROM) return null;
  const resend = new Resend(env.RESEND_API_KEY);
  const from = env.BOLETIN_FROM;

  const comprobar = (respuesta) => {
    if (respuesta?.error) throw new Error(`Resend: ${respuesta.error.message || respuesta.error.name || 'error'}`);
    return respuesta?.data;
  };

  return {
    enviar: async (mensaje) => comprobar(await resend.emails.send({ from, ...mensaje })),
    enviarLote: async (mensajes) => comprobar(await resend.batch.send(mensajes.map((m) => ({ from, ...m })))),
  };
}

module.exports = { crearCorreo };
