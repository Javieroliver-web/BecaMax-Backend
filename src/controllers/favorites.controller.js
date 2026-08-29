const { createClient } = require('@supabase/supabase-js');

const initSupabaseAdmin = () =>
    createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

// ─── Middleware: exige Bearer token válido y expone req.userId ─────────────
// IMPORTANTE: nunca confiar en un user_id que venga del query/body del
// cliente. El user_id SIEMPRE sale del token verificado contra Supabase.
const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ status: 'error', message: 'Acceso denegado: Token no proporcionado' });
        }
        const token = authHeader.split(' ')[1];
        const supabase = initSupabaseAdmin();
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ status: 'error', message: 'Acceso denegado: Token inválido o expirado' });
        }
        req.userId = user.id;
        req.supabaseAdmin = supabase;
        next();
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ─── GET /api/favorites ─────────────────────────────────────────────────────
const getFavorites = async (req, res) => {
    try {
        const { data, error } = await req.supabaseAdmin
            .from('favoritos')
            .select('beca_id, created_at')
            .eq('user_id', req.userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ status: 'success', data: data || [] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ─── POST /api/favorites ─────────────────────────────────────────────────────
const addFavorite = async (req, res) => {
    try {
        const { beca_id } = req.body;
        if (!beca_id) return res.status(400).json({ status: 'error', message: 'beca_id requerido' });

        const { error } = await req.supabaseAdmin
            .from('favoritos')
            .upsert({ user_id: req.userId, beca_id }, { onConflict: 'user_id,beca_id' });

        if (error) throw error;
        res.json({ status: 'success', message: 'Favorito añadido' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ─── DELETE /api/favorites/:beca_id ─────────────────────────────────────────
const removeFavorite = async (req, res) => {
    try {
        const { beca_id } = req.params;
        if (!beca_id) return res.status(400).json({ status: 'error', message: 'beca_id requerido' });

        const { error } = await req.supabaseAdmin
            .from('favoritos')
            .delete()
            .eq('user_id', req.userId)
            .eq('beca_id', beca_id);

        if (error) throw error;
        res.json({ status: 'success', message: 'Favorito eliminado' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

module.exports = { requireAuth, getFavorites, addFavorite, removeFavorite };
