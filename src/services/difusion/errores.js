// Dos tipos de fallo al publicar, porque se tratan distinto:
// - ErrorCanal: el canal entero no funciona (credenciales, red, límites,
//   caída del servicio). Se para ese canal en esta ejecución y la beca NO
//   gasta intento: si no, una caída de 3 días tiraría becas buenas.
// - ErrorMensaje: el canal funciona pero rechaza ESTE mensaje. Cuenta como
//   intento de esa beca (máximo 3).

class ErrorCanal extends Error {}
class ErrorMensaje extends Error {}

module.exports = { ErrorCanal, ErrorMensaje };
