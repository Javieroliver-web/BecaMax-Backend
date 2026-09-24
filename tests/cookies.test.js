'use strict';
// Cookies de sesión en PRODUCCIÓN. El frontend (becamax.vercel.app) y este
// backend están en dominios distintos: todo es una petición cross-site, y
// Chrome rechaza en una respuesta cross-site cualquier cookie que no lleve
// SameSite=None; Secure. Eso vale también para BORRARLA: si el borrado no
// lleva esos atributos, cerrar sesión no borra nada (24/09/2026).
process.env.NODE_ENV = 'production';   // antes de cargar authCookies: lo lee al cargarse

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { setAuthCookies, clearAuthCookies } = require('../src/utils/authCookies');

async function cabecerasSetCookie(accion) {
  const app = express();
  app.get('/', (_req, res) => { accion(res); res.end(); });
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((ok) => servidor.once('listening', ok));
  try {
    const r = await fetch(`http://127.0.0.1:${servidor.address().port}/`);
    return r.headers.getSetCookie();
  } finally {
    servidor.close();
  }
}

const sesion = { access_token: 'acceso', refresh_token: 'refresco', expires_in: 3600 };

function comprobarCrossSite(cookies) {
  assert.strictEqual(cookies.length, 2);
  for (const c of cookies) {
    assert.match(c, /HttpOnly/i, c);
    assert.match(c, /Secure/i, c);
    assert.match(c, /SameSite=None/i, c);
  }
}

test('al iniciar sesión, las dos cookies son HttpOnly, Secure y SameSite=None', async () => {
  const cookies = await cabecerasSetCookie((res) => setAuthCookies(res, sesion));
  comprobarCrossSite(cookies);
  assert.ok(cookies.some((c) => c.startsWith('sb-refresh-token=') && /Path=\/api\/auth/.test(c)),
    'el refresh token solo viaja a los endpoints de auth');
});

test('al cerrar sesión, el borrado lleva los mismos atributos (si no, Chrome lo ignora)', async () => {
  const cookies = await cabecerasSetCookie((res) => clearAuthCookies(res));
  comprobarCrossSite(cookies);
  for (const c of cookies) assert.match(c, /Expires=Thu, 01 Jan 1970/i, 'caducada: se borra');
});
