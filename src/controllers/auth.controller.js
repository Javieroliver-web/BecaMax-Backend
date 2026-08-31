const { getSupabaseAnon, getSupabaseAsUser } = require('../config/supabaseAnon');
const { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } = require('../utils/authCookies');

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
    res.status(500).json({ status: 'error', message: err.message });
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
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ── Login ──────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password, captchaToken } = req.body;
    const anon = getSupabaseAnon();
    const { data, error } = await anon.auth.signInWithPassword({ email, password, options: { captchaToken } });
    if (error) return res.status(400).json({ status: 'error', message: error.message });

    // Verificacion de bloqueo (misma comprobacion que antes hacia auth.js
    // en el navegador, ahora movida aqui porque el frontend ya no puede
    // leer el token para hacer esta llamada el mismo).
    const asUser = getSupabaseAsUser(data.session.access_token);
    const { data: perfil } = await asUser.from('perfiles').select('estado').eq('user_id', data.user.id).single();

    if (perfil && perfil.estado === 'bloqueado') {
      // Revocar la sesion recien creada: signOut() con este cliente envia
      // el Authorization: Bearer de esta sesion concreta al endpoint de
      // logout de GoTrue, sin necesidad de auth.setSession() previo.
      await asUser.auth.signOut();
      return res.status(403).json({ status: 'error', message: 'Cuenta suspendida por la administración.' });
    }

    setAuthCookies(res, data.session);
    res.json({ status: 'success', data: { session: { user: data.user } } });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
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
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ── Logout ─────────────────────────────────────────────────────
async function logout(req, res) {
  try {
    if (req.accessToken) {
      const asUser = getSupabaseAsUser(req.accessToken);
      await asUser.auth.signOut().catch(() => {}); // best-effort: revocar aunque falle, igual limpiamos cookies
    }
  } finally {
    clearAuthCookies(res);
    res.json({ status: 'success' });
  }
}

// ── Sesion actual (con refresco transparente si hace falta) ────
async function getSession(req, res) {
  try {
    if (req.user) {
      return res.json({ data: { session: { user: req.user } }, error: null });
    }

    // Sin access token valido: intentar refrescar en silencio con el
    // refresh token, igual que hacia el SDK de supabase-js en el navegador
    // en segundo plano (el frontend ya no puede hacerlo el mismo).
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      const anon = getSupabaseAnon();
      const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
      if (!error && data.session) {
        setAuthCookies(res, data.session);
        return res.json({ data: { session: { user: data.user } }, error: null });
      }
    }

    clearAuthCookies(res);
    res.json({ data: { session: null }, error: null });
  } catch (err) {
    res.status(500).json({ data: { session: null }, error: { message: err.message } });
  }
}

// ── Actualizar usuario (nombre, contraseña) ────────────────────
async function updateUser(req, res) {
  try {
    const asUser = getSupabaseAsUser(req.accessToken);
    const { data, error } = await asUser.auth.updateUser(req.body);
    if (error) return res.status(400).json({ status: 'error', message: error.message });
    res.json({ data, error: null });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { register, resendConfirmation, login, forgotPassword, logout, getSession, updateUser };
