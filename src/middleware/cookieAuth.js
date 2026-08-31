const { getSupabaseAsUser } = require('../config/supabaseAnon');
const { ACCESS_COOKIE } = require('../utils/authCookies');

// Adjunta req.user/req.accessToken si la cookie de sesion es valida, pero
// NUNCA bloquea la peticion por si sola (hay rutas, como insertar una
// incidencia, que deben funcionar igual con o sin sesion). Usar requireAuth
// despues, en las rutas que de verdad exigen estar logueado.
async function attachUser(req, res, next) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) { req.user = null; req.accessToken = null; return next(); }

  try {
    const client = getSupabaseAsUser(token);
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) { req.user = null; req.accessToken = null; return next(); }
    req.user = user;
    req.accessToken = token;
  } catch (e) {
    req.user = null;
    req.accessToken = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ status: 'error', message: 'No autenticado' });
  next();
}

module.exports = { attachUser, requireAuth };
