require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

// Exportar la app para que Vercel (@vercel/node) la utilice como Serverless Function
module.exports = app;

// Solo arrancar el listener local si NO estamos en Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}
