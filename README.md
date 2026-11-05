# Fijas de Élite v1.1 — Pronósticos protegidos

Actualización completa de v1.0. Sustituye los archivos del repositorio en GitHub. Railway debe desplegar automáticamente.

- La landing muestra tarjetas de pronósticos con candado, sin revelar análisis, cuotas ni selecciones.
- Los pronósticos gratuitos completos requieren iniciar sesión.
- Los VIP solo se entregan a clientes con membresía activa y no vencida, verificada en MySQL por el servidor.
- La API pública anterior `/api/predictions/free` ahora devuelve 401 para impedir fugas.
- El portal de clientes muestra pronósticos después del login.
- No modifica tablas ni elimina cuentas.

Prueba con visitante anónimo, cliente gratuito y cliente VIP. La versión aún requiere auditoría de seguridad antes de ventas reales.
