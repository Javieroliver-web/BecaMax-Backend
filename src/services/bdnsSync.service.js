// ============================================================
//  SERVICIO COMPARTIDO: sincronización de becas contra la BDNS
//  Usado tanto por el script manual (src/scripts/bdns_sync.js,
//  `npm run bdns:sync`) como por el cron automático
//  (src/controllers/bdns.controller.js).
// ============================================================

const BDNS_BASE = 'https://www.infosubvenciones.es/bdnstrans/api';
const KEYWORD = 'beca';
const PAGE_SIZE = 100;
const MAX_PAGINAS_BUSQUEDA = 30; // salvaguarda: no pedir páginas indefinidamente
const RETRASO_MS = 300;          // pausa entre peticiones para no abusar del API público

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function quitarAcentos(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function formatFecha(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// La BDNS publica los titulos como el encabezado legal de la resolucion
// (BOE): todo en mayusculas, a veces con saltos de linea y espacios dobles
// incrustados. Usarlo tal cual como "nombre" de la beca queda roto en las
// tarjetas y desentona con el resto del catalogo (ej. "Beca 6000"). Se
// colapsa el espaciado, se pasa a capitalizacion normal cuando el texto es
// predominantemente en mayusculas, y se trunca en un limite razonable para
// una tarjeta/titulo, cortando en palabra completa.
function limpiarNombre(texto, esNombre = false) {
  let limpio = (texto || '').replace(/\s+/g, ' ').trim();
  if (!limpio) return limpio;

  // Los titulos de resolucion de la BDNS suelen seguir el patron
  // "Resolución de/del X por la que se convoca(n)/aprueba(n)/concede(n) Y"
  // -- Y suele ser un nombre bastante mas corto y legible que el titulo
  // legal completo (ej. "las becas del Instituto de Turismo de España" en
  // vez de la resolucion entera). Solo se aplica al campo `nombre` (no a
  // `entidad`, que ya es corto de por si), y solo cuando el patron aparece
  // con claridad -- si no encaja, se deja el texto tal cual, nunca se
  // arriesga a mutilarlo mal para un formato que no se ha visto en pruebas.
  if (esNombre) {
    const m = limpio.match(/\bpor\s+la\s+que\s+se\s+(?:convocan?|aprueban?|conceden?)\s+(.+)/i);
    if (m && m[1] && m[1].trim().length > 15) {
      limpio = m[1].trim();
    }
  }

  const letras = limpio.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  const mayusculas = letras.replace(/[^A-ZÀ-Ý]/g, '');
  if (letras.length > 0 && mayusculas.length / letras.length > 0.8) {
    limpio = limpio.toLowerCase().replace(/(^|[\s\-–—/])([a-zà-ÿ])/g, (m, sep, c) => sep + c.toUpperCase());
  }

  const MAX = 140;
  if (limpio.length > MAX) {
    const corte = limpio.slice(0, MAX);
    const ultimoEspacio = corte.lastIndexOf(' ');
    limpio = (ultimoEspacio > 80 ? corte.slice(0, ultimoEspacio) : corte) + '…';
  }
  return limpio;
}

// =========================================================
// 1. BÚSQUEDA: listar convocatorias candidatas (se filtran por región con el detalle)
// =========================================================
async function buscarCandidatas(diasHaciaAtras) {
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - diasHaciaAtras * 86400000);

  const candidatas = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages && page < MAX_PAGINAS_BUSQUEDA) {
    const url = `${BDNS_BASE}/convocatorias/busqueda?descripcion=${encodeURIComponent(KEYWORD)}` +
      `&fechaDesde=${formatFecha(desde)}&fechaHasta=${formatFecha(hoy)}` +
      `&pageSize=${PAGE_SIZE}&page=${page}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Búsqueda BDNS falló (página ${page}): HTTP ${res.status}`);
    const data = await res.json();

    totalPages = data.totalPages || 1;
    for (const item of data.content || []) {
      // En la búsqueda solo se puede descartar con seguridad lo AUTONÓMICO de
      // otra comunidad (su nivel2 es el nombre de la comunidad). Ayuntamientos,
      // diputaciones y universidades (nivel1 LOCAL/OTROS) traen en nivel2 su
      // propio nombre ("GRANADA", "UNIVERSIDAD DE GRANADA"): hasta el 27/09/2026
      // se descartaban todas, y con ellas las de Andalucía. La región real se
      // decide con el detalle (campo `regiones`), en regionDe().
      if (item.nivel1 === 'AUTONOMICA' && !quitarAcentos(item.nivel2).includes('ANDALUC')) continue;
      candidatas.push(item);
    }

    page++;
    await sleep(RETRASO_MS);
  }

  return candidatas;
}

// =========================================================
// 2. DETALLE: ampliar cada candidata con importe/fechas/url reales
// =========================================================
async function obtenerDetalle(numeroConvocatoria) {
  const url = `${BDNS_BASE}/convocatorias?numConv=${encodeURIComponent(numeroConvocatoria)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// =========================================================
// 3. CLASIFICACIÓN HEURÍSTICA (la BDNS no tiene un campo "tipo" equivalente)
// =========================================================
function clasificarTipo(texto) {
  const t = quitarAcentos(texto);
  if (/ERASMUS|MOVILIDAD|INTERCAMBIO/.test(t)) return 'movilidad';
  if (/DOCTOR|INVESTIGA|FPI|PREDOCTORAL/.test(t)) return 'investigacion';
  if (/MASTER|POSGRADO|POSTGRADO/.test(t)) return 'master';
  if (/UNIVERSITAR|GRADO UNIVERSITARIO|UNIVERSIDAD/.test(t)) return 'universitaria';
  if (/BACHILLERATO/.test(t)) return 'bachillerato';
  if (/\bFP\b|FORMACION PROFESIONAL|CICLO FORMATIVO/.test(t)) return 'fp';
  if (/PRIMARIA|COMEDOR|LIBROS ESCOLARES|INFANTIL/.test(t)) return 'primaria';
  if (/ARTISTIC|CONSERVATORIO|MUSICA|DISEÑO|DISENO/.test(t)) return 'artistica';
  if (/IDIOMA|INGLES|B1|B2|C1/.test(t)) return 'idiomas';
  return 'formacion';
}

function clasificarArea(sectores) {
  const desc = quitarAcentos((sectores || []).map((s) => s.descripcion).join(' '));
  if (/CIENCIA|TECNOLOGIA|INVESTIGACION/.test(desc)) return 'Ciencia y Tecnología';
  if (/ARTE|CULTURA/.test(desc)) return 'Arte y Diseño';
  if (/EMPLEO|FORMACION PROFESIONAL/.test(desc)) return 'Formación Profesional';
  if (/IDIOMA/.test(desc)) return 'Idiomas';
  return 'Cualquier área';
}

// =========================================================
// 4. MAPEO A LA FILA DE public.becas (esquema real de producción:
//    id SERIAL, importe JSONB {min,max}, deadline DATE, etc.)
// =========================================================
// =========================================================
// 3b. REGIÓN: BecaMax solo muestra becas nacionales o de Andalucía.
//     `regiones` trae códigos NUTS ("ES614 - Granada"); Andalucía es ES61.
// =========================================================
function regionDe(detalle) {
  if (!detalle) return null;
  if (detalle.organo?.nivel1 === 'ESTADO') return 'Nacional';
  const codigos = (detalle.regiones || []).map((r) => String(r?.descripcion || '').trim().split(/\s/)[0]);
  if (codigos.some((c) => c.startsWith('ES61'))) return 'Andalucía';
  if (detalle.organo?.nivel1 === 'AUTONOMICA' && quitarAcentos(detalle.organo?.nivel2).includes('ANDALUC')) return 'Andalucía';
  return null;
}

// =========================================================
// 3c. PLAZO: desde septiembre de 2026 la BDNS deja `fechaFinSolicitud` vacía
//     en muchas convocatorias y pone el plazo en texto (`textFin`). Solo se
//     aprovecha cuando el texto trae UNA fecha completa y explícita
//     ("30/10/2026", "7 de octubre de 2026", "16 OCTUBRE 2026"). Los plazos
//     relativos ("15 días hábiles desde la publicación") se descartan: la
//     fecha de publicación en el boletín no viene en la API y calcularla
//     sería inventar un plazo.
// =========================================================
const MESES = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7,
  AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 };

function fechaValida(a, m, d) {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}

function extraerFechaFin(texto) {
  const t = quitarAcentos(texto);
  if (!t) return null;
  const encontradas = new Set();
  for (const m of t.matchAll(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g)) {
    const f = fechaValida(Number(m[3]), Number(m[2]), Number(m[1]));
    if (f) encontradas.add(f);
  }
  for (const m of t.matchAll(/\b(\d{1,2})\s+(?:DE\s+)?([A-Z]+)\s+(?:DE\s+|DEL\s+)?(\d{4})\b/g)) {
    const mes = MESES[m[2]];
    const f = mes && fechaValida(Number(m[3]), mes, Number(m[1]));
    if (f) encontradas.add(f);
  }
  // Dos fechas distintas (p. ej. "del 1/10/2026 al 30/10/2026") ya no son
  // inequívocas: mejor no mostrar la beca que mostrar un plazo equivocado.
  return encontradas.size === 1 ? [...encontradas][0] : null;
}

function mapearABeca(detalle, region) {
  if (!detalle) return null;
  // OJO: el flag "abierto" de la BDNS no es fiable como señal de vigencia
  // (en la práctica aparece en false incluso para convocatorias con una
  // fechaFinSolicitud real todavía futura); el único dato que importa es
  // si el plazo de solicitud sigue vigente.
  const deadline = detalle.fechaFinSolicitud
    ? detalle.fechaFinSolicitud.slice(0, 10)
    : extraerFechaFin(detalle.textFin);
  if (!deadline) return null; // sin fecha real, no la mostramos
  if (deadline < new Date().toISOString().slice(0, 10)) return null; // ya cerrada

  if (!detalle.urlBasesReguladoras) return null; // sin fuente oficial verificable, se omite

  const entidad = limpiarNombre(detalle.organo?.nivel3 || detalle.organo?.nivel2 || 'Administración Pública');

  return {
    codigo_bdns: String(detalle.codigoBDNS),
    nombre: limpiarNombre(detalle.descripcion, true),
    entidad,
    // La BDNS solo publica el presupuesto TOTAL de la convocatoria, no el
    // importe individual por beneficiario: mostrar ese total como si fuera
    // la cuantía de una beca induciría a error. Se deja en null (el
    // frontend ya muestra "Consultar" cuando importe es null) y se remite
    // a las bases oficiales.
    importe: null,
    deadline,
    url: detalle.urlBasesReguladoras,
    descripcion: (detalle.descripcionFinalidad ? `${detalle.descripcionFinalidad}. ` : '') +
      'Importe y requisitos exactos en las bases reguladoras oficiales.',
    tipo: clasificarTipo(detalle.descripcion),
    region,
    area: clasificarArea(detalle.sectores),
    etiquetas: ['bdns', region === 'Nacional' ? 'nacional' : 'andalucia'],
    requisitos: ['Consulta los requisitos completos en las bases reguladoras oficiales (enlace de la beca).'],
    updated_at: new Date().toISOString()
  };
}

// =========================================================
// 5. SINCRONIZACIÓN CON SUPABASE (UPSERT por codigo_bdns)
// =========================================================
async function syncBdns(diasHaciaAtras, supabase) {
  const candidatas = await buscarCandidatas(diasHaciaAtras);

  const becas = [];
  for (const c of candidatas) {
    const detalle = await obtenerDetalle(c.numeroConvocatoria);
    const region = regionDe(detalle);
    const beca = region ? mapearABeca(detalle, region) : null;
    if (beca) becas.push(beca);
    await sleep(RETRASO_MS);
  }

  let ok = 0, fallos = 0;
  const errores = [];
  for (const beca of becas) {
    const { error } = await supabase
      .from('becas')
      .upsert(beca, { onConflict: 'codigo_bdns' });

    if (error) {
      fallos++;
      errores.push({ codigo_bdns: beca.codigo_bdns, error: error.message });
    } else {
      ok++;
    }
  }

  return { candidatas: candidatas.length, becasEncontradas: becas.length, ok, fallos, errores };
}

module.exports = { syncBdns, regionDe, extraerFechaFin, mapearABeca };
