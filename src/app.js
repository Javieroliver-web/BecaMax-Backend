const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const limiter = require('./middleware/rateLimiter');

const app = express();

// Vercel siempre corre detrás de su propio proxy/edge -- sin esto,
// express-rate-limit (y cualquier lectura de req.ip) puede detectar mal la
// IP real del cliente detrás de X-Forwarded-For.
app.set('trust proxy', 1);

// 1. Seguridad de Cabeceras (Helmet)
app.use(helmet());

// 2. CORS Restringido (Ajsutar origen según tu URL de Vercel)
// Va ANTES del rate limiter a propósito: si el limiter corriera primero,
// una petición rechazada con 429 nunca llegaría a pasar por este
// middleware, así que su respuesta saldría sin cabeceras CORS -- el
// navegador lo ve como un opaco "Failed to fetch" en vez de un 429 con
// mensaje claro (bug real encontrado en producción, con el rate limit
// agotado de verdad por trafico de pruebas).
// `origin` como función: solo refleja Access-Control-Allow-Origin cuando
// coincide exactamente con el origen permitido, en vez de devolver siempre
// un string fijo (que no validaba nada -- cualquier Origin recibía la misma
// cabecera, aunque no le sirviera de nada sin poder forjar el Bearer token).
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'https://becamax.vercel.app';
const corsOptions = {
  origin: (origin, callback) => {
    // Peticiones sin Origin (curl, apps nativas, server-to-server) se permiten:
    // no hay navegador de por medio que necesite CORS.
    if (!origin || origin === FRONTEND_ORIGIN) return callback(null, true);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // Sin lista fija: supabase-js manda cabeceras propias (accept-profile,
  // content-profile, x-retry-count...) que van cambiando entre versiones --
  // una lista fija se queda desactualizada y el navegador bloquea el
  // preflight antes de que la peticion llegue al servidor (bug real
  // encontrado en produccion: rompia perfil/favoritos/alertas por completo).
  // Sin `allowedHeaders`, el paquete `cors` refleja automaticamente lo que
  // el propio preflight del navegador pide en Access-Control-Request-Headers.
  exposedHeaders: ['Content-Range'],
  // Necesario para que el navegador envie/reciba las cookies httpOnly de
  // sesion: sin esto, el fetch del frontend con credentials:'include' no
  // sirve de nada aunque el backend ponga Set-Cookie.
  credentials: true
};
app.use(cors(corsOptions));

// 3. Limitador de peticiones - 100 peticiones cada 15 min por IP.
// Usa Upstash Redis (compartido entre invocaciones serverless) si está
// configurado; si no, cae a un limiter en memoria. Ver middleware/rateLimiter.js.
app.use(limiter);

app.use(cookieParser());
app.use(express.json());

// Routes
const becasRoutes     = require('./routes/becas.routes');
const logsRoutes      = require('./routes/logs.routes');
const adminRoutes     = require('./routes/admin.routes');
const alertsRoutes    = require('./routes/alerts.routes');
const bdnsRoutes      = require('./routes/bdns.routes');
const authRoutes      = require('./routes/auth.routes');
const dbRoutes        = require('./routes/db.routes');
const storageRoutes   = require('./routes/storage.routes');

app.use('/api/becas',     becasRoutes);
app.use('/api/logs',      logsRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/alerts',    alertsRoutes);
app.use('/api/bdns',      bdnsRoutes);
app.use('/api/auth',      authRoutes);
app.use('/api/db',        dbRoutes);
app.use('/api/storage',   storageRoutes);

// Rutas de prueba
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Pong! El servidor BecaMax está funcionando correctamente.', status: 'success' });
});

module.exports = app;
