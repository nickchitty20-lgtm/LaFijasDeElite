# Fijas de Élite v1.8 — PayPal Checkout

Incluye paneles oscuros premium, registro obligatorio, roles, pronósticos protegidos, pagos manuales (Yape, Plin, transferencia) y PayPal REST Checkout.

## Instalación
Sube los archivos a GitHub y despliega en Railway. Conserva las variables MySQL/JWT y añade en Railway: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE=sandbox`, `PAYPAL_ENABLE=false`, `PAYPAL_PEN_PER_USD` y `PUBLIC_BASE_URL`.

**Importante:** PayPal no admite PEN como moneda de captura en esta integración. Los planes se convierten a USD usando `PAYPAL_PEN_PER_USD` configurado por el dueño. Revisa periódicamente la tasa y los precios. Se muestra en la interfaz que el cobro será en USD.

Habilita `PAYPAL_ENABLE=true` **solo tras** verificar en Sandbox la cuenta comercial, permisos, moneda, precio final, aprobación/captura, reintentos y cancelaciones. Las cuentas y la actividad de pronósticos deportivos están sujetas a aprobación y políticas de PayPal.

El checkout crea la orden desde el servidor, guarda su identificador en MySQL, redirige a PayPal y captura mediante el backend cuando el cliente vuelve. El servidor consulta a PayPal el estado COMPLETED antes de activar VIP, bloqueando la fila MySQL para evitar activaciones duplicadas. El botón «Verificar pago» solo concilia capturas ya confirmadas. El retorno de navegador por sí solo nunca activa membresías.

Yape, Plin y transferencias conservan aprobación manual. No incluyas credenciales en GitHub ni en mensajes. Las variables `MP_*` de la versión anterior pueden eliminarse después de verificar el despliegue.

### Pendientes antes de producción
- Verificar la elegibilidad de la actividad de pronósticos con PayPal y la posibilidad de recibir cobros en Perú.
- Pruebas end-to-end en Sandbox (sin acceso a tu cuenta desde este entorno).
- Añadir reconciliación de reembolsos/contracargos y un webhook PayPal firmado para procesar capturas aunque el cliente no regrese al sitio.
- Definir política de precios USD y tratamiento tributario.

La sintaxis JavaScript se valida localmente, no se han ejecutado pagos reales.
