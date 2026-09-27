// ============================================================
//  PLANTILLA DE DIFUSIÓN: beca -> texto para una red social.
//
//  Función pura, sin IA: solo usa campos reales de public.becas. Si un dato
//  falta, su línea no aparece (nunca se rellena con nada inventado).
// ============================================================

const FRONTEND_POR_DEFECTO = 'https://becamax.vercel.app';

// 'YYYY-MM-DD' -> 'dd/mm/aaaa' sin pasar por Date (evita el desfase de zona
// horaria que convierte el 31/10 en 30/10 al leer una fecha sin hora).
function formatearFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

const euros = (n) => `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
const esImporte = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

function formatearImporte(importe) {
  if (!importe || typeof importe !== 'object') return null;
  const { min, max } = importe;
  if (esImporte(min) && esImporte(max)) return min === max ? euros(max) : `${euros(min)} – ${euros(max)}`;
  if (esImporte(max)) return `Hasta ${euros(max)}`;
  if (esImporte(min)) return `Desde ${euros(min)}`;
  return null;
}

function esUrlValida(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// Enlace a la ficha en BecaMax (pages/beca-detalle.html es pública en
// navegacion.js del frontend, así que abre bien desde fuera).
function enlaceFicha(beca, canal, frontendUrl = FRONTEND_POR_DEFECTO) {
  if (!Number.isInteger(beca?.id) || beca.id <= 0) return null;
  const u = new URL('/pages/beca-detalle.html', frontendUrl);
  u.searchParams.set('id', String(beca.id));
  u.searchParams.set('utm_source', canal);
  u.searchParams.set('utm_medium', 'social');
  u.searchParams.set('utm_campaign', 'difusion');
  return u.toString();
}

// Motivo por el que una beca NO se puede publicar, o null si se puede.
function motivoNoPublicable(beca, hoyIso) {
  if (!beca?.codigo_bdns) return 'sin codigo_bdns';
  if (!beca.nombre || !String(beca.nombre).trim()) return 'sin nombre';
  if (!formatearFecha(beca.deadline)) return 'sin plazo';
  if (hoyIso && String(beca.deadline).slice(0, 10) < hoyIso) return 'caducada';
  if (!esUrlValida(beca.url)) return 'sin enlace oficial válido';
  if (!enlaceFicha(beca, 'x')) return 'sin id para la ficha';
  return null;
}

const recortar = (texto, max) => {
  const t = String(texto).trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, Math.max(1, max - 1));
  const espacio = corte.lastIndexOf(' ');
  return (espacio > max * 0.6 ? corte.slice(0, espacio) : corte).trimEnd() + '…';
};

/**
 * @param {object} beca  Fila de public.becas.
 * @param {object} opciones
 * @param {string} opciones.canal          'telegram' | 'bluesky' | ...
 * @param {number} opciones.limite         Máximo de caracteres del mensaje.
 * @param {boolean} [opciones.incluirEnlace=true]  false si el canal pone el enlace aparte (tarjeta).
 * @param {string} [opciones.frontendUrl]
 * @returns {{ texto: string, enlace: string }}
 */
function componerMensaje(beca, { canal, limite, incluirEnlace = true, frontendUrl } = {}) {
  const enlace = enlaceFicha(beca, canal, frontendUrl);
  const importe = formatearImporte(beca.importe);
  const plazo = formatearFecha(beca.deadline);

  const cola = [
    importe && `💶 ${importe}`,
    plazo && `📅 Plazo: hasta el ${plazo}`,
    beca.region && `📍 ${beca.region}`,
    incluirEnlace && `👉 ${enlace}`,
    'Fuente: BDNS',
  ].filter(Boolean);
  const entidad = beca.entidad ? `🏛️ ${String(beca.entidad).trim()}` : null;

  const montar = (nombre, conEntidad) =>
    [`🎓 ${nombre}`, conEntidad && entidad, ...cola].filter(Boolean).join('\n');

  // Longitud en "caracteres visibles" (Bluesky cuenta grafemas, no bytes).
  const largo = (t) => [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(t)].length;

  let texto = montar(String(beca.nombre).trim(), true);
  if (limite && largo(texto) > limite) {
    // 1º se acorta el nombre; si aun así no cabe, se quita la entidad.
    for (const conEntidad of [true, false]) {
      const fijo = largo(montar('', conEntidad));
      const hueco = limite - fijo;
      if (hueco >= 20) {
        texto = montar(recortar(beca.nombre, hueco), conEntidad);
        if (largo(texto) <= limite) break;
      }
    }
    if (largo(texto) > limite) throw new Error(`No cabe en ${limite} caracteres`);
  }
  return { texto, enlace };
}

module.exports = { componerMensaje, motivoNoPublicable, formatearFecha, formatearImporte, enlaceFicha };
