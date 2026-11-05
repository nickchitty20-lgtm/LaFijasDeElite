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
