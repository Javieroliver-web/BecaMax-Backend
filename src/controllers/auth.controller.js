const { serverError } = require('../utils/serverError');
const { getSupabaseAnon, getSupabaseAsUser, getSupabasePkce } = require('../config/supabaseAnon');
const { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } = require('../utils/authCookies');
const { withTimeout } = require('../utils/withTimeout');

const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'https://becamax.vercel.app';
const PKCE_COOKIE = 'sb-google-pkce';

// Revoca en Supabase los refresh tokens de la sesión de ese access token.
// OJO: auth.signOut() NO sirve aquí. Solo llama a GoTrue si el cliente tiene
// una sesión guardada, y en el servidor nunca la hay (persistSession: false),
// así que hasta el 24/09/2026 no revocaba nada: ni al cerrar sesión ni al
// bloquear. admin.signOut(jwt) llama a /logout con el token del propio
// usuario (no necesita la clave de servicio).
async function revocarSesion(accessToken, scope) {
  const { error } = await getSupabaseAnon().auth.admin.signOut(accessToken, scope);
  if (error) console.error(`[revocarSesion:${scope}]`, error.message);
}

// Cuenta bloqueada por la administracion: revoca todas sus sesiones y
// devuelve true. Lo usan el login (contraseña y Google) y /session.
async function revokeIfBlocked(session, user) {
  const asUser = getSupabaseAsUser(session.access_token);
  const { data: perfil } = await asUser.from('perfiles').select('estado').eq('user_id', user.id).single();
  if (perfil && perfil.estado === 'bloqueado') {
    await revocarSesion(session.access_token, 'global');
    return true;
  }
  return false;
}

// ── Registro ───────────────────────────────────────────────────
async function register(req, res) {
  try {
    const { nombre, email, password, captchaToken } = req.body;
    const anon = getSupabaseAnon();
    const { error } = await anon.auth.signUp({
      email,
      password,
      options: { data: { nombre }, captchaToken }
    });
    if (error) return res.status(400).json({ status: 'error', message: error.message });
    res.json({ status: 'success' });
  } catch (err) {
    return serverError(res, err, 'auth.register');
  }
}

// ── Reenviar email de confirmacion ────────────────────────────
async function resendConfirmation(req, res) {
  try {
    const { email, captchaToken } = req.body;
    const anon = getSupabaseAnon();
    const { error } = await anon.auth.resend({ type: 'signup', email, options: { captchaToken } });
    if (error) return res.status(400).json({ status: 'error', message: error.message });
    res.json({ status: 'success' });
  } catch (err) {
    return serverError(res, err, 'auth.resendConfirmation');
  }
}

// ── Login ──────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password, captchaToken } = req.body;
    const anon = getSupabaseAnon();
    const { data, error } = await withTimeout(
      anon.auth.signInWithPassword({ email, password, options: { captchaToken } }), 8000, 'auth.signInWithPassword()'
    );
    if (error) return res.status(400).json({ status: 'error', message: error.message });

    // Verificacion de bloqueo (misma comprobacion que antes hacia auth.js
    // en el navegador, ahora movida aqui porque el frontend ya no puede
    // leer el token para hacer esta llamada el mismo).
    if (await revokeIfBlocked(data.session, data.user)) {
      return res.status(403).json({ status: 'error', message: 'Cuenta suspendida por la administración.' });
    }

    setAuthCookies(res, data.session);
    res.json({ status: 'success', data: { session: { user: data.user } } });
  } catch (err) {
    return serverError(res, err, 'auth.login');
  }
}

// ── Olvidé mi contraseña ───────────────────────────────────────
async function forgotPassword(req, res) {
  try {
    const { email, captchaToken } = req.body;
    const anon = getSupabaseAnon();
    const { error } = await anon.auth.resetPasswordForEmail(email, { captchaToken });
    if (error) return res.status(400).json({ status: 'error', message: error.message });
    res.json({ status: 'success' });
  } catch (err) {
    return serverError(res, err, 'auth.forgotPassword');
  }
}

// ── Logout ─────────────────────────────────────────────────────
async function logout(req, res) {
  try {
    if (req.accessToken) {
      // 'local': cierra esta sesión, no las de sus otros dispositivos.
      // best-effort: aunque falle, las cookies se borran igual.
      await withTimeout(revocarSesion(req.accessToken, 'local'), 8000, 'revocarSesion()').catch(() => {});
    }
  } finally {
    clearAuthCookies(res);
    res.json({ status: 'success' });
  }
}

// ── Sesion actual (con refresco transparente si hace falta) ────
async function getSession(req, res) {
  try {
    // El bloqueo se mira también aquí, no solo al iniciar sesión: bloquear
    // desde el panel de admin solo cambia `perfiles.estado`, y hasta el
    // 24/09/2026 quien ya tenía sesión seguía dentro (el refresco renovaba la
    // cookie sin preguntar). Cada página llama a /session al cargar, así que
    // el bloqueo surte efecto en la siguiente página que abra.
    if (req.user) {
      if (await revokeIfBlocked({ access_token: req.accessToken }, req.user)) {
        clearAuthCookies(res);
        return res.json({ data: { session: null }, error: null });
      }
      return res.json({ data: { session: { user: req.user } }, error: null });
    }

    // Sin access token valido: intentar refrescar en silencio con el
    // refresh token, igual que hacia el SDK de supabase-js en el navegador
    // en segundo plano (el frontend ya no puede hacerlo el mismo).
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      try {
        const anon = getSupabaseAnon();
        const { data, error } = await withTimeout(
          anon.auth.refreshSession({ refresh_token: refreshToken }), 8000, 'auth.refreshSession()'
        );
        if (!error && data.session) {
          if (await revokeIfBlocked(data.session, data.user)) {
            clearAuthCookies(res);
            return res.json({ data: { session: null }, error: null });
          }
          setAuthCookies(res, data.session);
          return res.json({ data: { session: { user: data.user } }, error: null });
        }
      } catch (refreshErr) {
        console.error('[getSession] Fallo refrescando la sesion (timeout o error de Supabase Auth):', refreshErr.message);
      }
    }

    clearAuthCookies(res);
    res.json({ data: { session: null }, error: null });
  } catch (err) {
    // Misma forma que el resto de respuestas de /session (el frontend lee
    // data.session), pero sin el texto interno del error.
    console.error('[auth.getSession]', err);
    res.status(500).json({ data: { session: null }, error: { message: 'Error interno del servidor' } });
  }
}

// ── Actualizar usuario (nombre, contraseña) ────────────────────
async function updateUser(req, res) {
  try {
    // Solo lo que usa el frontend (perfil.js: nombre; configuracion.js:
    // contraseña). Antes se pasaba req.body entero a Supabase, lo que dejaba
    // cambiar desde fuera cualquier atributo (email, metadatos arbitrarios...).
    const { password, data: meta } = req.body || {};
    const attrs = {};
    if (typeof password === 'string' && password.length > 0) attrs.password = password;
    if (meta && typeof meta.full_name === 'string') attrs.data = { full_name: meta.full_name.trim().slice(0, 100) };
    if (!Object.keys(attrs).length) {
      return res.status(400).json({ status: 'error', message: 'Nada que actualizar.' });
    }

    // Llamada directa a GoTrue: auth.updateUser() exige una sesión guardada en
    // el cliente y en el servidor no la hay, así que siempre respondía
    // "Auth session missing!" (roto desde el paso a cookies httpOnly).
    const respuesta = await withTimeout(fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${req.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(attrs),
    }), 8000, 'PUT /auth/v1/user');
    const cuerpo = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const message = cuerpo.msg || cuerpo.message || cuerpo.error_description || 'No se pudo actualizar.';
      return res.status(400).json({ status: 'error', message });
    }
    res.json({ data: { user: cuerpo }, error: null });
  } catch (err) {
    return serverError(res, err, 'auth.updateUser');
  }
}

// ── Login con Google ───────────────────────────────────────────
// Flujo OAuth con PKCE entero en el servidor, para que la sesion acabe en
// las mismas cookies httpOnly que el login con contraseña:
//   1. /google          -> pide a Supabase la URL de Google y guarda el code
//                          verifier en una cookie httpOnly de 10 minutos.
//   2. Google -> Supabase -> /google/callback?code=...
//   3. /google/callback -> canjea el codigo con ese verifier, aplica el
//                          mismo bloqueo que el login y redirige a la web.
// El perfil se crea solo con el trigger on_auth_user_created, igual que en
// el registro normal; Google aporta full_name en los metadatos del usuario.

// Solo rutas internas de la web: evita usar el login como redireccion abierta.
function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/pages/dashboard';
  return /^\/[a-zA-Z0-9_.\-\/?=&%+,#]*$/.test(value) ? value : '/pages/dashboard';
}

function memoryStorage(initial = {}) {
  const items = { ...initial };
  return {
    items,
    getItem: key => (key in items ? items[key] : null),
    setItem: (key, value) => { items[key] = value; },
    removeItem: key => { delete items[key]; }
  };
}

function callbackUrl(req) {
  // trust proxy esta activo en app.js: en Vercel req.protocol ya es https.
  return `${process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`}/api/auth/google/callback`;
}

function redirectToAuthError(res, reason) {
  res.redirect(303, `${FRONTEND_ORIGIN}/pages/auth?error=${reason}`);
}

async function googleStart(req, res) {
  try {
    const storage = memoryStorage();
    const client = getSupabasePkce(storage);
    const { data, error } = await withTimeout(
      client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl(req), skipBrowserRedirect: true }
      }), 8000, 'auth.signInWithOAuth()'
    );
    if (error || !data?.url) throw error || new Error('Supabase no devolvio la URL de Google');

    res.cookie(PKCE_COOKIE, JSON.stringify({ items: storage.items, returnPath: safeReturnPath(req.query.returnUrl) }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // Lax basta: la vuelta desde Google es una navegacion GET de primer nivel.
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: 10 * 60 * 1000
    });
    res.redirect(303, data.url);
  } catch (err) {
    console.error('[googleStart]', err.message);
    redirectToAuthError(res, 'google');
  }
}

async function googleCallback(req, res) {
  let state = {};
  try { state = JSON.parse(req.cookies?.[PKCE_COOKIE] || '{}'); } catch { /* cookie corrupta: se trata como ausente */ }
  res.clearCookie(PKCE_COOKIE, { path: '/api/auth/google' });

  try {
    const { code, error: oauthError } = req.query;
    // El usuario cancelo en Google, o Supabase rechazo el proveedor.
    if (oauthError || typeof code !== 'string' || !state.items) {
      if (oauthError) console.error('[googleCallback] Error devuelto por el proveedor:', oauthError, req.query.error_description);
      return redirectToAuthError(res, 'google');
    }

    const client = getSupabasePkce(memoryStorage(state.items));
    const { data, error } = await withTimeout(client.auth.exchangeCodeForSession(code), 8000, 'auth.exchangeCodeForSession()');
    if (error || !data?.session) throw error || new Error('Sin sesion tras canjear el codigo');

    if (await revokeIfBlocked(data.session, data.user)) {
      return redirectToAuthError(res, 'bloqueada');
    }

    setAuthCookies(res, data.session);
    res.redirect(303, `${FRONTEND_ORIGIN}${safeReturnPath(state.returnPath)}`);
  } catch (err) {
    console.error('[googleCallback]', err.message);
    redirectToAuthError(res, 'google');
  }
}

module.exports = { register, resendConfirmation, login, forgotPassword, logout, getSession, updateUser, googleStart, googleCallback };
