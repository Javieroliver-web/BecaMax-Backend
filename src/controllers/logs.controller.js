// Utilizamos el global.fetch nativo de Node.js 18+ (Vercel ya utiliza versiones modernas).

const enviarLogDiscord = async (req, res) => {
  try {
    const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
    if (!WEBHOOK_URL) {
      return res.status(500).json({ status: 'error', message: 'Falta configurar DISCORD_WEBHOOK_URL en el backend.' });
    }

    let { page, ts, country, city, ip, device, lang, screen, referrer } = req.body;

    // 4. Validación básica de seguridad
    if (!page || typeof page !== 'string' || page.length > 200) {
      return res.status(400).json({ status: 'error', message: 'Datos de log inválidos o sospechosos.' });
    }

    // Usar cabeceras de Vercel como fuente de verdad infalible (los adblockers bloquean la API del frontend)
    const serverIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const serverCountry = req.headers['x-vercel-ip-country'] || 'Desconocido';
    const serverCity = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : 'Desconocido';

    if (!ip || ip === '—') ip = serverIp ? serverIp.split(',')[0] : '—';
    if (!country || country === '—') country = serverCountry;
    if (!city || city === '—') city = serverCity;

    const discordPayload = {
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
