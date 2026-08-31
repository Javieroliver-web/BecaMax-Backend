const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Cliente "anonimo": mismo rol que usaba el navegador antes de esta
// migracion a cookies httpOnly. Se usa para las operaciones que todavia no
// tienen una sesion (login, registro, reenvio, recuperar contrasena, refresh).
function getSupabaseAnon() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Falta SUPABASE_URL o SUPABASE_ANON_KEY en el entorno del servidor.');
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// Cliente "como el usuario": misma anon key, pero con el access token de su
// sesion en la cabecera Authorization. supabase-js aplica global.headers a
// TODAS sus sub-APIs (PostgREST, GoTrue, Storage), asi que este mismo
// cliente sirve tanto para leer/escribir tablas respetando RLS como para
// llamar a auth.updateUser()/auth.signOut() en nombre del usuario, sin
// necesitar auth.setSession().
function getSupabaseAsUser(accessToken) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Falta SUPABASE_URL o SUPABASE_ANON_KEY en el entorno del servidor.');
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

module.exports = { getSupabaseAnon, getSupabaseAsUser };
