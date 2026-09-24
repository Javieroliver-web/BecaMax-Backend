const ACCESS_COOKIE = 'sb-access-token';
const REFRESH_COOKIE = 'sb-refresh-token';

// En local (npm run dev, http://localhost) el navegador no acepta
// "SameSite=None" sin "Secure", y "Secure" exige HTTPS -- Vercel siempre
// sirve en HTTPS, asi que solo en produccion usamos None+Secure (necesario
// porque el frontend vive en un dominio totalmente distinto,
// becamax.vercel.app vs beca-max-backend.vercel.app: es una peticion
// cross-site de verdad, no solo cross-origin).
const isProd = process.env.NODE_ENV === 'production';

// Los atributos de cada cookie, iguales al crearla y al BORRARLA. Hasta el
// 24/09/2026 el borrado iba sin Secure ni SameSite=None, y Chrome ignora en
// una respuesta cross-site cualquier cookie sin ellos: al cerrar sesión, la de
// acceso seguía en el navegador hasta una hora y la web te veía conectado.
function opciones(path) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path,
  };
}

function setAuthCookies(res, session) {
  const accessMaxAge = (session.expires_in || 3600) * 1000;
  const refreshMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 dias, igual que ya documentaba legal/cookies.html

  res.cookie(ACCESS_COOKIE, session.access_token, { ...opciones('/'), maxAge: accessMaxAge });
  // Alcance mas estrecho a proposito: el refresh token solo lo necesitan
  // los propios endpoints de auth, no cada llamada a /api/db o /api/storage.
  res.cookie(REFRESH_COOKIE, session.refresh_token, { ...opciones('/api/auth'), maxAge: refreshMaxAge });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, opciones('/'));
  res.clearCookie(REFRESH_COOKIE, opciones('/api/auth'));
}

module.exports = { setAuthCookies, clearAuthCookies, ACCESS_COOKIE, REFRESH_COOKIE };
