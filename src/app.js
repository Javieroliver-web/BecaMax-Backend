const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const limiter = require('./middleware/rateLimiter');

const app = express();

// Vercel siempre corre detrás de su propio proxy/edge -- sin esto,
// express-rate-limit (y cualquier lectura de req.ip) puede detectar mal la
// IP real del cliente detrás de X-Forwarded-For.
app.set('trust proxy', 1);

// 1. Seguridad de Cabeceras (Helmet)
app.use(helmet());

// 2. Limitador de peticiones - 100 peticiones cada 15 min por IP.
// Usa Upstash Redis (compartido entre invocaciones serverless) si está
// configurado; si no, cae a un limiter en memoria. Ver middleware/rateLimiter.js.
app.use(limiter);

// 3. CORS Restringido (Ajsutar origen según tu URL de Vercel)
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-client-info', 'apikey']
};
app.use(cors(corsOptions));

app.use(express.json());

// Routes
const becasRoutes     = require('./routes/becas.routes');
const logsRoutes      = require('./routes/logs.routes');
const adminRoutes     = require('./routes/admin.routes');
const alertsRoutes    = require('./routes/alerts.routes');
const bdnsRoutes      = require('./routes/bdns.routes');

app.use('/api/becas',     becasRoutes);
app.use('/api/logs',      logsRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/alerts',    alertsRoutes);
app.use('/api/bdns',      bdnsRoutes);

// Rutas de prueba
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Pong! El servidor BecaMax está funcionando correctamente.', status: 'success' });
});

module.exports = app;
