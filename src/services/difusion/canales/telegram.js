// ============================================================
//  CANAL TELEGRAM: sendMessage de la Bot API a un canal público.
//  Variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID (@nombre o -100…).
//  Sin dependencias: fetch de Node 22.
// ============================================================

const { ErrorCanal, ErrorMensaje } = require('../errores');

const nombre = 'telegram';
const limite = 4096; // límite de sendMessage

function credenciales(env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHANNEL_ID;
  return token && chatId ? { token, chatId } : null;
}

// Errores que dependen del mensaje concreto (reintentar ESA beca tiene
// sentido). Todo lo demás (token malo, bot fuera del canal, 429, 5xx, red)
// es un problema del canal: se para el canal sin gastar intentos de la beca.
const ERRORES_DE_MENSAJE = /message is too long|can't parse entities|text must be non-empty/i;

async function publicar({ texto }, { env = process.env, fetchImpl = fetch } = {}) {
  const cred = credenciales(env);
  if (!cred) throw new ErrorCanal('faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHANNEL_ID');

  let res;
  try {
    res = await fetchImpl(`https://api.telegram.org/bot${cred.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cred.chatId, text: texto }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    // El mensaje de fetch no incluye la URL, pero por si acaso no se reenvía
    // nada que pueda contener el token.
    throw new ErrorCanal(`red: ${err.name === 'TimeoutError' ? 'tiempo agotado' : 'sin conexión con Telegram'}`);
  }

  let cuerpo = {};
  try { cuerpo = await res.json(); } catch { /* respuesta no JSON */ }

  if (res.ok && cuerpo.ok) return { referencia: String(cuerpo.result?.message_id ?? '') };

  const detalle = `HTTP ${res.status}: ${String(cuerpo.description || 'sin descripción').slice(0, 200)}`;
  if (res.status === 400 && ERRORES_DE_MENSAJE.test(cuerpo.description || '')) throw new ErrorMensaje(detalle);
  throw new ErrorCanal(detalle);
}

module.exports = { nombre, limite, incluirEnlace: true, credenciales, publicar };
