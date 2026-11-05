# Fijas de Élite v1.8.5 — Sesiones persistentes con cookies seguras

Actualización de v1.8.4. Se mantiene toda la lógica de PayPal Sandbox, Yape, Plin, transferencias, permisos por cargo y pronósticos protegidos.

## Qué cambia

- **Sesión persistente**: clientes gratuitos y VIP permanecen conectados **14 días** (desde el inicio de sesión), aun cuando cierren el navegador o regresen del checkout PayPal.
- **Administradores**: permanecen conectados hasta **12 horas**; para mayor seguridad deben volver a autenticarse después de ese plazo.
- La sesión se almacena en una cookie `fijas_session` con `HttpOnly`, `SameSite=Lax` y `Secure` en HTTPS (o NODE_ENV=production); no se guarda el JWT en `localStorage` ni `sessionStorage`.
- El servidor valida la cuenta y los permisos en cada solicitud, no desde datos guardados por el navegador.
- Si cambia la contraseña de una cuenta, las sesiones emitidas con la contraseña anterior dejan de funcionar.
- **Cerrar sesión** limpia la cookie. En dispositivos compartidos, usa siempre este botón.
- Protección de origen para peticiones que modifican información, para mitigar ataques CSRF con autenticación basada en cookies.
- Un usuario VIP **no pierde su membresía ni sus pagos por cerrar la web**: todo se consulta en MySQL.
- El regreso desde PayPal mantiene la sesión y vuelve a comprobar la orden en el servidor sin pedir un segundo pago.

## Publicación

1. Descomprime este ZIP y sube **el contenido** a la raíz del repositorio de GitHub, sin borrar tu base de datos.
2. Espera a que Railway indique `Success` y comprueba `https://lafijasdeelite-production.up.railway.app/health`: `version` debe ser `1.8.5`.
3. Mantén `JWT_SECRET` sin cambios y con al menos 32 caracteres; **no lo cambies** porque invalidaría todas las sesiones.
4. Mantén `PUBLIC_BASE_URL=https://lafijasdeelite-production.up.railway.app` (sin barra final) y verifica que el checkout use este dominio.
5. Mantén `PAYPAL_MODE=sandbox` durante las pruebas, con credenciales Sandbox. No pases a Live hasta terminar la verificación comercial y pruebas de pagos.
6. Inicia sesión una vez, cierra la pestaña, regresa a `/clientes.html` y verifica que entres sin contraseña.
7. Inicia una compra ficticia PayPal y regresa: la misma sesión permite verificar el pago.
8. Pulsa **Cerrar sesión**: al volver, debe solicitar contraseña.

## Seguridad y límites

- Los navegadores con cookies bloqueadas no conservan la sesión; las ventanas privadas la eliminan al cerrarlas.
- La duración de cliente es fija (14 días) y no se renueva automáticamente con actividad.
- Las sesiones antiguas de versiones previas (que solo vivían en memoria) requieren **un nuevo inicio de sesión** una sola vez.
- No usar `app.set('trust proxy', true)` indiscriminadamente: la app mantiene `trust proxy=1` detrás de Railway.
- En producción usa HTTPS y no compartas `PAYPAL_CLIENT_SECRET`, `JWT_SECRET` ni la clave de MySQL.
- `POST /api/logout` borra la cookie. `GET /api/session` informa únicamente el tipo de cuenta de la sesión actual.
- No se añaden tablas ni se altera el esquema MySQL para esta actualización.

**Validación local:** comprobación de sintaxis de los archivos JS y del ZIP; las pruebas con Railway, MySQL y PayPal Sandbox deben hacerse tras desplegar.
