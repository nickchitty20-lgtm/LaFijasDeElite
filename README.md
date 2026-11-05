# Fijas de Élite v1.6 — Culqi + pagos manuales

Mantiene todas las funciones de v1.5. Checkout de tarjeta Culqi Checkout + cargo server-side; Yape, Plin y transferencia siguen con verificación manual.

## Railway
Configurar `CULQI_PUBLIC_KEY=pk_test_...`, `CULQI_SECRET_KEY=sk_test_...`, `CULQI_ENABLE=true`. Primero probar en entorno de pruebas. Las llaves de producción `pk_live_` y `sk_live_` deben corresponderse. Nunca incluir secretos en GitHub.

El navegador genera un token mediante el SDK de Culqi. El servidor calcula el importe desde MySQL, crea el cargo en Culqi, y solo activa VIP si la API devuelve un cargo capturado válido. Los cargos con 3DS/pending no activan VIP; requieren una integración de autenticación 3DS adicional. Si el cargo se confirma pero la base de datos falla, **no se debe reintentar el pago**: revisar el cargo en Culqi y conciliar manualmente. No es una integración lista para producción sin pruebas reales, reconciliación de pagos y revisión del flujo 3DS.

## Importante
- Los planes son pagos únicos, no suscripciones recurrentes.
- Para operar en producción es necesario completar el onboarding y validación comercial de Culqi.
- El campo `payments.external_reference` debería tener índice UNIQUE para idempotencia fuerte; antes de agregarlo hay que verificar que no existan duplicados previos.
- Los cobros manuales solo se aprueban desde el panel de administradores autorizados.
- No introducir datos de tarjeta en formularios propios ni logs.
- En caso de error después del cobro, conciliar el cargo desde el panel de Culqi antes de reintentar.

Documentación: https://docs.culqi.com/es/documentacion/checkout/checkout-custom y https://apidocs.culqi.com/
