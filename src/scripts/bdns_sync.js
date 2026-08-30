require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { syncBdns } = require('../services/bdnsSync.service');

const DIAS_HACIA_ATRAS = 365; // sync manual: barrido completo del último año

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(' ERROR: Faltan las variables de entorno de Supabase.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log(' Buscando convocatorias de becas en la BDNS (nacional + Andalucía)...');
    const resultado = await syncBdns(DIAS_HACIA_ATRAS, supabase);

    console.log(` ${resultado.candidatas} convocatorias candidatas encontradas.`);
    console.log(` ${resultado.becasEncontradas} becas abiertas y con datos completos. Sincronizando con Supabase...`);

    for (const err of resultado.errores) {
      console.error(` Error insertando beca [${err.codigo_bdns}]:`, err.error);
    }

    console.log(` Sincronización completada: ${resultado.ok} becas actualizadas, ${resultado.fallos} fallos.`);
    process.exit(resultado.fallos > 0 && resultado.ok === 0 ? 1 : 0);
  } catch (error) {
    console.error(' Error fatal en el sincronizador:', error);
    process.exit(1);
  }
}

main();
