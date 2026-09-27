const supabaseServicio = require('../config/supabase');
const { serverError } = require('../utils/serverError');
const { notifyDiscord } = require('../utils/discordAlert');
const boletin = require('../services/boletin');
const { crearCorreo } = require('../services/boletin/correo');

const FRONTEND = () => (process.env.FRONTEND_URL || 'https://becamax.vercel.app').replace(/\/+$/, '');

// Misma respuesta para "enviado", "ya estaba", "espera" e incluso un correo
// que no existe: así el formulario no sirve para averiguar quién está suscrito.
const RESPUESTA_ALTA = {
    status: 'success',
    message: 'Si la dirección es correcta, te hemos enviado un correo para confirmar la suscripción. Revisa también la carpeta de spam.'
};

// hCaptcha opcional: si HCAPTCHA_SECRET está configurado, el alta lo exige.
// Sin captcha, el formulario podría usarse para mandar correos de
// confirmación a direcciones ajenas (lo frenan el límite por IP y los 10 min
// por dirección, pero el captcha lo corta de raíz).
async function captchaValido(tokenCaptcha) {
    const secreto = process.env.HCAPTCHA_SECRET;
    if (!secreto) return true;
    if (!tokenCaptcha || typeof tokenCaptcha !== 'string') return false;
    try {
        const res = await fetch('https://api.hcaptcha.com/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ secret: secreto, response: tokenCaptcha }),
            signal: AbortSignal.timeout(5000),
        });
        const datos = await res.json();
        return datos.success === true;
    } catch {
        return false;
    }
}

// POST /api/boletin/alta  { email, version, captchaToken }
async function alta(req, res) {
    const { email, version, captchaToken } = req.body || {};
    if (!boletin.normalizarEmail(email) || !boletin.CONSENTIMIENTOS[version]) {
        return res.status(400).json({ status: 'error', message: 'Escribe un correo válido y acepta las condiciones.' });
    }
    if (!(await captchaValido(captchaToken))) {
        return res.status(400).json({ status: 'error', message: 'Completa la verificación antes de suscribirte.' });
    }
    const correo = crearCorreo();
    if (!correo) {
        return res.status(503).json({ status: 'error', message: 'El boletín todavía no está disponible.' });
    }
    try {
        await boletin.darDeAlta(supabaseServicio, correo, { email, version });
        return res.status(200).json(RESPUESTA_ALTA);
    } catch (err) {
        return serverError(res, err, 'boletin.alta');
    }
}

// GET /api/boletin/confirmar?token=...  (enlace del correo de confirmación)
async function confirmarEnlace(req, res) {
    try {
        const estado = await boletin.confirmar(supabaseServicio, req.query.token);
        return res.redirect(303, `${FRONTEND()}/pages/boletin.html?estado=${estado}`);
    } catch (err) {
        console.error('[boletin.confirmar]', err);
        await notifyDiscord('Boletín: fallo al confirmar una suscripción', { error: err });
        return res.redirect(303, `${FRONTEND()}/pages/boletin.html?estado=error`);
    }
}

// GET o POST /api/boletin/baja?token=...  Un clic, sin sesión.
// El POST es el "List-Unsubscribe-Post" de los clientes de correo (RFC 8058).
async function baja(req, res) {
    const t = req.query.token || req.body?.token;
    try {
        const estado = await boletin.darDeBaja(supabaseServicio, t);
        if (req.method === 'POST') return res.status(200).json({ status: 'success' });
        return res.redirect(303, `${FRONTEND()}/pages/boletin.html?estado=${estado}`);
    } catch (err) {
        console.error('[boletin.baja]', err);
        await notifyDiscord('Boletín: fallo al dar de baja a un suscriptor', { error: err });
        if (req.method === 'POST') return serverError(res, err, 'boletin.baja');
        return res.redirect(303, `${FRONTEND()}/pages/boletin.html?estado=error`);
    }
}

// Cron semanal (lunes 09:00 UTC, vercel.json).
async function envioSemanalCron(req, res) {
    try {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
            await notifyDiscord('Cron boletín: CRON_SECRET no está configurado, no se envía');
            return res.status(500).json({ status: 'error', message: 'CRON_SECRET no está configurado.' });
        }
        if (req.headers.authorization !== `Bearer ${cronSecret}`) {
            return res.status(401).json({ status: 'error', message: 'Cron Secret inválido o ausente' });
        }
        const correo = crearCorreo();
        if (!correo) {
            // Apagado a propósito hasta tener dominio verificado: no es un fallo.
            return res.status(200).json({ status: 'success', message: 'Boletín apagado (faltan RESEND_API_KEY o BOLETIN_FROM).' });
        }

        const resumen = await boletin.enviarBoletinSemanal(supabaseServicio, correo);
        if (resumen.errores > 0 || resumen.primerError) {
            await notifyDiscord('Cron boletín: fallos al enviar el boletín semanal', {
                fields: { resumen: `enviados ${resumen.enviados}, fallidos ${resumen.errores}`, 'primer error': resumen.primerError || '—' },
            });
        }
        // Sin direcciones en la respuesta: solo recuentos.
        return res.status(200).json({ status: 'success', ...resumen });
    } catch (err) {
        console.error('[Cron boletín] Error:', err);
        await notifyDiscord('Cron boletín: el envío semanal ha fallado', { error: err });
        return serverError(res, err, 'boletin.envioSemanalCron');
    }
}

module.exports = { alta, confirmarEnlace, baja, envioSemanalCron };
