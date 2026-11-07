# Seguridad de Fijas de Élite v3.2.9

## Controles activos

- Las cookies de autenticación son `HttpOnly`, `SameSite=Lax`, con `Secure` bajo HTTPS, y cada endpoint valida roles contra la base de datos.
- Las acciones de escritura desde las páginas de cliente, administración y portada envían `X-CSRF-Token`, calculado por el servidor sobre la cookie de sesión y protegido con HMAC. El token nunca se almacena en localStorage.
- Las solicitudes API de escritura solo admiten JSON, desde el mismo origen web. El servidor comprueba `Origin`, `Referer` / `Sec-Fetch-Site` y el token para sesiones con cookie.
- Los webhooks de PayPal y Telegram son excepciones al token CSRF porque utilizan verificaciones de firma o secreto independientes. Se conservan esas verificaciones.
- Helmet mantiene CSP, protección anti-frame, `X-Content-Type-Options`, entre otras cabeceras. Se bloquean permisos de cámara, micrófono y geolocalización del navegador.
- El frontend solo llama a rutas `/api/` del mismo origen. Esta restricción en JS es complementaria: ningún permiso se concede desde el navegador.
- Límite por IP en rutas privadas (240 solicitudes / 5 min; 75 mutaciones / 5 min, además de límites más estrictos en login/pagos), y cuerpos JSON de hasta 16 KiB.

## Despliegue seguro en Railway

1. Usa HTTPS, verifica `PUBLIC_BASE_URL` (dominio real sin ruta ni barra final) y mantén frontend y backend en el mismo origen.
2. Configura `NODE_ENV=production` y conserva un `JWT_SECRET` aleatorio de al menos 32 caracteres; NO subas tokens ni `.env` a GitHub.
3. El servidor confía en un salto de proxy (`trust proxy = 1`); verifica que Railway sea el único proxy de ingreso. Si cambias la topología, revisa las cabeceras `X-Forwarded-*` y los límites de IP.
4. Recarga todas las pestañas abiertas tras desplegar: las versiones antiguas del JS no tienen el nuevo token CSRF.
5. Prueba con cuentas no productivas: login, registro, recuperación, aprobación, Telegram y pago PayPal Sandbox antes de activar Live.
6. Los límites en memoria no se comparten entre réplicas de Railway. En horizontal, usa Redis o un almacén central de límites.
7. Rota inmediatamente cualquier token de bot, clave de pasarela, secreto JWT o contraseña que se haya expuesto públicamente.

## Pendiente antes de operaciones financieras reales

- MFA / segundo factor para administradores, especialmente para finanzas y gestión de roles.
- Auditoría independiente de autorización por objeto (IDOR), sesiones, pagos y webhooks.
- Monitoreo y alertas, copias de seguridad y revisión de dependencias (`npm audit`) cuando se disponga de conexión confiable.
- Protección perimetral WAF / DDoS y control de registros de acceso.

Ningún frontend ni middleware garantiza que todos los ataques estén bloqueados. Este endurecimiento reduce riesgos comunes pero no certifica ausencia de vulnerabilidades.
