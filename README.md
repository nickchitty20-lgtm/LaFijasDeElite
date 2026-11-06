# Fijas de Élite v1.8.8 — Gestión VIP manual

**Nueva versión:** desde Administración → **Gestionar VIP**, los cargos **Dueño**, **Admin general** y **Admin de pagos** pueden buscar a un cliente registrado por nombre, correo o ID y seleccionar:

- **Asignar VIP manualmente:** elige un plan activo (7/30/90 días u otro plan creado), escribe un motivo y confirma. Se agregan los días al vencimiento confirmado existente (o desde ahora si no tiene VIP). **No se crea ninguna transacción de pago ficticia.**
- **Retirar acceso VIP:** cancela todos los períodos confirmados actualmente vigentes o programados para el futuro, incluyendo renovaciones pagadas, con motivo y confirmación adicional. Se revoca el acceso a pronósticos VIP desde el servidor al siguiente acceso. **No elimina los comprobantes ni efectúa un reembolso.**
- **Historial:** cada alta o retiro queda en `audit_logs` con el responsable, destinatario y motivo. Los registros de membresía también identifican los períodos manuales y las revocaciones.
- **Lista negra:** no se permite otorgar VIP a un usuario bloqueado (Rank 0). El dueño debe levantar primero la suspensión.
- **Solicitudes pendientes:** no se alteran durante la revocación. Un pago posterior legítimamente confirmado puede volver a conceder VIP; revisa las solicitudes pendientes antes de revocar si ese comportamiento no es deseado.

### Actualización

1. Descarga el ZIP completo y sube su contenido a tu repositorio GitHub, reemplazando la versión anterior.
2. Railway desplegará automáticamente: `/health` deberá devolver `version: 1.8.8`.
3. No borres la base MySQL: `initializeDatabase()` agrega 6 columnas de control a `memberships` de forma incremental, sin eliminar membresías ni pagos anteriores.
4. Entra como dueño a **Gestionar VIP**, busca una cuenta de prueba, otorga un plan, comprueba **Mi membresía** del cliente; luego revócalo y verifica que los pronósticos VIP se bloqueen.
5. Comprueba en **Actividad** quién realizó los cambios.

**Nota sobre pagos reales:** cancelar acceso no implica devolución de dinero ni resolución de disputas. Si el cliente había pagado, aplica tu política comercial y gestiona por separado cualquier reembolso. Mantén PayPal en Sandbox mientras validas el sistema.

### Pruebas

`node --check src/server.js`, `node --check public/app.js`, `npm test` y revisión de ZIP. No equivalen a una prueba en Railway/MySQL o PayPal reales.

---

# Fijas de Élite v1.8.6 — Corrección de renovaciones VIP

Actualiza v1.8.5 sin perder datos, cuentas, cookies ni pagos anteriores. Mantiene PayPal Sandbox, Yape, Plin, transferencias y paneles premium.

## Error corregido

Antes, el pago de una renovación se marcaba como `verified` y se registraba una membresía nueva con `starts_at` igual al vencimiento actual. Esa estrategia **acumulaba los días**, pero el endpoint `/api/customers/dashboard` ignoraba la renovación porque su comienzo era futuro. Por eso mostraba el vencimiento antiguo pese al pago confirmado.

Ahora, si el cliente tiene un plan VIP vigente, el panel muestra inmediatamente el **vencimiento máximo de todas las renovaciones confirmadas**, junto al número de renovaciones programadas. La sección «Mi membresía» distingue entre una membresía vigente y las siguientes renovaciones confirmadas.

También:

- Los pagos PayPal repetidamente verificados son idempotentes; no añaden días otra vez.
- La conciliación de órdenes PayPal y la aprobación manual bloquean la fila del cliente durante el cálculo de días para evitar pérdidas de renovaciones simultáneas.
- El botón «Verificar mi último pago PayPal» busca primero órdenes pendientes, no se limita a mostrar un pago anterior ya verificado.
- Las cuentas que no tienen un VIP **vigente ahora** continúan sin acceso VIP aunque exista una membresía futura. No se adelanta la fecha de acceso.
- El sistema sigue aceptando las renovaciones ya registradas en MySQL: el nuevo dashboard las refleja **sin cambios manuales de base de datos**.

## Instalación

1. Extrae el ZIP y reemplaza el contenido del repositorio GitHub; **no borres la base de datos Railway**.
2. Espera a que Railway indique `Success` y abre `/health`. Debe responder con `version: 1.8.6`.
3. Abre la cuenta VIP que renovó y visita `Resumen` y `Mi membresía`. La fecha total debe sumar los días confirmados.
4. Si la fecha sigue incorrecta, revisa en el panel admin el registro del último pago: `verified` vs `pending`. **No repitas el pago**. Una autorización de PayPal por sí sola no acredita el abono.
5. Mantén `PAYPAL_MODE=sandbox` y `JWT_SECRET` sin cambios.

## Verificación local

`npm test` ejecuta pruebas sin MySQL ni PayPal para el cálculo de acumulación de fechas. `node --check src/server.js` verifica la sintaxis. **No equivale a probar un cobro real**; las operaciones con PayPal Sandbox y la base de datos desplegada deben verificarse después de instalar.

Aviso: El registro de pagos verificables, el acceso VIP y el saldo del plan se mantienen en MySQL, nunca en cookies.


## v1.8.7 — Rank 0 (lista negra) y membresías ordenadas

- Desde **Administrador → Personal**, el dueño puede elegir **Rank 0 · Lista negra** y registrar un motivo obligatorio.
- La suspensión se guarda en `users.account_status`, `blacklist_reason`, `blacklisted_at` y `blacklisted_by` (migración automática al iniciar). **No borres ni recrees la base de datos.**
- La cuenta bloqueada no puede iniciar sesión, usar su sesión anterior ni acceder a pronósticos gratuitos/VIP o iniciar pagos. También se desactivan sus permisos administrativos. La comprobación se realiza en el backend y se registra una auditoría.
- El dueño puede quitar el bloqueo asignando nuevamente **Cliente** u otro cargo permitido desde la lista de personal. No es posible bloquear al dueño.
- Las membresías confirmadas y pagos históricos se preservan. El tiempo de VIP sigue transcurriendo durante el bloqueo; si hay pagos reales, revisar manualmente cualquier incidencia o eventual reembolso conforme a la política comercial.
- **Mi membresía** ahora separa VIP activo, renovaciones confirmadas, solicitudes pendientes (desplegable) e historial (desplegable). Los registros pendientes ya no ocupan toda la pantalla.
- Las consultas de membresías se limitan por categoría: 40 confirmadas, 20 pendientes y 20 históricas. No se modifica el cálculo de renovaciones ni la conciliación de PayPal.

### Prueba recomendada (Sandbox)
1. Instala el proyecto y comprueba `/health` versión 1.8.7. Confirma primero que puedes entrar como dueño.
2. Registra una cuenta de cliente de prueba; desde el panel de dueño asigna Rank 0 con motivo.
3. Comprueba que la sesión ya iniciada de ese cliente deja de acceder a pronósticos y pagos; el nuevo inicio de sesión recibe HTTP 403.
4. Como dueño, asigna **Cliente** a la misma cuenta y confirma que vuelve a poder entrar. No elimines cuentas ni borres MySQL.
5. Como VIP de prueba, verifica que «Solicitudes pendientes» esté cerrado inicialmente y que las renovaciones confirmadas se muestren arriba.

En producción, define y publica una política de sanciones, apelaciones, membresías y reembolsos. Mantén PayPal en Sandbox hasta completar las pruebas y aprobación comercial.
