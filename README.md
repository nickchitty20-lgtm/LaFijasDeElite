# Fijas de Élite v1.1 — Pronósticos protegidos

Actualización completa de v1.0. Sustituye los archivos del repositorio en GitHub. Railway debe desplegar automáticamente.

- La landing muestra tarjetas de pronósticos con candado, sin revelar análisis, cuotas ni selecciones.
- Los pronósticos gratuitos completos requieren iniciar sesión.
- Los VIP solo se entregan a clientes con membresía activa y no vencida, verificada en MySQL por el servidor.
- La API pública anterior `/api/predictions/free` ahora devuelve 401 para impedir fugas.
- El portal de clientes muestra pronósticos después del login.
- No modifica tablas ni elimina cuentas.

Prueba con visitante anónimo, cliente gratuito y cliente VIP. La versión aún requiere auditoría de seguridad antes de ventas reales.


## v1.2 — Panel VIP Premium
- Dashboard de cliente con membresía vigente y días restantes (servidor).
- Estadísticas de resultados publicados y estados por pronóstico, sin inventar aciertos.
- Notificaciones calculadas de membresía, solicitudes de pago y publicaciones (no push).
- Pronósticos VIP totalmente ocultos en API y frontend para usuarios sin membresía activa.
- No se agregó pasarela automática ni notificaciones push.
- Despliega el contenido completo en el repositorio y prueba con cuentas de prueba.


## v1.3 — Permisos por cargo
- Dueño: todos los módulos, personal e historial.
- Admin general: pronósticos, pagos, planes, clientes e historial.
- Admin pagos: pagos, planes y clientes.
- Analista: pronósticos y resultados.
- Moderador: consulta de clientes, sin capacidad de suspender.
- Solo el dueño asigna cargos a usuarios previamente registrados.
- El backend verifica los permisos por petición y registra cambios.
- Historial en `/api/admin/audit` para dueño y admin general.
- Los administradores ascendidos usan la contraseña actual de su cuenta cliente.

Pendiente: suspensiones, edición/eliminación de pronósticos, MFA y pruebas reales de Railway.


## v1.4 — Dashboard organizado
Panel de administración con navegación lateral por secciones (Resumen, Pronósticos, Pagos, Planes, Clientes, Personal, Actividad), menú horizontal en móviles y tarjetas de estadísticas. No se modifican endpoints ni tablas. Los accesos visibles respetan el rol actual; los permisos reales siguen verificados por el servidor.
