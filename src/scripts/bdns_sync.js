require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// 1. Inicializar Supabase con SERVICE ROLE KEY (salta RLS)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(" ERROR: Faltan las variables de entorno de Supabase.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// =========================================================
// LÓGICA DE OBTENCIÓN DE DATOS (BDNS / TERCEROS)
// =========================================================
async function fetchBecasBDNS() {
  console.log(" Obteniendo datos de la BDNS...");
  
  // TODO (Desarrollo Futuro): Aquí iría la llamada axios a la API de ApiSpain/BuscoAyudas 
  // o el scraper (puppeteer/cheerio) de la web Infosubvenciones del Gobierno.
  // Ejemplo: const response = await axios.get('https://api.apispain.es/v1/subvenciones?limit=100');
  
  // Como puente para este prototipo MVP, inyectamos los datos iniciales 
  // que antes estaban en el Frontend (data/becas.js).
  const becasSimuladas = [
    {
      id: "1",
      nombre: 'Beca 6000',
      entidad: 'Junta de Andalucía',
      tipo: 'bachillerato',
      region: 'Andalucía',
      area: 'Cualquier área',
      importe_min: 6000,
      importe_max: 6000,
      deadline: '2026-10-01',
      url: 'https://www.juntadeandalucia.es/educacion/portals/web/becas-y-ayudas',
      descripcion: 'Ayuda directa de 6.000 € anuales para estudiantes de Bachillerato o Ciclos Formativos de Grado Medio con escasos recursos para evitar el abandono escolar.',
      requisitos: ['Estar matriculado en Bachillerato o CFGM', 'Renta familiar < 11.939 €', 'Residencia en Andalucía'],
      etiquetas: ['junta', 'bachillerato', 'fp', 'renta', '6000']
    },
    {
      id: "5",
      nombre: 'Beca MEC – Estudios Universitarios',
      entidad: 'Ministerio de Educación',
      tipo: 'universitaria',
      region: 'Nacional',
      area: 'Cualquier área',
      importe_min: 300,
      importe_max: 6000,
      deadline: '2026-10-15',
      url: 'https://www.becaseducacion.gob.es',
      descripcion: 'Becas generales para estudios de grado en universidades públicas. Incluyen exención de tasas y cuantías fijas y variables según renta.',
      requisitos: ['Matrícula mínima 60 créditos', 'Rendimiento académico mínimo', 'Renta familiar por tramos', 'Universidad pública'],
      etiquetas: ['MEC', 'ministerio', 'universitaria', 'grado', 'renta', 'tasas']
    },
    {
      id: "10",
      nombre: 'Becas FPI – Investigación',
      entidad: 'Ministerio de Ciencia',
      tipo: 'investigacion',
      region: 'Nacional',
      area: 'Ciencia y Tecnología',
      importe_min: 16000,
      importe_max: 22000,
      deadline: '2026-05-15',
      url: 'https://www.ciencia.gob.es/becas-fpi',
      descripcion: 'Becas predoctorales para la formación de personal investigador vinculadas a proyectos financiados por el Plan Estatal de I+D+i.',
      requisitos: ['Título de máster o equivalente', 'Vinculación a un proyecto de investigación financiado', 'Expediente excelente'],
      etiquetas: ['FPI', 'investigación', 'doctorado', 'ciencia', 'predoctoral']
    },
    {
      id: "7",
      nombre: 'Erasmus+ Estudios',
      entidad: 'Comisión Europea / Universidad',
      tipo: 'movilidad',
      region: 'Nacional',
      area: 'Cualquier área',
      importe_min: 400,
      importe_max: 700,
      deadline: '2026-04-15',
      url: 'https://www.erasmusplus.gob.es',
      descripcion: 'Beca mensual para realizar un semestre o año académico en una universidad europea. Importe varía por país de destino (400–700 €/mes).',
      requisitos: ['Matriculado en universidad española', 'Nivel B2 idioma destino', 'Expediente académico mínimo'],
      etiquetas: ['Erasmus', 'movilidad', 'internacional', 'europeo', 'intercambio']
    }
  ];

  return becasSimuladas;
}

// =========================================================
// SINCRONIZACIÓN CON SUPABASE (UPSERT)
// =========================================================
async function sync() {
  try {
    const becas = await fetchBecasBDNS();
    console.log(` Obtenidas ${becas.length} becas. Sincronizando con Supabase...`);

    for (const beca of becas) {
      // Upsert: Si el ID ya existe, lo actualiza. Si no, lo crea.
      const { error } = await supabase
        .from('becas')
        .upsert({
          id: beca.id,
          nombre: beca.nombre,
          entidad: beca.entidad,
          descripcion: beca.descripcion,
          importe_min: beca.importe_min,
          importe_max: beca.importe_max,
          deadline: beca.deadline,
          url: beca.url,
          tipo: beca.tipo,
          region: beca.region,
          area: beca.area,
          etiquetas: beca.etiquetas,
          requisitos: beca.requisitos,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (error) {
        console.error(` Error insertando beca [${beca.id}]:`, error.message);
      } else {
        console.log(` Insertada/Actualizada beca: ${beca.nombre}`);
      }
    }
    
    console.log(" Sincronización completada con éxito.");
    process.exit(0);
  } catch (error) {
    console.error(" Error fatal en el sincronizador:", error);
    process.exit(1);
  }
}

// Ejecutar script
sync();
