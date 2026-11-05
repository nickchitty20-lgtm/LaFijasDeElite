# Fijas de Élite v1.8.4 — Renovación VIP y respuestas JSON seguras

Basado en v1.8.3. Mantiene PayPal Sandbox, Yape, Plin, transferencias, paneles premium y pronósticos protegidos.

## Cambios

- El menú **Comprar VIP** cambia a **Renovar VIP** cuando la API confirma que el cliente ya tiene una membresía activa. El estado VIP NO se inventa en el navegador.
- El checkout informa fecha de vencimiento y renovación sin desactivar el acceso existente.
- Todos los límites de `express-rate-limit` devuelven **JSON con HTTP 429**, evitando el error `Unexpected token 'T', "Too many requests..."` del navegador.
- El cliente muestra un mensaje claro cuando una solicitud recibe un 429 u otra respuesta inesperada del servidor.
- Se desactiva el botón de verificar PayPal cuando la configuración de PayPal no está habilitada.
- Se separó el límite de creación de checkout del límite de verificación de cobros para reducir bloqueos accidentales por intentos repetidos.
- `/health` identifica esta versión como `1.8.4`.

## Nota sobre PayPal

**La actualización no cambia ni crea credenciales.** El aviso "PayPal pendiente de habilitación" es independiente del tipo de usuario y solo desaparece al completar las variables de Railway. Entra como dueño en **Resumen → Diagnóstico de PayPal** para ver los nombres de las variables faltantes (nunca mostrará los secretos).

```env
PAYPAL_ENABLE=true
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=TU_ID_SANDBOX
PAYPAL_CLIENT_SECRET=TU_SECRETO_SANDBOX
PAYPAL_PEN_PER_USD=3.50
PUBLIC_BASE_URL=https://lafijasdeelite-production.up.railway.app
```

La tasa 3.50 es solo un ejemplo para pruebas, no una cotización. No publiques secretos ni actives el modo live antes de completar la revisión de elegibilidad comercial, las pruebas y conciliación.

## Instalación

1. Extrae el ZIP y sube su **contenido** a la raíz de GitHub.
2. Confirma el nuevo commit en Railway y espera a `Success`.
3. Abre `/health` y busca `"version":"1.8.4"`.
4. Inicia sesión con una cuenta VIP activa: el menú debe mostrar **Renovar VIP**.
5. Para PayPal, inicia como dueño y consulta **Resumen → Diagnóstico de PayPal**.

## Verificación

Sintaxis JS revisada con Node. Checkout sin operaciones reales; faltan pruebas de pago en PayPal Sandbox y en el Railway del usuario.
