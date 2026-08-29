const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const initSupabaseAdmin = () =>
    createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

// ─── GET /api/favorites ─────────────────────────────────────────────────────
// Devuelve los IDs de becas favoritas del usuario autenticado
const getFavorites = async (req, res) => {
    try {
        const supabase = initSupabaseAdmin();
        const userId = req.query.user_id;
        if (!userId) return res.status(400).json({ status: 'error', message: 'user_id requerido' });

        const { data, error } = await supabase
            .from('favoritos')
            .select('beca_id, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ status: 'success', data: data || [] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ─── POST /api/favorites ─────────────────────────────────────────────────────
// Añade una beca a favoritos (idempotente por UNIQUE constraint)
const addFavorite = async (req, res) => {
    try {
        const supabase = initSupabaseAdmin();
        const { user_id, beca_id } = req.body;
        if (!user_id || !beca_id) return res.status(400).json({ status: 'error', message: 'user_id y beca_id requeridos' });

        const { error } = await supabase
            .from('favoritos')
            .upsert({ user_id, beca_id }, { onConflict: 'user_id,beca_id' });

        if (error) throw error;
        res.json({ status: 'success', message: 'Favorito añadido' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ─── DELETE /api/favorites/:beca_id ─────────────────────────────────────────
const removeFavorite = async (req, res) => {
    try {
        const supabase = initSupabaseAdmin();
        const { beca_id } = req.params;
        const user_id = req.query.user_id;
        if (!user_id || !beca_id) return res.status(400).json({ status: 'error', message: 'user_id y beca_id requeridos' });

        const { error } = await supabase
            .from('favoritos')
            .delete()
            .eq('user_id', user_id)
            .eq('beca_id', beca_id);

        if (error) throw error;
        res.json({ status: 'success', message: 'Favorito eliminado' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

module.exports = { getFavorites, addFavorite, removeFavorite };
