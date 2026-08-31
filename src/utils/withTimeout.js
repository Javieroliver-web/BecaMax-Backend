// Ninguna llamada de red a un servicio externo deberia esperarse sin limite
// en una funcion serverless: si Supabase Auth se queda colgado o muy lento
// (cuota agotada, degradacion puntual...), sin esto la peticion del usuario
// se queda esperando indefinidamente en vez de fallar rapido con un error
// legible. Bug real encontrado en produccion: getSession()/attachUser()
// se quedaban colgados sin resolver nunca, sin ningun error en los logs.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout tras ${ms}ms esperando a ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { withTimeout };
