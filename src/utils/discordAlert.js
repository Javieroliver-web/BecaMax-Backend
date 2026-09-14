// Avisos de fallos del backend a Discord.
//
// Webhook en la variable de entorno DISCORD_WEBHOOK_URL del proyecto de Vercel.
// Sin ella no se avisa (solo queda el console.error de siempre), para que el
// backend funcione igual en local o sin configurar.
//
// En Vercel la función se congela en cuanto se envía la respuesta: hay que
// hacer `await notifyDiscord(...)` ANTES de responder o el aviso se pierde.

const MAX_FIELD = 1000;
let warnedMissing = false;

const clip = (value, max = MAX_FIELD) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * @param {string} title  Qué ha fallado, en una línea.
 * @param {object} [details]
 * @param {Error|string} [details.error]
 * @param {Record<string, unknown>} [details.fields]  Datos extra (sin datos personales).
 */
async function notifyDiscord(title, { error, fields = {} } = {}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    if (!warnedMissing) {
      console.warn('[discordAlert] DISCORD_WEBHOOK_URL no configurada: los fallos no se avisan a Discord.');
      warnedMissing = true;
    }
    return;
  }

  const message = error instanceof Error ? error.message : error;
  const stack = error instanceof Error && error.stack ? error.stack : '';

  const payload = {
    username: 'BecaMax backend',
    embeds: [{
      title: `🚨 ${clip(title, 240)}`,
      color: 0xef4444,
      ...(message ? { description: '```' + clip(String(message), 1500).replace(/```/g, "'''") + '```' } : {}),
      fields: [
        ...Object.entries(fields).map(([name, value]) => ({ name: clip(name, 250), value: clip(value ?? '—') || '—', inline: false })),
        ...(stack ? [{ name: 'Traza', value: '```' + clip(stack, 990).replace(/```/g, "'''") + '```', inline: false }] : []),
        { name: 'Entorno', value: process.env.VERCEL_ENV || 'local', inline: true },
      ].slice(0, 25),
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error('[discordAlert] Discord respondió', res.status);
  } catch (err) {
    // Avisar nunca debe tumbar la petición original.
    console.error('[discordAlert] No se pudo avisar a Discord:', err.message);
  }
}

module.exports = { notifyDiscord };
