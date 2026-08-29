const rateLimit = require('express-rate-limit');

// ============================================================
//  RATE LIMITING
// ============================================================
// express-rate-limit por sí solo usa un almacén en memoria (MemoryStore)
// que NO persiste entre invocaciones de funciones serverless de Vercel:
// cada invocación puede recaer en una instancia distinta o en un cold
// start con su propio contador, así que en producción real no limita casi
// nada frente a tráfico concurrente/distribuido.
//
// Si están configuradas las credenciales de Upstash Redis (gratis en
// upstash.com), se usa como almacén compartido real entre invocaciones
// (recomendado oficialmente por Vercel para este caso). Si no lo están,
// se cae automáticamente al limiter en memoria de siempre, para que la
// app siga funcionando sin esa pieza de infraestructura.

function buildLimiter() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        console.warn('[RateLimit] UPSTASH_REDIS_REST_URL/TOKEN no configuradas: usando limiter en memoria (no persiste entre invocaciones serverless).');
        return rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 100,
            message: { status: 'error', message: 'Demasiadas peticiones desde esta IP. Inténtalo más tarde.' }
        });
    }

    const { Ratelimit } = require('@upstash/ratelimit');
    const { Redis } = require('@upstash/redis');

    const redis = new Redis({ url, token });
    const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, '15 m'),
        analytics: true,
        prefix: 'becamax-ratelimit'
    });

    return async (req, res, next) => {
        try {
            const identifier = req.ip || 'anon';
            const { success } = await ratelimit.limit(identifier);
            if (!success) {
                return res.status(429).json({ status: 'error', message: 'Demasiadas peticiones desde esta IP. Inténtalo más tarde.' });
            }
            next();
        } catch (err) {
            // Si Upstash falla (caída puntual, red, etc.), no tumbamos la API
            // entera por un problema del limiter: dejamos pasar la petición.
            console.error('[RateLimit] Error consultando Upstash, dejando pasar la petición:', err.message);
            next();
        }
    };
}

module.exports = buildLimiter();
