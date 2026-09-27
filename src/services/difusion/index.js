// ============================================================
//  DIFUSIÓN AUTOMÁTICA DE BECAS NUEVAS EN REDES
//
//  publicarNovedades(supabase, { dryRun }) busca becas de la BDNS vigentes
//  (plazo >= hoy + 3 días) que aún no se han publicado en cada canal activo
//  y publica como mucho DIFUSION_MAX_POR_EJECUCION (5) por canal.
//
//  Idempotencia: public.difusion_publicaciones (supabase/difusion_setup.sql).
//  Antes de publicar se RESERVA la fila (estado 'publicando'); así, si el
//  post sale pero no se puede apuntar, no se vuelve a publicar nunca.
//  Las 20 becas de ejemplo no tienen codigo_bdns: nunca se publican.
// ============================================================

const { componerMensaje, motivoNoPublicable } = require('./plantilla');
const { ErrorCanal } = require('./errores');

const TODOS_LOS_CANALES = [require('./canales/telegram'), require('./canales/bluesky')];

const MAX_INTENTOS = 3;
const DIAS_DE_MARGEN = 3; // no anunciar becas que cierran en menos de 3 días
const MAX_POR_DEFECTO = 5;
const TABLA = 'difusion_publicaciones';

const avisados = new Set();
function avisarUnaVez(clave, texto) {
  if (avisados.has(clave)) return;
  avisados.add(clave);
  console.warn(texto);
}

// Fecha de hoy (+ días) en España, como 'YYYY-MM-DD'.
function fechaEspana(ahora, masDias = 0) {
  const d = new Date(ahora.getTime() + masDias * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}

function maxPorEjecucion(env) {
  const n = Number.parseInt(env.DIFUSION_MAX_POR_EJECUCION, 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 20) : MAX_POR_DEFECTO;
}

function canalesActivos(env, dryRun, canales) {
  return canales.filter((canal) => {
    if (dryRun) return true; // en prueba se enseña lo que recibiría cada canal
    if (env[`DIFUSION_${canal.nombre.toUpperCase()}`] !== 'on') return false;
    if (!canal.credenciales(env)) {
      avisarUnaVez(canal.nombre, `[difusion] DIFUSION_${canal.nombre.toUpperCase()}=on pero faltan sus credenciales: el canal ${canal.nombre} se omite.`);
      return false;
    }
    return true;
  });
}

const recorte = (texto) => String(texto || '').slice(0, 500);

// Reserva la fila antes de publicar. Devuelve false si otra ejecución ya la
// tiene (o ya no le quedan intentos).
async function reservar(supabase, codigo, canal, previa) {
  if (!previa) {
    const { error } = await supabase.from(TABLA).insert({ codigo_bdns: codigo, canal, estado: 'publicando', intentos: 0 });
    if (!error) return true;
    if (error.code === '23505') return false; // ya existe: otra ejecución llegó antes
    throw new Error(`no se pudo reservar: ${error.message}`);
  }
  const { data, error } = await supabase.from(TABLA)
    .update({ estado: 'publicando', actualizado_en: new Date().toISOString() })
    .eq('codigo_bdns', codigo).eq('canal', canal).eq('estado', 'error').lt('intentos', MAX_INTENTOS)
    .select('codigo_bdns');
  if (error) throw new Error(`no se pudo reservar: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

async function apuntar(supabase, codigo, canal, campos) {
  const { error } = await supabase.from(TABLA)
    .update({ ...campos, actualizado_en: new Date().toISOString() })
    .eq('codigo_bdns', codigo).eq('canal', canal);
  if (error) throw new Error(`no se pudo apuntar el resultado: ${error.message}`);
}

/**
 * @param {object} supabase  Cliente con la service key.
 * @param {object} [opciones]
 * @param {boolean} [opciones.dryRun=false]  No publica ni escribe nada.
 * @returns {Promise<{dryRun:boolean, becasVigentes:number, canales:Record<string, object>}>}
 */
async function publicarNovedades(supabase, opciones = {}) {
  const {
    dryRun = false,
    env = process.env,
    fetchImpl = fetch,
    ahora = new Date(),
    canales: canalesDisponibles = TODOS_LOS_CANALES,
  } = opciones;

  const resumen = { dryRun, becasVigentes: 0, canales: {} };
  const canales = canalesActivos(env, dryRun, canalesDisponibles);
  if (canales.length === 0) return resumen;

  const hoy = fechaEspana(ahora);
  let consulta = supabase.from('becas')
    .select('id, codigo_bdns, nombre, entidad, importe, deadline, region, url, created_at')
    .not('codigo_bdns', 'is', null)
    .gte('deadline', fechaEspana(ahora, DIAS_DE_MARGEN));
  // Para no anunciar en bloque, como si fueran nuevas, becas que ya llevaban
  // meses en la web (p. ej. tras un `npm run bdns:sync` de 365 días).
  if (/^\d{4}-\d{2}-\d{2}$/.test(env.DIFUSION_DESDE || '')) consulta = consulta.gte('created_at', env.DIFUSION_DESDE);
  const { data: becas, error: errorBecas } = await consulta.order('created_at', { ascending: true }).limit(500);
  if (errorBecas) throw new Error(`no se pudieron leer las becas: ${errorBecas.message}`);

  resumen.becasVigentes = becas.length;
  if (becas.length === 0) {
    for (const canal of canales) resumen.canales[canal.nombre] = { publicadas: 0, errores: 0, omitidas: 0, pendientes: 0, propuestas: [] };
    return resumen;
  }

  const { data: previas, error: errorPrevias } = await supabase.from(TABLA)
    .select('codigo_bdns, canal, estado, intentos')
    .in('codigo_bdns', becas.map((b) => b.codigo_bdns));
  if (errorPrevias && !dryRun) throw new Error(`no se pudo leer ${TABLA} (¿falta ejecutar supabase/difusion_setup.sql?): ${errorPrevias.message}`);
  if (errorPrevias) console.warn(`[difusion] prueba sin ${TABLA}: se trata como vacía (${errorPrevias.message})`);
  const estadoPrevio = new Map((previas || []).map((p) => [`${p.codigo_bdns}|${p.canal}`, p]));

  const max = maxPorEjecucion(env);
  const frontendUrl = env.FRONTEND_URL || undefined;

  for (const canal of canales) {
    const r = { publicadas: 0, errores: 0, omitidas: 0, pendientes: 0, parado: null, primerError: null, propuestas: [] };
    resumen.canales[canal.nombre] = r;

    const candidatas = becas.filter((b) => {
      const previa = estadoPrevio.get(`${b.codigo_bdns}|${canal.nombre}`);
      return !previa || (previa.estado === 'error' && previa.intentos < MAX_INTENTOS);
    });
    r.pendientes = candidatas.length;

    let usadas = 0;
    for (const beca of candidatas) {
      if (usadas >= max) break;
      const previa = estadoPrevio.get(`${beca.codigo_bdns}|${canal.nombre}`);

      if (motivoNoPublicable(beca, hoy)) { r.omitidas++; continue; }
      let mensaje;
      try {
        mensaje = componerMensaje(beca, { canal: canal.nombre, limite: canal.limite, incluirEnlace: canal.incluirEnlace, frontendUrl });
      } catch {
        r.omitidas++;
        continue;
      }
      usadas++;

      if (dryRun) {
        r.propuestas.push({ codigo_bdns: beca.codigo_bdns, texto: mensaje.texto });
        continue;
      }

      try {
        if (!(await reservar(supabase, beca.codigo_bdns, canal.nombre, previa))) continue;
      } catch (err) {
        r.parado = err.message;
        r.primerError = r.primerError || err.message;
        break;
      }

      const intentosPrevios = previa?.intentos || 0;
      let resultado;
      try {
        resultado = await canal.publicar({ ...mensaje, beca }, { env, fetchImpl });
      } catch (err) {
        r.errores++;
        r.primerError = r.primerError || recorte(err.message);
        const esDelCanal = err instanceof ErrorCanal;
        try {
          // Un fallo del canal no gasta intento de la beca: se reintenta mañana.
          await apuntar(supabase, beca.codigo_bdns, canal.nombre, {
            estado: 'error', error: recorte(err.message), intentos: esDelCanal ? intentosPrevios : intentosPrevios + 1,
          });
        } catch (errApunte) {
          r.parado = errApunte.message;
          break;
        }
        if (esDelCanal) { r.parado = recorte(err.message); break; }
        continue;
      }

      r.publicadas++;
      try {
        await apuntar(supabase, beca.codigo_bdns, canal.nombre, {
          estado: 'publicado', referencia_externa: resultado?.referencia || null, error: null, intentos: intentosPrevios + 1,
        });
      } catch (errApunte) {
        // El post ya salió y la fila sigue en 'publicando': no se repetirá.
        r.parado = errApunte.message;
        r.primerError = r.primerError || errApunte.message;
        break;
      }
    }
  }
  return resumen;
}

module.exports = { publicarNovedades, MAX_INTENTOS, TODOS_LOS_CANALES };
