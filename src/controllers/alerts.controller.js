const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const BECAS_ESTATICAS = require('../data/becas');

const initSupabaseAdmin = () => {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
};

function diasRestantes(deadline) {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const fin = new Date(deadline);
    return Math.ceil((fin - hoy) / 86400000);
}

function aplicarFiltros(becas, filtros) {
    const { busqueda, tipo, region, area, importeMin, importeMax, plazo } = filtros;
    return becas.filter(b => {
        const dias = diasRestantes(b.deadline);
        let u = 'disponible';
        if (dias < 0) u = 'cerrada';
        else if (dias <= 7) u = 'urgente';
        else if (dias <= 30) u = 'proximo';

        if (dias < 0) return false;
        if (tipo   && b.tipo !== tipo) return false;
        if (region && b.region !== region && b.region !== 'Nacional') return false;
        if (area   && b.area !== area   && b.area   !== 'Cualquier área') return false;
        if (importeMin !== null && b.importe && b.importe.max < importeMin) return false;
        if (importeMax !== null && b.importe && b.importe.min > importeMax) return false;
        if (plazo === 'urgente' && u !== 'urgente') return false;
        if (plazo === 'proximo' && u !== 'proximo') return false;
        if (busqueda) {
            const q = busqueda.toLowerCase();
            return (
                b.nombre.toLowerCase().includes(q) ||
                b.entidad.toLowerCase().includes(q) ||
                (b.etiquetas && b.etiquetas.some(e => e.toLowerCase().includes(q)))
            );
        }
        return true;
    });
}

function buildEmailHTML(alerta, becasMatch) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://becamax.vercel.app';

    const urgencyBadge = (dias) => {
        if (dias <= 7)  return `<span style="background:#ef4444;color:#fff;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;"> ${dias}d restantes</span>`;
        if (dias <= 30) return `<span style="background:#f59e0b;color:#fff;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;"> ${dias}d restantes</span>`;
        return `<span style="background:#10b981;color:#fff;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;"> ${dias}d restantes</span>`;
    };

    const becaCards = becasMatch.map(b => {
        const dias = diasRestantes(b.deadline);
        const importeStr = b.importe
            ? (b.importe.min === b.importe.max
                ? `${b.importe.max.toLocaleString('es-ES')} \u20ac`
                : `${b.importe.min.toLocaleString('es-ES')} \u2013 ${b.importe.max.toLocaleString('es-ES')} \u20ac`)
            : 'Consultar';
        const fechaStr = new Date(b.deadline).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

        return `
        <div style="background:#1a1a2e;border:1px solid #2d2d4e;border-radius:12px;padding:20px;margin-bottom:16px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:top;">
              <div style="font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${b.tipo || 'Beca'}</div>
              <div style="font-size:17px;font-weight:700;color:#f9fafb;line-height:1.3;">${b.nombre}</div>
              <div style="font-size:13px;color:#9ca3af;margin-top:3px;">${b.entidad}</div>
            </td>
            <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:12px;">${urgencyBadge(dias)}</td>
          </tr></table>
          <p style="font-size:13px;color:#9ca3af;line-height:1.6;margin:12px 0 14px;">${b.descripcion ? b.descripcion.substring(0, 180) + '\u2026' : ''}</p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>
            <td style="padding-right:24px;">
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Importe</div>
              <div style="font-size:16px;font-weight:700;color:#10b981;">${importeStr}</div>
            </td>
            <td>
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Plazo</div>
              <div style="font-size:14px;font-weight:600;color:#f9fafb;">${fechaStr}</div>
            </td>
          </tr></table>
          <a href="${b.url}" style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;">Ver beca oficial \u2197</a>
        </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>BecaMax \u2013 Nuevas oportunidades para ti</title></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border-radius:16px 16px 0 0;padding:28px 32px;border-bottom:2px solid #10b981;">
    <table cellpadding="0" cellspacing="0"><tr>
      <td style="background:linear-gradient(135deg,#10b981,#059669);width:44px;height:44px;border-radius:10px;text-align:center;vertical-align:middle;">
        <span style="font-size:20px;font-weight:800;color:#fff;line-height:44px;">B</span>
      </td>
      <td style="padding-left:12px;vertical-align:middle;">
        <div style="font-size:22px;font-weight:800;color:#f9fafb;letter-spacing:-0.5px;">Beca<span style="color:#10b981;">Max</span></div>
        <div style="font-size:12px;color:#6b7280;margin-top:1px;">Tu gestor de becas</div>
      </td>
    </tr></table>
  </td></tr>

  <!-- HERO -->
  <tr><td style="background:#12122a;padding:32px;text-align:center;border-left:1px solid #1e1e3a;border-right:1px solid #1e1e3a;">
    <div style="font-size:40px;margin-bottom:12px;">\uD83C\uDFAF</div>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#f9fafb;">Tienes ${becasMatch.length} beca${becasMatch.length !== 1 ? 's' : ''} nueva${becasMatch.length !== 1 ? 's' : ''}</h1>
    <p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.6;">Coincidencias para tu alerta <strong style="color:#10b981;">"${alerta.nombre}"</strong></p>
  </td></tr>

  <!-- BECAS -->
  <tr><td style="background:#0f0f1a;padding:24px 32px;border-left:1px solid #1e1e3a;border-right:1px solid #1e1e3a;">
    ${becaCards}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td align="center">
      <a href="${frontendUrl}/pages/dashboard.html" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">Ver todas mis alertas \u2192</a>
    </td></tr></table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#0a0a1a;border-radius:0 0 16px 16px;padding:24px 32px;text-align:center;border:1px solid #1e1e3a;border-top:1px solid #10b981;">
    <p style="margin:0 0 8px;font-size:12px;color:#4b5563;">Recibes este email porque tienes alertas activas en BecaMax.</p>
    <p style="margin:0;font-size:12px;color:#4b5563;">Para dejar de recibirlos, <a href="${frontendUrl}/pages/dashboard.html" style="color:#10b981;text-decoration:underline;">desactiva la alerta desde tu panel</a>.</p>
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid #1e1e3a;font-size:11px;color:#374151;">&copy; 2026 BecaMax &middot; Informaci\u00f3n orientativa, verifica siempre en la fuente oficial.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

const sendAlertsCron = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const cronSecret = process.env.CRON_SECRET;

        // IMPORTANTE: no existe forma de distinguir criptográficamente una
        // petición de Vercel Cron de un curl anónimo por el método HTTP; un
        // bypass basado en "si es GET, no pido secreto" deja el endpoint
        // abierto a cualquiera (dispara emails reales y filtra el email de
        // cada usuario con alertas activas en la respuesta). Vercel adjunta
        // automáticamente `Authorization: Bearer $CRON_SECRET` a sus propias
        // invocaciones de Cron Jobs cuando esa variable de entorno existe en
        // el proyecto, así que exigimos el secreto siempre, sin excepción
        // por método. Sin CRON_SECRET configurado, fallamos cerrado.
        if (!cronSecret) {
            return res.status(500).json({ status: 'error', message: 'CRON_SECRET no está configurado.' });
        }
        if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
            return res.status(401).json({ status: 'error', message: 'Cron Secret inválido o ausente' });
        }

        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
            return res.status(500).json({ status: 'error', message: 'RESEND_API_KEY no está definida.' });
        }
        const resend = new Resend(resendApiKey);
        const supabase = initSupabaseAdmin();

        // 1. Obtener becas
        let dataBecas = [];
        const { data: bData, error: bError } = await supabase.from('becas').select('*');
        if (bError || !bData || bData.length === 0) {
            console.log('[Cron] Sin becas en BD. Usando fallback estático.');
            dataBecas = BECAS_ESTATICAS;
        } else {
            dataBecas = bData;
        }

        // 2. Obtener alertas activas
        const { data: alertas, error: alertaErr } = await supabase
            .from('filtros_guardados')
            .select('*')
            .eq('activo', true);

        if (alertaErr) throw alertaErr;
        if (!alertas || alertas.length === 0) {
            return res.json({ status: 'success', message: 'Sin alertas activas.' });
        }

        // 3. Obtener emails de usuarios
        const userIds = [...new Set(alertas.map(a => a.user_id))];
        const correosMapa = {};
        for (const uid of userIds) {
            const { data: { user } } = await supabase.auth.admin.getUserById(uid);
            if (user?.email) correosMapa[uid] = user.email;
        }

        let emailsEnviados = 0;
        const resumenLogs = [];

        // 4. Procesar cada alerta
        for (const alerta of alertas) {
            const destEmail = correosMapa[alerta.user_id];
            if (!destEmail) continue;

            const becasMatch = aplicarFiltros(dataBecas, alerta.filtros)
                .sort((a, b) => diasRestantes(a.deadline) - diasRestantes(b.deadline))
                .slice(0, 8);

            if (becasMatch.length > 0) {
                try {
                    await resend.emails.send({
                        from: 'BecaMax Alertas <alertas@becamax.es>',
                        to: destEmail,
                        subject: `\uD83C\uDFAF ${becasMatch.length} beca${becasMatch.length !== 1 ? 's' : ''} nueva${becasMatch.length !== 1 ? 's' : ''} para tu alerta "${alerta.nombre}"`,
                        html: buildEmailHTML(alerta, becasMatch)
                    });
                    
                    // Insertar también notificación in-app en Supabase
                    await supabase.from('notificaciones').insert({
                        user_id: alerta.user_id,
                        titulo: `Nuevas becas: ${alerta.nombre}`,
                        texto: `Se han encontrado ${becasMatch.length} beca${becasMatch.length !== 1 ? 's' : ''} nueva${becasMatch.length !== 1 ? 's' : ''} para ti.`,
                        icono: '',
                        url_destino: 'dashboard.html'
                    });

                    resumenLogs.push({ email: destEmail, alerta: alerta.nombre, matches: becasMatch.length, status: 'enviado' });
                    emailsEnviados++;
                } catch (emailErr) {
                    console.error('[Cron] Fallo al enviar a:', destEmail, emailErr.message);
                    resumenLogs.push({ email: destEmail, alerta: alerta.nombre, status: 'error', error: emailErr.message });
                }
            }
        }

        res.status(200).json({ status: 'success', message: 'Cron finalizado', emailsEnviados, resumenLogs });

    } catch (error) {
        console.error('[Cron] Error total:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Error interno' });
    }
};

module.exports = { sendAlertsCron };
