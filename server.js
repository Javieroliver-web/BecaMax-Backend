require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar Supabase Admin (con role service para operaciones seguras)
const supabaseUrl = process.env.SUPABASE_URL || 'https://tu-url-de-supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'tu-service-key-oculta';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Pong! El servidor BecaMax está funcionando correctamente.', status: 'success' });
});

// Ejemplo de ruta de backend para obtener becas de forma segura
app.get('/api/becas', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('becas')
            .select('*')
            .limit(10);
            
        if (error) throw error;
        res.json({ data });
    } catch (error) {
        console.error('Error al obtener becas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
