const ACCESS_COOKIE = 'sb-access-token';
const REFRESH_COOKIE = 'sb-refresh-token';

// En local (npm run dev, http://localhost) el navegador no acepta
// "SameSite=None" sin "Secure", y "Secure" exige HTTPS -- Vercel siempre
// sirve en HTTPS, asi que solo en produccion usamos None+Secure (necesario
// porque el frontend vive en un dominio totalmente distinto,
// becamax.vercel.app vs beca-max-backend.vercel.app: es una peticion
// cross-site de verdad, no solo cross-origin).
const isProd = process.env.NODE_ENV === 'production';

function setAuthCookies(res, session) {
  const accessMaxAge = (session.expires_in || 3600) * 1000;
  const refreshMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 dias, igual que ya documentaba legal/cookies.html

  res.cookie(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: accessMaxAge
  });
  res.cookie(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    // Alcance mas estrecho a proposito: el refresh token solo lo necesitan
    // los propios endpoints de auth, no cada llamada a /api/db o /api/storage.
    path: '/api/auth',
    maxAge: refreshMaxAge
  });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

module.exports = { setAuthCookies, clearAuthCookies, ACCESS_COOKIE, REFRESH_COOKIE };
