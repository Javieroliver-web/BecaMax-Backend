// Difusión manual:
//   npm run difusion -- --dry-run   → enseña lo que se publicaría (no publica ni escribe nada)
//   npm run difusion                → publica de verdad en los canales con DIFUSION_<CANAL>=on
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { publicarNovedades } = require('../services/difusion');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error(' ERROR: Faltan las variables de entorno de Supabase.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const resumen = await publicarNovedades(supabase, { dryRun });

  console.log(dryRun ? ' PRUEBA (--dry-run): no se publica nada.' : ' Publicación real.');
  console.log(` Becas de la BDNS vigentes (plazo >= hoy + 3 días): ${resumen.becasVigentes}`);
  if (Object.keys(resumen.canales).length === 0) console.log(' Ningún canal activo (DIFUSION_TELEGRAM=on y sus credenciales).');
  for (const [canal, r] of Object.entries(resumen.canales)) {
    console.log(`\n=== ${canal}: ${r.pendientes} pendientes, ${r.publicadas} publicadas, ${r.errores} fallos, ${r.omitidas} omitidas`);
    if (r.parado) console.log(`   Canal parado: ${r.parado}`);
    for (const p of r.propuestas) console.log(`\n--- ${p.codigo_bdns}\n${p.texto}`);
  }
  process.exit(Object.values(resumen.canales).some((r) => r.errores > 0 || r.parado) ? 1 : 0);
}

main().catch((err) => {
  console.error(' Error en la difusión:', err.message);
  process.exit(1);
});
