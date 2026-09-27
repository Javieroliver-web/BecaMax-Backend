# Difusión automática de becas

Cada día, las becas nuevas de la BDNS que sincroniza el cron de las 06:00 se publican solas en redes para llevar visitas a BecaMax. Los mensajes se montan con una **plantilla** a partir de datos reales de `public.becas`, sin IA: si un dato falta, no aparece.

## Cómo funciona

- **Cron propio:** `/api/difusion/process_cron`, todos los días a las **08:00 UTC** (`vercel.json`). Va separado del cron de la BDNS, así que un fallo de la difusión nunca tumba la sincronización. En el plan Hobby, Vercel puede lanzarlo en cualquier momento entre las 08:00 y las 08:59.
- **Qué se publica:** becas con `codigo_bdns`, con plazo de al menos 3 días más, con enlace oficial válido y sin publicar aún en ese canal. Las 20 becas de ejemplo no tienen `codigo_bdns`, así que nunca se publican.
- **Sin spam:** como mucho `DIFUSION_MAX_POR_EJECUCION` (5 por defecto) por canal y ejecución. El resto sale al día siguiente.
- **Una beca, un canal, una vez:** la tabla `public.difusion_publicaciones` lo controla. Antes de publicar se reserva la fila; si el post sale pero no se puede apuntar, no se repite nunca.
- **Si falla:**
  - Si falla **el canal** (token, red, límites, caída), se para ese canal y la beca se reintenta al día siguiente sin gastar intento.
  - Si el canal rechaza **ese mensaje**, gasta un intento. Con 3 intentos fallidos se abandona.
  - Todo fallo se avisa a Discord de forma resumida: canal, número de fallos y primer error.

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Ejemplo | Para qué |
|---|---|---|
| `DIFUSION_TELEGRAM` | `on` | Activa Telegram. Cualquier otro valor lo apaga. |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC…` | Token que da @BotFather. **Secreto.** |
| `TELEGRAM_CHANNEL_ID` | `@becamax_becas` | Canal público (o su id `-100…`). |
| `DIFUSION_BLUESKY` | `on` | Activa Bluesky. |
| `BLUESKY_HANDLE` | `becamax.bsky.social` | Usuario de la cuenta. |
| `BLUESKY_APP_PASSWORD` | `xxxx-xxxx-xxxx-xxxx` | **Contraseña de aplicación**, nunca la de la cuenta. **Secreto.** |
| `BLUESKY_SERVICE` | `https://bsky.social` | Opcional. Solo si la cuenta está en otro servidor. |
| `DIFUSION_MAX_POR_EJECUCION` | `5` | Opcional. Máximo por canal y día (1–20). |
| `DIFUSION_DESDE` | `2026-10-01` | Opcional. Solo becas añadidas a BecaMax desde esa fecha. Evita anunciar en bloque las que ya estaban. |

Ya existentes que también usa: `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `FRONTEND_URL`, `DISCORD_WEBHOOK_URL`.

Si un canal está en `on` pero faltan sus credenciales, se omite con un único aviso en el log.

## Probar en local

```bash
npm run difusion -- --dry-run   # enseña los mensajes; no publica ni escribe nada
npm run difusion                # publica de verdad en los canales con DIFUSION_<CANAL>=on
npm test
```

## Pasos manuales (una sola vez)

1. **Telegram:**
   - Habla con [@BotFather](https://t.me/BotFather), escribe `/newbot` y guarda el token.
   - Crea un canal público, por ejemplo «BecaMax · Becas nuevas», con un alias como `@becamax_becas`.
   - Añade el bot al canal como **administrador** con permiso para publicar.
2. **Bluesky:**
   - Crea la cuenta, por ejemplo `becamax.bsky.social`.
   - Ve a Ajustes → Privacidad y seguridad → Contraseñas de aplicación, crea una llamada «BecaMax difusión» y guárdala.
   - En Bluesky el enlace va en una **tarjeta** bajo el post, sin imagen de miniatura, y el texto se ajusta a 300 caracteres.
3. **Supabase:** ejecuta `supabase/difusion_setup.sql` en el SQL Editor. La última consulta debe devolver `true` en las dos columnas.
4. **Vercel:** añade las variables de la tabla. Pon `DIFUSION_DESDE` con la fecha del día que lo actives.
5. **Prueba:** ejecuta `npm run difusion -- --dry-run` en local con el `.env`. Después, fusiona el PR. El primer envío real será al día siguiente a las 08:00 UTC, o antes si lanzas el cron a mano:

   ```bash
   curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://beca-max-backend.vercel.app/api/difusion/process_cron
   ```

---

# Boletín semanal por correo

Todos los **lunes a las 09:00 UTC** (`/api/boletin/process_cron`) se manda a los suscriptores **confirmados** un correo con las becas nuevas de la semana y las que cierran en los próximos 14 días. Si no hay ninguna, no se manda nada.

## Cómo cumple el RGPD

- **Doble confirmación:** el alta (`POST /api/boletin/alta`) solo guarda la dirección y manda un correo con un enlace. No se envía ningún boletín hasta que la persona lo pulsa. El enlace caduca en 48 horas.
- **Prueba del consentimiento:** se guardan el texto exacto aceptado, su versión y la fecha. El texto lo fija el backend en `CONSENTIMIENTOS` (`src/services/boletin/index.js`); si cambia, se crea una versión nueva.
- **Baja con un clic:** cada correo trae un enlace de baja y las cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post` (RFC 8058), para que Gmail y otros clientes muestren su botón «Cancelar suscripción». La baja **borra la fila**.
- **Minimización:** las altas sin confirmar se borran a los 7 días. En la base de datos solo se guarda el hash del token de confirmación.
- **Sin enumerar suscriptores:** el alta responde lo mismo tanto si la dirección ya estaba como si no.
- **Contra el abuso:** 5 altas cada 15 minutos por IP, 10 minutos entre correos de confirmación a la misma dirección y hCaptcha si hay `HCAPTCHA_SECRET`.

## Variables de entorno

| Variable | Ejemplo | Para qué |
|---|---|---|
| `BOLETIN_FROM` | `BecaMax <boletin@becamax.es>` | Remitente. **Debe ser de un dominio verificado en Resend.** Sin esta variable, el boletín queda apagado. |
| `RESEND_API_KEY` | (ya existe) | La misma que usan las alertas. |
| `BACKEND_URL` | `https://beca-max-backend.vercel.app` | Opcional. Base de los enlaces de confirmación y baja. |
| `HCAPTCHA_SECRET` | `0x…` | Opcional pero recomendado. La clave secreta de hCaptcha, la misma del panel de hCaptcha que usa Supabase. |

## Pasos manuales

1. **Dominio propio verificado en Resend.** Sin él, Resend solo deja enviar a la dirección de tu propia cuenta. Añade los registros DNS que pide Resend y pon `BOLETIN_FROM` con una dirección de ese dominio.
   - ⚠ Las alertas usan `alertas@becamax.es`, que tampoco está verificado: con el dominio se arreglan las dos cosas.
2. **Supabase:** ejecuta `supabase/boletin_setup.sql`. La última consulta debe devolver `true` en las tres columnas.
3. **Vercel:** añade `BOLETIN_FROM` y, si quieres, `HCAPTCHA_SECRET`.
4. **Frontend** (repositorio `BecaMax-Frontend`, rama `feat/boletin-alta`):
   - el formulario de alta en la portada;
   - la página `pages/boletin.html`, con el resultado de confirmar o darse de baja;
   - la sección del boletín en la política de privacidad.

   Revísalo y publícalo **después** del backend.
