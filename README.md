# Fijas de Élite v0.3 — Pronósticos web + Telegram

Reemplaza el contenido del repositorio con este proyecto (conserva tus variables Railway). Railway desplegará automáticamente.

## Variables nuevas en servicio LaFijasDeElite de Railway
- `TELEGRAM_BOT_TOKEN`: token del bot creado con @BotFather (secreto).
- `TELEGRAM_FREE_CHAT_ID`: identificador del canal gratuito (ej. `@nombrecanalpublico`).
- `TELEGRAM_VIP_CHAT_ID`: ID numérico del canal **privado** VIP (ej. `-100...`). **No uses un canal público para VIP**.

Agrega el bot como administrador con permiso de publicar en cada canal. Si omites las variables, los pronósticos se publican en web y Telegram queda `not_configured`.

## Funcionamiento
- Admin dueño, general y analista pueden publicar y actualizar resultados.
- El backend guarda el pronóstico primero en MySQL, luego intenta enviarlo por Telegram. Si Telegram falla, se registra `failed`, sin reintento automático. Evita duplicados por reenvío manual.
- API pública `GET /api/predictions/free` expone únicamente pronósticos gratuitos.
- Los VIP **no tienen aún portal de clientes ni control de suscripciones**; se publican en el panel admin y, si se configura, en un canal privado. La gestión de acceso y expulsión al vencer membresías sigue pendiente.
- La hora ingresada es UTC, no hora de Lima. Los resultados se editan desde el panel, pero no se envían como actualización a Telegram.

## Seguridad
No publiques tokens ni contraseñas en GitHub. Quita `OWNER_SETUP_TOKEN` tras crear dueño. Mantén la rotación de contraseña MySQL expuesta previamente. El panel aún requiere 2FA y auditoría de seguridad antes de pagos reales.
