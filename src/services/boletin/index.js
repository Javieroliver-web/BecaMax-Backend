// ============================================================
//  BOLETÍN SEMANAL POR CORREO (doble confirmación, RGPD)
//
//  - darDeAlta: guarda el consentimiento y manda el correo de confirmación.
//    No se envía ningún boletín hasta que la persona pulsa ese enlace.
//  - confirmar / darDeBaja: enlaces de un solo clic. La baja BORRA la fila.
//  - enviarBoletinSemanal: los lunes, becas nuevas de la semana y las que
//    cierran en 14 días. Solo datos reales de public.becas.
//
//  Supabase y el correo se reciben como parámetros para poder probarlo
//  sin red (tests/boletin.test.js).
// ============================================================

const crypto = require('node:crypto');
const { formatearFecha } = require('../difusion/plantilla');

// El texto que acepta la persona lo fija el backend por versión: así lo que
// se guarda como prueba es exactamente lo que se le enseñó.
const CONSENTIMIENTOS = {
  '2026-10': 'Quiero recibir el boletín semanal de BecaMax con las becas nuevas y los plazos que cierran pronto. '
    + 'Puedo darme de baja en cualquier momento con el enlace de cada correo. He leído la política de privacidad.',
};

const HORAS_CONFIRMACION = 48;
const MINUTOS_ENTRE_CONFIRMACIONES = 10;
const DIAS_PENDIENTE_MAX = 7;
const DIAS_ENTRE_BOLETINES = 6;   // si el cron se dispara dos veces, no se repite
const MAX_BECAS_POR_BLOQUE = 10;
const TAMANO_LOTE = 100;          // máximo de resend.batch.send

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function normalizarEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

const token = () => crypto.randomBytes(32).toString('base64url');
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const iso = (d) => d.toISOString();
const masDias = (d, n) => new Date(d.getTime() + n * 86400000);
const fechaEspana = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);

const escapar = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function urls(env = process.env) {
  return {
    frontend: (env.FRONTEND_URL || 'https://becamax.vercel.app').replace(/\/+$/, ''),
    backend: (env.BACKEND_URL || 'https://beca-max-backend.vercel.app').replace(/\/+$/, ''),
  };
}

// ---------------------------------------------------------------- alta

async function darDeAlta(supabase, correo, { email, version, ahora = new Date(), env = process.env } = {}) {
  const e = normalizarEmail(email);
  const texto = CONSENTIMIENTOS[version];
  if (!e || !texto) return 'invalido';

  const { data: filas, error } = await supabase.from('suscriptores_boletin')
    .select('id, confirmado_en, confirmacion_enviada_en').eq('email', e).limit(1);
  if (error) throw new Error(`leer suscriptor: ${error.message}`);
  const previa = filas?.[0];

  if (previa?.confirmado_en) return 'ya_confirmado';
  if (previa?.confirmacion_enviada_en
      && ahora - new Date(previa.confirmacion_enviada_en) < MINUTOS_ENTRE_CONFIRMACIONES * 60000) return 'esperar';

  const tConfirmacion = token();
  const campos = {
    token_confirmacion_hash: hash(tConfirmacion),
    confirmacion_expira_en: iso(new Date(ahora.getTime() + HORAS_CONFIRMACION * 3600000)),
    confirmacion_enviada_en: iso(ahora),
    consentimiento_texto: texto,
    consentimiento_version: version,
    consentimiento_en: iso(ahora),
  };
  const escritura = previa
    ? supabase.from('suscriptores_boletin').update(campos).eq('id', previa.id)
    : supabase.from('suscriptores_boletin').insert({ email: e, token_baja: token(), ...campos });
  const { error: errorEscritura } = await escritura;
  if (errorEscritura) {
    if (errorEscritura.code === '23505') return 'esperar'; // dos altas a la vez
    throw new Error(`guardar suscriptor: ${errorEscritura.message}`);
  }

  const { backend } = urls(env);
  const enlace = `${backend}/api/boletin/confirmar?token=${tConfirmacion}`;
  await correo.enviar({
    to: e,
    subject: 'Confirma tu suscripción al boletín de BecaMax',
    html: `<p>Hola:</p>
<p>Alguien (esperamos que tú) ha pedido recibir en esta dirección el boletín semanal de BecaMax con becas nuevas y plazos que cierran pronto.</p>
<p><a href="${escapar(enlace)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Sí, quiero recibirlo</a></p>
<p>El enlace caduca en ${HORAS_CONFIRMACION} horas. Si no has sido tú, ignora este correo: no te escribiremos más y tu dirección se borrará en ${DIAS_PENDIENTE_MAX} días.</p>
<p style="color:#666;font-size:12px">BecaMax · Responsable y derechos en la política de privacidad: ${escapar(urls(env).frontend)}/pages/legal/privacidad.html</p>`,
    text: `Confirma tu suscripción al boletín semanal de BecaMax:\n${enlace}\n\nCaduca en ${HORAS_CONFIRMACION} horas. Si no has sido tú, ignora este correo: tu dirección se borrará en ${DIAS_PENDIENTE_MAX} días.`,
  });
  return 'enviado';
}

// ---------------------------------------------------------------- confirmar y baja

async function confirmar(supabase, t, { ahora = new Date() } = {}) {
  if (!TOKEN.test(String(t))) return 'invalido';
  const { data, error } = await supabase.from('suscriptores_boletin')
    .select('id, confirmado_en, confirmacion_expira_en').eq('token_confirmacion_hash', hash(t)).limit(1);
  if (error) throw new Error(`leer confirmación: ${error.message}`);
  const fila = data?.[0];
  if (!fila) return 'invalido';
  if (new Date(fila.confirmacion_expira_en) < ahora) return 'caducado';
  const { error: e2 } = await supabase.from('suscriptores_boletin')
    .update({ confirmado_en: iso(ahora), token_confirmacion_hash: null, confirmacion_expira_en: null }).eq('id', fila.id);
  if (e2) throw new Error(`confirmar: ${e2.message}`);
  return 'confirmado';
}

async function darDeBaja(supabase, t) {
  if (!TOKEN.test(String(t))) return 'invalido';
  const { error } = await supabase.from('suscriptores_boletin').delete().eq('token_baja', String(t));
  if (error) throw new Error(`baja: ${error.message}`);
  return 'baja'; // idempotente: si ya no existía, el resultado para la persona es el mismo
}

// ---------------------------------------------------------------- boletín

function enlaceBeca(frontend, id) {
  return `${frontend}/pages/beca-detalle.html?id=${encodeURIComponent(id)}&utm_source=boletin&utm_medium=email&utm_campaign=boletin_semanal`;
}

function bloqueHtml(titulo, becas, frontend) {
  if (!becas.length) return '';
  const items = becas.map((b) => {
    const datos = [b.entidad, b.region, formatearFecha(b.deadline) && `plazo hasta el ${formatearFecha(b.deadline)}`].filter(Boolean).map(escapar).join(' · ');
    return `<li style="margin-bottom:12px"><a href="${escapar(enlaceBeca(frontend, b.id))}" style="color:#4f46e5;font-weight:600">${escapar(b.nombre)}</a><br><span style="color:#555;font-size:13px">${datos}</span></li>`;
  }).join('');
  return `<h2 style="font-size:17px;margin:24px 0 8px">${escapar(titulo)}</h2><ul style="padding-left:18px;margin:0">${items}</ul>`;
}

function bloqueTexto(titulo, becas, frontend) {
  if (!becas.length) return '';
  return `${titulo}\n` + becas.map((b) => `- ${b.nombre}${formatearFecha(b.deadline) ? ` (plazo hasta el ${formatearFecha(b.deadline)})` : ''}\n  ${enlaceBeca(frontend, b.id)}`).join('\n') + '\n\n';
}

function componerBoletin({ nuevas, cierran }, enlaceBaja, env = process.env) {
  const { frontend } = urls(env);
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111">
<h1 style="font-size:20px">Becas de la semana en BecaMax</h1>
${bloqueHtml('Nuevas esta semana', nuevas, frontend)}
${bloqueHtml('Cierran en los próximos 14 días', cierran, frontend)}
<p style="margin-top:24px;font-size:13px;color:#555">Fuente: Base de Datos Nacional de Subvenciones (BDNS). Revisa siempre las bases oficiales antes de solicitar.</p>
<p style="font-size:12px;color:#777">Recibes este correo porque te suscribiste al boletín de BecaMax. <a href="${escapar(enlaceBaja)}">Darme de baja</a> (un clic, sin iniciar sesión).</p>
</div>`;
  const text = `Becas de la semana en BecaMax\n\n${bloqueTexto('NUEVAS ESTA SEMANA', nuevas, frontend)}${bloqueTexto('CIERRAN EN LOS PRÓXIMOS 14 DÍAS', cierran, frontend)}Fuente: BDNS. Revisa siempre las bases oficiales.\n\nDarme de baja: ${enlaceBaja}`;
  return { subject: `Becas de la semana: ${nuevas.length} nuevas y ${cierran.length} que cierran pronto`, html, text };
}

async function seleccionarBecas(supabase, ahora) {
  const hoy = fechaEspana(ahora);
  const campos = 'id, codigo_bdns, nombre, entidad, region, deadline, url, created_at';
  const [r1, r2] = await Promise.all([
    supabase.from('becas').select(campos).not('codigo_bdns', 'is', null)
      .gte('created_at', iso(masDias(ahora, -7))).gte('deadline', hoy)
      .order('deadline', { ascending: true }).limit(MAX_BECAS_POR_BLOQUE),
    supabase.from('becas').select(campos).not('codigo_bdns', 'is', null)
      .gte('deadline', hoy).lte('deadline', fechaEspana(masDias(ahora, 14)))
      .order('deadline', { ascending: true }).limit(MAX_BECAS_POR_BLOQUE * 2),
  ]);
  if (r1.error || r2.error) throw new Error(`leer becas: ${(r1.error || r2.error).message}`);
  const nuevas = r1.data || [];
  const yaNuevas = new Set(nuevas.map((b) => b.id));
  const cierran = (r2.data || []).filter((b) => !yaNuevas.has(b.id)).slice(0, MAX_BECAS_POR_BLOQUE);
  return { nuevas, cierran };
}

async function enviarBoletinSemanal(supabase, correo, { ahora = new Date(), env = process.env, dryRun = false } = {}) {
  const resumen = { suscriptores: 0, enviados: 0, errores: 0, primerError: null, pendientesBorrados: 0, becas: { nuevas: 0, cierran: 0 } };

  // Limpieza RGPD: altas sin confirmar de más de 7 días.
  if (!dryRun) {
    const { data: borrados, error } = await supabase.from('suscriptores_boletin').delete()
      .is('confirmado_en', null).lt('creado_en', iso(masDias(ahora, -DIAS_PENDIENTE_MAX))).select('id');
    if (error) throw new Error(`limpiar pendientes: ${error.message}`);
    resumen.pendientesBorrados = borrados?.length || 0;
  }

  const becas = await seleccionarBecas(supabase, ahora);
  resumen.becas = { nuevas: becas.nuevas.length, cierran: becas.cierran.length };
  if (!becas.nuevas.length && !becas.cierran.length) return resumen; // nada que contar: no se manda

  const { data: subs, error } = await supabase.from('suscriptores_boletin')
    .select('id, email, token_baja, ultimo_envio_en').not('confirmado_en', 'is', null);
  if (error) throw new Error(`leer suscriptores: ${error.message}`);
  const limiteRepeticion = masDias(ahora, -DIAS_ENTRE_BOLETINES);
  const destinatarios = (subs || []).filter((s) => !s.ultimo_envio_en || new Date(s.ultimo_envio_en) < limiteRepeticion);
  resumen.suscriptores = destinatarios.length;
  if (dryRun || !destinatarios.length) return resumen;

  const { backend } = urls(env);
  for (let i = 0; i < destinatarios.length; i += TAMANO_LOTE) {
    const lote = destinatarios.slice(i, i + TAMANO_LOTE);
    const mensajes = lote.map((s) => {
      const enlaceBaja = `${backend}/api/boletin/baja?token=${s.token_baja}`;
      return {
        to: s.email,
        ...componerBoletin(becas, enlaceBaja, env),
        // Baja con un clic desde el propio cliente de correo (RFC 8058).
        headers: { 'List-Unsubscribe': `<${enlaceBaja}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      };
    });
    try {
      await correo.enviarLote(mensajes);
    } catch (err) {
      resumen.errores += lote.length;
      resumen.primerError = resumen.primerError || String(err.message).slice(0, 300);
      continue;
    }
    const { error: e2 } = await supabase.from('suscriptores_boletin')
      .update({ ultimo_envio_en: iso(ahora) }).in('id', lote.map((s) => s.id));
    if (e2) {
      resumen.primerError = resumen.primerError || `apuntar envío: ${e2.message}`;
    }
    resumen.enviados += lote.length;
  }
  return resumen;
}

module.exports = {
  CONSENTIMIENTOS, normalizarEmail, darDeAlta, confirmar, darDeBaja,
  componerBoletin, seleccionarBecas, enviarBoletinSemanal,
};
