const { createClient } = require('@supabase/supabase-js');
const { syncBdns } = require('../services/bdnsSync.service');

const initSupabaseAdmin = () =>
    createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

// Sync incremental diaria: solo hace falta mirar los últimos días, no
// repetir cada vez el barrido completo del año (eso es lo que hace el
// script manual `npm run bdns:sync`).
const DIAS_HACIA_ATRAS_CRON = 3;

const syncBdnsCron = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const cronSecret = process.env.CRON_SECRET;

        // Mismo criterio que el cron de alertas: sin distinción fiable entre
        // una petición de Vercel Cron y un curl anónimo por método HTTP, así
        // que el secreto se exige siempre, sin excepción.
        if (!cronSecret) {
            return res.status(500).json({ status: 'error', message: 'CRON_SECRET no está configurado.' });
        }
        if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
            return res.status(401).json({ status: 'error', message: 'Cron Secret inválido o ausente' });
        }

        const supabase = initSupabaseAdmin();
        const resultado = await syncBdns(DIAS_HACIA_ATRAS_CRON, supabase);

        res.status(200).json({ status: 'success', message: 'Sincronización BDNS completada', ...resultado });
    } catch (error) {
        console.error('[Cron BDNS] Error:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Error interno' });
    }
};

module.exports = { syncBdnsCron };
