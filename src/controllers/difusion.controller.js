const { serverError } = require('../utils/serverError');
const { createClient } = require('@supabase/supabase-js');
const { publicarNovedades } = require('../services/difusion');
const { notifyDiscord } = require('../utils/discordAlert');

const initSupabaseAdmin = () =>
    createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

// Cron propio (08:00 UTC, vercel.json), separado del de la BDNS (06:00): así
// un fallo de la difusión nunca puede tumbar ni alargar la sincronización.
// Si un día la BDNS se retrasa, las becas se publican al día siguiente.
const difusionCron = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const cronSecret = process.env.CRON_SECRET;

        // Mismo criterio que los crons de BDNS y alertas: secreto siempre.
        if (!cronSecret) {
            await notifyDiscord('Cron difusión: CRON_SECRET no está configurado, no se publica nada');
            return res.status(500).json({ status: 'error', message: 'CRON_SECRET no está configurado.' });
        }
        if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
            return res.status(401).json({ status: 'error', message: 'Cron Secret inválido o ausente' });
        }

        const resumen = await publicarNovedades(initSupabaseAdmin());

        // Aviso resumido: canal, número de fallos y primer error. Sin datos
        // personales (solo hay datos públicos de becas).
        const conProblemas = Object.entries(resumen.canales).filter(([, r]) => r.errores > 0 || r.parado);
        if (conProblemas.length > 0) {
            const fields = {};
            for (const [canal, r] of conProblemas) {
                fields[canal] = `publicadas ${r.publicadas}, fallos ${r.errores}${r.parado ? ', canal parado' : ''}. Primer error: ${r.primerError || r.parado}`;
            }
            await notifyDiscord('Cron difusión: fallos al publicar becas en redes', { fields });
        }

        const canales = Object.fromEntries(Object.entries(resumen.canales)
            .map(([canal, r]) => [canal, { publicadas: r.publicadas, errores: r.errores, omitidas: r.omitidas, pendientes: r.pendientes }]));
        res.status(200).json({ status: 'success', becasVigentes: resumen.becasVigentes, canales });
    } catch (error) {
        console.error('[Cron difusión] Error:', error);
        await notifyDiscord('Cron difusión: la publicación en redes ha fallado', { error });
        return serverError(res, error, 'difusion.difusionCron');
    }
};

module.exports = { difusionCron };
