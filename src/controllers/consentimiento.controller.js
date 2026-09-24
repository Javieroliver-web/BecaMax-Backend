// Registro del consentimiento de cookies (RGPD art. 7.1: poder DEMOSTRAR que
// se consintió). Ver supabase/consentimientos_cookies_setup.sql.
//
// Minimización: ni IP ni usuario. El navegador guarda un identificador
// aleatorio (consent_id) y con eso basta para probar qué eligió y cuándo.
// Lo escribe solo este endpoint, con la clave de servicio; lo lee solo el admin.
const supabaseServicio = require('../config/supabase');
const { serverError } = require('../utils/serverError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^\d{4}-\d{2}$/;
const ACCIONES = new Set(['aceptar_todo', 'rechazar', 'personalizar']);
const MESES_CONSERVACION = 24;   // lo que recomienda la AEPD para renovarlo

async function registrar(req, res) {
  const { consent_id, analisis, marketing, accion, version_politica } = req.body || {};
  if (!UUID.test(String(consent_id)) || typeof analisis !== 'boolean' || typeof marketing !== 'boolean'
      || !ACCIONES.has(accion) || !VERSION.test(String(version_politica))) {
    return res.status(400).json({ status: 'error', message: 'Consentimiento no válido' });
  }
  try {
    const { error } = await supabaseServicio.from('consentimientos_cookies').insert([{
      consent_id, analisis, marketing, accion, version_politica,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 200) || null,
    }]);
    if (error) throw error;

    // Los de más de 24 meses ya no prueban nada vigente: se borran aquí
    // mismo (tabla pequeña, con índice por fecha). Si falla, no importa.
    const limite = new Date();
    limite.setMonth(limite.getMonth() - MESES_CONSERVACION);
    await supabaseServicio.from('consentimientos_cookies').delete().lt('creado', limite.toISOString());

    res.status(201).json({ status: 'success' });
  } catch (err) {
    return serverError(res, err, 'consentimiento.registrar');
  }
}

module.exports = { registrar };
