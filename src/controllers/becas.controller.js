const supabase = require('../config/supabase');

const getBecas = async (req, res) => {
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
};

module.exports = {
    getBecas
};
