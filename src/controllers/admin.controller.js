const { createClient } = require('@supabase/supabase-js');

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Falta configuración de Supabase URL o Service Key en el entorno del servidor.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

const deleteUser = async (req, res) => {
  try {
    const userIdToDelete = req.params.id;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Acceso denegado: Token no proporcionado' });
    }
    
    const token = authHeader.split(' ')[1];
    const supabaseAdmin = getSupabaseAdmin();
    
    // 1. Validar Token JWT contra Supabase (asegurar de que el peticionario sea quien dice ser)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ status: 'error', message: 'Acceso denegado: Token inválido o expirado' });
    }

    // 2. Comprobar que el peticionario tiene rol de admin localmente en BecaMax
    const { data: perfil, error: dbError } = await supabaseAdmin
      .from('perfiles')
      .select('rol')
      .eq('user_id', user.id)
      .single();

    if (dbError || !perfil || perfil.rol !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Prohibido: No tienes permisos de administrador.' });
    }

    // 3. Proteger al admin de borrarse a sí mismo por accidente
    if (user.id === userIdToDelete) {
      return res.status(400).json({ status: 'error', message: 'No puedes borrar tu propia cuenta de administrador.' });
    }

    // 4. Proceder con la eliminación segura a nivel de Auth de Supabase
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userIdToDelete);

    if (deleteError) {
      console.error('Supabase Auth error al eliminar usuario:', deleteError);
      return res.status(500).json({ status: 'error', message: `Fallo al eliminar: ${deleteError.message}` });
    }

    // Log the action (optional but good practice)
    await supabaseAdmin.from('system_logs').insert([{
      admin_id: user.id,
      user_id: null, // Ya no existe
      action: 'USER_DELETED',
      details: `Usuario ${userIdToDelete} borrado por completo.`
    }]);

    res.status(200).json({ status: 'success', message: 'Usuario eliminado exitosamente del sistema.' });

  } catch (err) {
    console.error('Error no controlado en endpoint admin delete:', err);
    res.status(500).json({ status: 'error', message: err.message || 'Error interno del servidor' });
  }
};

const postNews = async (req, res) => {
  try {
    const { content, expiration } = req.body;
    const authHeader = req.headers.authorization;

    if (!content) {
      return res.status(400).json({ status: 'error', message: 'El contenido de la noticia es obligatorio.' });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Acceso denegado: Token no proporcionado' });
    }
    
    const token = authHeader.split(' ')[1];
    const supabaseAdmin = getSupabaseAdmin();
    
    // 1. Validar Token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ status: 'error', message: 'Acceso denegado: Token inválido' });
    }

    // 2. Comprobar Admin
    const { data: perfil, error: dbError } = await supabaseAdmin
      .from('perfiles')
      .select('rol')
      .eq('user_id', user.id)
      .single();

    if (dbError || !perfil || perfil.rol !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Prohibido: No eres administrador.' });
    }

    // 3. Calcular Expiración
    let expiresAt = null;
    const now = new Date();
    if (expiration === '24h') {
      expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else if (expiration === '7d') {
      expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (expiration === '1m') {
      expiresAt = new Date(now.setMonth(now.getMonth() + 1));
    }

    // 4. Borrar noticias anteriores (Auto-delete previous)
    await supabaseAdmin.from('noticias').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 5. Insertar nueva
    const { data: newNews, error: insertError } = await supabaseAdmin
      .from('noticias')
      .insert([{
        content,
        expires_at: expiresAt,
        created_by: user.id
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    // Log action
    await supabaseAdmin.from('system_logs').insert([{
      admin_id: user.id,
      action: 'NEWS_POSTED',
      details: `Noticia publicada: ${content.substring(0, 50)}...`
    }]);

    res.status(200).json({ status: 'success', data: newNews });

  } catch (err) {
    console.error('Error in postNews:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = {
  deleteUser,
  postNews
};
