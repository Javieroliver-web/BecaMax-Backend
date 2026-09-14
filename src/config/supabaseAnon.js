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

// Cliente para el login con Google (OAuth con PKCE hecho en el servidor).
// `storage` es un almacen propio en memoria que el controlador vuelca a una
// cookie: supabase-js guarda ahi el code verifier al iniciar el flujo y lo
// vuelve a leer al canjear el codigo. Ojo: con persistSession:false la
// libreria ignora el storage propio y usa uno interno, por eso va a true
// (no hay nada que persistir de verdad: el storage muere con la peticion).
function getSupabasePkce(storage) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Falta SUPABASE_URL o SUPABASE_ANON_KEY en el entorno del servidor.');
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: 'pkce', autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, storage }
  });
}

module.exports = { getSupabaseAnon, getSupabaseAsUser, getSupabasePkce };
