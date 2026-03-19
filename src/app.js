const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
const becasRoutes = require('./routes/becas.routes');
app.use('/api/becas', becasRoutes);

// Ruta de prueba
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Pong! El servidor BecaMax está funcionando correctamente.', status: 'success' });
});

module.exports = app;
