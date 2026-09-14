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

/**
 * Crea un limitador de `max` peticiones por IP cada 15 minutos.
 * `prefix` separa los contadores en Redis: cada limitador lleva el suyo.
 */
function buildLimiter({ max, prefix, message }) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        console.warn(`[RateLimit:${prefix}] UPSTASH_REDIS_REST_URL/TOKEN no configuradas: usando limiter en memoria (no persiste entre invocaciones serverless).`);
        return [
            (req, res, next) => { res.setHeader('X-RateLimit-Backend', 'memory'); next(); },
            rateLimit({
                windowMs: 15 * 60 * 1000,
                max,
                message: { status: 'error', message }
            })
        ];
    }

    const { Ratelimit } = require('@upstash/ratelimit');
    const { Redis } = require('@upstash/redis');

    const redis = new Redis({ url, token });
    const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(max, '15 m'),
        analytics: true,
        prefix
    });

    return async (req, res, next) => {
        try {
            const identifier = req.ip || 'anon';
            const { success, limit, remaining } = await ratelimit.limit(identifier);
            res.setHeader('X-RateLimit-Backend', 'upstash');
            res.setHeader('X-RateLimit-Limit', limit);
            res.setHeader('X-RateLimit-Remaining', remaining);
            if (!success) {
                return res.status(429).json({ status: 'error', message });
            }
            next();
        } catch (err) {
            // Si Upstash falla (caída puntual, red, etc.), no tumbamos la API
            // entera por un problema del limiter: dejamos pasar la petición.
            console.error(`[RateLimit:${prefix}] Error consultando Upstash, dejando pasar la petición:`, err.message);
            next();
        }
    };
}

// Límite general de toda la API.
const globalLimiter = buildLimiter({
    max: 300,
    prefix: 'becamax-ratelimit',
    message: 'Demasiadas peticiones desde esta IP. Inténtalo más tarde.'
});

// Límite estricto para login, registro, reenvío de confirmación y
// recuperación de contraseña. Con solo el general (300 cada 15 min) cabían
// cientos de intentos de contraseña o de correos de reseteo contra una misma
// cuenta. hCaptcha y los límites propios de Supabase Auth ayudan, pero esta
// capa corta el abuso antes de gastar cuota de Supabase y de Resend.
const authLimiter = buildLimiter({
    max: 20,
    prefix: 'becamax-ratelimit-auth',
    message: 'Demasiados intentos. Espera unos minutos antes de volver a probar.'
});

module.exports = { globalLimiter, authLimiter };
