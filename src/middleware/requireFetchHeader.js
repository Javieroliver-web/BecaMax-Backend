// Mitigación CSRF residual: las cookies de sesión usan SameSite=None (frontend
// y backend son orígenes distintos), y CORS solo impide que un atacante LEA
// la respuesta cross-site, no que un <form> cross-site ENVÍE la petición con
// la cookie de la víctima. Un <form> HTML no puede fijar cabeceras custom, así
// que exigir esta en toda escritura cierra ese vector sin necesidad de un
// token CSRF de doble envío (RLS con `WITH CHECK user_id = auth.uid()` ya
// impide que el atacante escriba datos de otra persona; esto evita que
// induzca escrituras "propias" no deseadas en la cuenta de la víctima).
function requireFetchHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.headers['x-becamax-client']) {
    return res.status(403).json({ status: 'error', message: 'Petición no permitida' });
  }
  next();
}

module.exports = { requireFetchHeader };
