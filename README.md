# Fijas de Élite — Panel administrativo inicial

## Qué incluye
- Node.js/Express + MySQL en Railway
- Creación de las 7 tablas al iniciar (se conserva `src/init-db.js`)
- Página principal `/` con panel negro y dorado
- Instalación de **un único dueño** con token secreto y bloqueo transaccional MySQL
- Login con contraseña bcrypt y JWT temporal (20 minutos, solo en memoria del navegador)
- Resumen de usuarios, membresías, pagos pendientes y pronósticos (consultas reales)
- Ruta `/health` conservada

## Despliegue en Railway
1. **Sube TODOS los archivos y carpetas** de este ZIP a la raíz del repositorio GitHub (reemplaza los existentes). **No subas el ZIP como un único archivo.**
2. Conserva las variables `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `NODE_ENV`, `JWT_SECRET` (mínimo 32 caracteres).
3. En el servicio de backend de Railway, agrega `OWNER_SETUP_TOKEN` con una cadena aleatoria **de al menos 32 caracteres**. Puedes generarla localmente con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y pegar el resultado en Railway. **No la subas a GitHub ni la compartas.**
4. Espera el despliegue `Success` y abre `https://TU-DOMINIO.up.railway.app/`.
5. Pulsa **Crear primera cuenta de dueño**. Introduce tu correo, contraseña robusta (mínimo 12 caracteres) y el token de instalación.
6. Tras el mensaje de éxito, **elimina `OWNER_SETUP_TOKEN` de las variables de Railway** y vuelve a desplegar. La ruta de instalación también se niega si ya existe un dueño.
7. Inicia sesión y comprueba el dashboard.

## Seguridad y límites
- El token inicial se compara con tiempo constante y la creación usa un bloqueo MySQL + transacción; no se puede crear un segundo dueño mediante el instalador.
- No se guardan contraseñas en texto plano; el JWT solo se mantiene en memoria de la pestaña.
- **Versión inicial, NO lista para operar pagos reales:** falta 2FA, protección avanzada de sesión, gestión completa de permisos, recuperación segura de cuenta, CSRF/cookies si se migra a sesiones, pruebas y auditoría de producción.
- No hay creación pública de admins adicionales. No hay cobro automático ni conexión con Telegram todavía.
- Cambia cualquier contraseña MySQL expuesta en capturas previas y evita mostrar valores secretos.
