# Fijas de Élite — Backend inicial

Este repositorio contiene el **backend de desarrollo**, no la web ni el bot terminados. No está listo para operar con clientes reales.

## Subir a GitHub (sin terminal)
1. Abre tu repositorio `LaFijasDeElite` en GitHub.
2. Selecciona **Add file → Upload files**.
3. **Descomprime el ZIP** y sube los archivos y la carpeta `src` y `sql` (no subas el ZIP como único archivo).
4. Comprueba que `package.json` aparece en la raíz del repositorio, junto a `README.md`.
5. Pulsa **Commit changes**. Railway debería detectar el cambio y desplegar con `npm start`.

## Variables en el servicio Railway LaFijasDeElite
Usa **referencias de Railway** a MySQL, no contraseñas pegadas en GitHub:

- `DB_HOST` → `${{MySQL.MYSQLHOST}}`
- `DB_PORT` → `${{MySQL.MYSQLPORT}}`
- `DB_USER` → `${{MySQL.MYSQLUSER}}`
- `DB_PASSWORD` → `${{MySQL.MYSQLPASSWORD}}`
- `DB_NAME` → `${{MySQL.MYSQLDATABASE}}`
- `NODE_ENV` → `production`
- `JWT_SECRET` → cadena aleatoria privada de **al menos 32 caracteres** (generada y guardada solo en Railway)

Opcional: `CORS_ORIGIN` → dominio HTTPS de la web cuando exista. `PORT` lo establece Railway.

## Verificar
En Railway → LaFijasDeElite → Deployments, espera el estado `Active`. Crea un dominio público en Settings → Networking si deseas probar `/health` desde el navegador. Respuesta esperada: `{"status":"ok","database":"connected"}`.

## Base de datos
El esquema está en `sql/schema.sql` y **todavía debe ejecutarse** en MySQL antes de usar rutas de usuarios y administradores. No se ejecuta automáticamente. `src/create-owner.js` es un script de preparación que requiere `OWNER_EMAIL` y `OWNER_PASSWORD`; no ejecutes ese paso hasta configurar seguridad y comprobar el esquema.

## Seguridad
La autenticación actual es solo de arranque; falta 2FA, permisos finos, auditoría operativa y validación de pagos. No publiques cuentas reales ni vendas suscripciones con esta versión. Si una contraseña de MySQL apareció en una captura, rótala en Railway. Nunca subas `.env`, contraseñas ni tokens a GitHub.
