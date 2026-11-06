# FIJAS DE ÉLITE v1.9.0 — PAYPAL PRODUCCIÓN (DESACTIVADO POR DEFECTO)

Este proyecto completo se basa en v1.8.9. **Se entrega con Live BLOQUEADO por defecto.**
No se ha validado con la cuenta de Railway ni PayPal del propietario. No publiques un checkout
Live antes de realizar las comprobaciones y obtener aprobación expresa del proveedor
para vender pronósticos o asesoramiento relacionado con apuestas.

## Novedades

- **Separación irrevocable de entornos:** cada nueva orden PayPal se guarda como `sandbox` o `live`.
  Las órdenes de versiones anteriores se migran como `legacy` y **no** figuran en ventas Live.
  No se borran cuentas, pronósticos, membresías ni pagos anteriores.
- **Captura comprobada:** la orden, su ID local, el importe exacto en USD y el ID de captura
  se cotejan contra PayPal en el backend; nunca se confía en un retorno del navegador.
  Las renovaciones son transaccionales e idempotentes.
- **Webhook seguro:** `/api/payments/paypal/webhook` valida la firma de cada evento mediante
  PayPal, guarda su identificador para evitar duplicados y concilia capturas de órdenes aprobadas
  incluso si el cliente no vuelve a la web.
- **Reembolsos y disputas:** los reembolsos totales confirmados revocan el período correspondiente
  y conservan el historial de cobro; los parciales y disputas quedan destacados para revisión
  humana. **No se inicia ningún reembolso desde nuestra API.**
- **Notificaciones dentro del portal:** avisos de compra confirmada, reembolso, rechazo de captura
  y disputa; el panel Admin > Finanzas lista importes Live en USD, Sandbox en USD, solicitudes
  manuales verificadas en PEN, incidencias y eventos no conciliados. Los totales son **brutos**:
  no descuentan comisiones, impuestos, tasas bancarias ni disputas sin resolver.
- Registro de auditoría y protecciones de lista negra, rangos, membresías manuales,
  paneles oscuros y pronósticos anteriores preservados.

## Despliegue seguro — orden obligatorio

1. **Haz un backup de MySQL.** Sube todos los archivos a GitHub y espera Railway `Success`.
   Verifica `GET /health` ⇒ `"version":"1.9.0"`.
2. Conserva `PAYPAL_MODE=sandbox`, configura Client ID y Secret Sandbox en Railway.
   Usa `PAYPAL_ENABLE=true` únicamente si deseas que funcione Sandbox.
3. En **PayPal Developer → aplicación Sandbox → Webhooks**, registra:
   `https://lafijasdeelite-production.up.railway.app/api/payments/paypal/webhook`
   (ajusta el dominio si cambiaste la web).
   Elige eventos `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`,
   `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`,
   `PAYMENT.CAPTURE.REVERSED`, `CUSTOMER.DISPUTE.CREATED`,
   `CUSTOMER.DISPUTE.UPDATED` y `CUSTOMER.DISPUTE.RESOLVED` (según disponibilidad).
   Copia el **Webhook ID** de esa app a `PAYPAL_WEBHOOK_ID`. No es el Client ID.
4. Prueba con dos cuentas ficticias Sandbox distintas (vendedor y comprador):
   compra, renovación, cerrar navegador antes del retorno, captura duplicada,
   reembolso total, reembolso parcial y consulta de auditoría. En `Admin → Finanzas`,
   confirma que todas figuren como **Sandbox**, nunca Live.
   **Ojo:** el simulador de webhooks puede no superar la verificación remota de firmas;
   para probar el flujo completo usa eventos de transacciones reales en Sandbox.
5. Completa la verificación de cuenta empresarial real y comprueba por escrito con PayPal
   que la actividad de análisis/pronósticos deportivos es admisible.
   Revisa el reembolso/contracargo y la política comercial; estas operaciones pueden requerir
   atención del equipo de soporte.
6. Antes de Live, configura en PayPal Developer **la aplicación Live**, con Client ID, Secret
   y **Webhook ID Live diferente**. Registra la MISMA URL en la app Live con los eventos indicados.
   **Nunca mezcles claves de Sandbox y Live.** Configura `PUBLIC_BASE_URL` por HTTPS y una
   tasa de cambio `PAYPAL_PEN_PER_USD` validada para presentar precios correctos en USD.
7. **Último paso, solo tras todos los controles anteriores**: establece `PAYPAL_MODE=live`,
   `PAYPAL_ENABLE=true`, `PAYPAL_WEBHOOK_ID=ID_DE_WEBHOOK_LIVE` y
   `PAYPAL_LIVE_RELEASE_ACK=true` junto con las credenciales Live en Railway.
   Esta última variable es una confirmación explícita: de lo contrario, el checkout Live
   permanecerá deshabilitado incluso si la autenticación funciona.
8. Haz una compra Live pequeña con una cuenta compradora distinta de la vendedora.
   Verifica el pago en PayPal Business, el ID de captura en MySQL, la membresía y la
   sección financiera. **Nunca repitas el cobro si la confirmación se retrasa.**

### Variables en Railway (ejemplo sin secretos)

```env
NODE_ENV=production
PUBLIC_BASE_URL=https://lafijasdeelite-production.up.railway.app
PAYPAL_MODE=sandbox
PAYPAL_ENABLE=false
PAYPAL_CLIENT_ID=TU_CLIENT_ID_DEL_ENTORNO
PAYPAL_CLIENT_SECRET=TU_SECRET_DEL_ENTORNO
PAYPAL_WEBHOOK_ID=ID_DEL_WEBHOOK_DEL_ENTORNO
PAYPAL_PEN_PER_USD=3.50
PAYPAL_LIVE_RELEASE_ACK=false
```

**Nota:** el valor `3.50` es solo un ejemplo, no una cotización vigente.
Una tasa mal elegida puede cobrar más o menos de lo anunciado. Las claves de Live,
JWT_SECRET y MySQL deben permanecer en variables privadas; no se suben a GitHub.

## Limitaciones y seguridad pendiente

- Los reembolsos parciales y las disputas se marcan para revisión; **no** se resuelven ni
  reembolsan automáticamente, ni representan devolución inmediata de dinero.
- Un reembolso total o reversión de un pago nuevo elimina el acceso de **ese** período,
  pero no reestructura automáticamente la duración de otros períodos ya adquiridos.
- Las membresías VIP de prueba que ya fueron activadas en versiones anteriores pueden
  continuar activas en Live. Revisa esas cuentas y utiliza «Gestionar VIP» para retirar
  períodos de prueba si corresponde, **sin borrar su registro de pago**.
- Los pagos PayPal antiguos quedan como `legacy` (origen no comprobado), no se clasifican
  retrospectivamente como Live. El administrador debe revisarlos si hubo cobros históricos.
- Los registros de pagos manuales incluyen solicitudes históricas; no deben asumirse
  como ingresos reales sin revisar depósitos en Yape/Plin/banco.
- El **2FA, revisión de seguridad independiente, seguimiento de eventos no conciliados,
  copias de seguridad, política de reembolsos y conciliación con los extractos oficiales**
  siguen siendo tareas operativas antes de una apertura pública masiva.
- Para evitar dobles reembolsos, ejecuta devoluciones desde el sistema oficial PayPal,
  no desde este backend; sus webhooks actualizarán la contabilidad.

## Pruebas automáticas

`npm test` — pruebas de renovación, permisos, archivado, validación monetaria, separación
Live/Sandbox y escenarios de captura y reembolso. También ejecutar `node --check src/server.js`.
**No equivale a una prueba real de PayPal Live ni de Railway/MySQL.**

---

# Fijas de Élite v1.8.9 — Eliminar una membresía individual

Esta versión conserva todo lo incluido hasta la v1.8.8 y agrega la acción **Eliminar esta membresía**, dentro de **Admin → Gestionar VIP → Buscar cliente → Últimas membresías**.

## Funcionalidad

- Solo el **dueño** puede eliminar una membresía individual; analistas, moderadores y admins de pagos no pueden hacerlo.
- Solicita motivo y una segunda confirmación.
- Elimina **del panel** la membresía indicada mediante archivado lógico; la fila queda guardada para auditoría.
- Corta el acceso de ese período (sin borrar otras renovaciones); si existen renovaciones futuras estas conservan sus fechas originales.
- Si la solicitud Yape/Plin/transferencia aún está pendiente, pasa su pago a `rejected` para impedir una aprobación posterior.
- Si hay una orden PayPal **pendiente de confirmar**, no deja eliminar hasta resolverla en PayPal.
- Los pagos ya `verified` permanecen inalterados, y la eliminación **no reembolsa** automáticamente. El historial financiero y los registros de auditoría se mantienen.
- Los períodos archivados ya no se contabilizan para VIP ni aparecen en la lista de membresías del cliente. El cliente puede seguir viendo su historial de pagos.
- Agrega a MySQL de modo automático `archived_at`, `archived_by`, `archive_reason`, sin borrar tablas ni datos.

## Instalación

1. Subir todos los archivos del ZIP al repositorio GitHub reemplazando la versión previa.
2. Railway despliega con las mismas variables y MySQL.
3. Comprobar `/health` con `version: 1.8.9`.
4. Entrar como dueño al panel y usar **Gestionar VIP**. Probar primero con una cuenta de prueba.

No cambies PayPal de Sandbox a Live sin verificar requisitos comerciales, conciliación, reembolsos y manejo de disputas.

## Alcance de las pruebas

Se ejecutaron pruebas de helpers y sintaxis JavaScript. No se dispone de tu MySQL ni de tu Railway para probar la migración en producción. Se recomienda respaldo previo de MySQL.

---

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
