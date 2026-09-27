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
2. **Supabase:** ejecuta `supabase/difusion_setup.sql` en el SQL Editor. La última consulta debe devolver `true` en las dos columnas.
3. **Vercel:** añade las variables de la tabla. Pon `DIFUSION_DESDE` con la fecha del día que lo actives.
4. **Prueba:** ejecuta `npm run difusion -- --dry-run` en local con el `.env`. Después, fusiona el PR. El primer envío real será al día siguiente a las 08:00 UTC, o antes si lanzas el cron a mano:

   ```bash
   curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://beca-max-backend.vercel.app/api/difusion/process_cron
   ```
