const fetch = require('node-fetch'); // Asumimos que podemos usar global fetch o node-fetch en node 18+, pero en caso de Vercel el Runtime suele tener fetch nativo.
// Si fetch nativo no está disponible, en Node 18+ sí lo está. Usaremos global.fetch.

const enviarLogDiscord = async (req, res) => {
  try {
    const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
    if (!WEBHOOK_URL) {
      return res.status(500).json({ status: 'error', message: 'Falta configurar DISCORD_WEBHOOK_URL en el backend.' });
    }

    const { page, ts, country, city, ip, device, lang, screen, referrer } = req.body;

    const discordPayload = {
      username: 'Sylphiette',
      avatar_url: 'https://i.imgur.com/4M34hi2.png',
      embeds: [{
        title: '📊 Nuevo acceso — BecaMax',
        color: 0x10b981,
        fields: [
          { name: '📄 Página',      value: '`' + (page || '/') + '`',         inline: true  },
          { name: '🕐 Fecha/Hora',  value: ts || '—',                         inline: true  },
          { name: '🌍 País / Ciudad', value: (country || '—') + ' · ' + (city || '—'), inline: false },
          { name: '🔗 IP',           value: '`' + (ip || '—') + '`',           inline: true  },
          { name: (device === '📱 Móvil' ? '📱 Dispositivo' : '🖥️ Dispositivo'),
                                   value: device || '—',                     inline: true  },
          { name: '🌐 Idioma',       value: lang || '—',                       inline: true  },
          { name: '🖥 Resolución',   value: screen || '—',                     inline: true  },
          { name: '🔀 Referrer',     value: referrer || '—',                   inline: false },
        ],
        footer: { text: 'BecaMax Access Logger · Sylphiette' },
        timestamp: new Date().toISOString(),
      }],
    };

    const response = await global.fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload),
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }

    res.status(200).json({ status: 'success', message: 'Log enviado a Discord' });
  } catch (error) {
    console.error('Error enviando log a Discord:', error);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor enviando log' });
  }
};

module.exports = {
  enviarLogDiscord
};
