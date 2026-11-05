# Fijas de Élite v1.0 — Dark Premium + Roles

Actualización sobre v0.9: **no borres la base de datos**. Copia los archivos en la raíz de tu repositorio GitHub y despliega en Railway.

## Incluye
- Landing y páginas de acceso con estilos oscuros y transiciones suaves.
- Login unificado: cliente o administrador según rol verificado en el servidor.
- Registro público solo como cliente; compra requiere JWT de cliente válido.
- Dueño puede promover o revocar roles en Gestión de personal; usuarios deben registrarse primero.
- Selección de plan conservada al abrir login desde la landing.
- Predicciones y Telegram conservados.

## Notas de seguridad
- La cuenta de dueño creada con el proceso inicial se conserva. No habilites de nuevo OWNER_SETUP_TOKEN.
- El dueño existente es la única excepción al registro público obligatorio.
- Los roles nuevos se guardan en `admins` asociados por email al usuario registrado en `users`. El inicio de sesión del personal ascendido comprueba la contraseña actual del usuario.
- La revocación se comprueba en cada solicitud autenticada.
- Los pagos manuales deben verificarse en la cuenta receptora; la pasarela automática está desactivada.
- **No está listo para cobrar en producción**: faltan 2FA, revisión de seguridad, control de sesiones y conciliación de pagos.
- La recuperación de contraseña por correo requiere configurar SMTP.

## Railway
Mantén DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET, NODE_ENV y variables de Telegram. No subas secretos a GitHub.
