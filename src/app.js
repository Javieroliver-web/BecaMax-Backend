const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// 1. Seguridad de Cabeceras (Helmet)
app.use(helmet());

// 2. Limitador de peticiones (Rate Limit) - 100 peticiones cada 15 min por IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { status: 'error', message: 'Demasiadas peticiones desde esta IP. Inténtalo más tarde.' }
});
app.use(limiter);

// 3. CORS Restringido (Ajsutar origen según tu URL de Vercel)
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-client-info', 'apikey']
};
app.use(cors(corsOptions));

app.use(express.json());

// Routes
const becasRoutes = require('./routes/becas.routes');
const logsRoutes = require('./routes/logs.routes');
const adminRoutes = require('./routes/admin.routes');

app.use('/api/becas', becasRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/admin', adminRoutes);

// Rutas de prueba
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Pong! El servidor BecaMax está funcionando correctamente.', status: 'success' });
});

module.exports = app;
