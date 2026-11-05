# Fijas de Élite v0.4 — usuarios y membresías (pruebas)

Proyecto completo basado en v0.3. Subir todos los archivos a GitHub conservando carpetas. Railway reinicia y `src/init-db.js` agrega la columna `users.password_hash` sin borrar tablas. Se conservan las variables DB_*, JWT_SECRET y Telegram.

## Funciones
- `/clientes.html`: registro con contraseña bcrypt, login, catálogo y solicitud de pago manual.
- Panel: crear planes, ver clientes, revisar solicitudes y aprobar/rechazar manualmente.
- Aprobar crea una membresía activa y calcula su vencimiento. Las decisiones quedan en `audit_logs`.
- API `/api/payments/automatic/status` informa que la pasarela **no está implementada**. No existe cobro por tarjeta ni activación automática por Yape/Plin.

## Seguridad y límites
- **Entorno de pruebas**. Antes de recibir dinero real: 2FA de admins, CSRF/cookies seguras o BFF, control de sesiones, auditoría de concurrencia, controles antifraude, política de privacidad, comprobantes y conciliación.
- No aprobar pagos solo por código de operación: verificar el abono real en la cuenta.
- No subir contraseñas, tokens ni capturas de credenciales a GitHub.
- La suscripción web aún no controla automáticamente el acceso a Telegram VIP.
- La pasarela automática necesita elegir proveedor autorizado, credenciales de prueba y webhook firmado; no se simula como si fuera real.
