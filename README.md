# Fijas de Élite v1.8.2 — Diagnóstico Railway y PayPal

Proyecto completo de Fijas de Élite, construido sobre v1.8.1. Conserva login unificado, paneles oscuros, roles, pronósticos protegidos, Yape/Plin/transferencia manual y Checkout PayPal.

## Instalación

1. Subir **el contenido del ZIP** a la raíz del repositorio GitHub (no subir el ZIP como único archivo).
2. Hacer Commit y verificar que Railway despliega el último commit, con log de nueva compilación.
3. Abrir `https://TU-DOMINIO/health` y confirmar que la respuesta JSON incluye `"version":"1.8.2"`. Si no aparece, Railway todavía está ejecutando la versión antigua u otro servicio/repo.
4. Iniciar sesión como **dueño**, abrir Resumen → **Diagnóstico de PayPal v1.8.2**. Ahí se indican los NOMBRES de las variables faltantes, **nunca los valores secretos**.
5. Si aparecen todas completas, pulsar **Probar conexión con PayPal**: solo obtiene un token OAuth, no genera cobros.
6. Probar la compra únicamente en `PAYPAL_MODE=sandbox` usando comprador Sandbox y dinero de prueba.

## Variables de Railway

```env
PAYPAL_ENABLE=true
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=TU_CLIENT_ID_DE_SANDBOX
PAYPAL_CLIENT_SECRET=TU_SECRET_DE_SANDBOX
PAYPAL_PEN_PER_USD=3.50
PUBLIC_BASE_URL=https://lafijasdeelite-production.up.railway.app
```

La tasa 3.50 **es solo un ejemplo de prueba**, no el cambio oficial actual. No compartas valores secretos ni los subas a GitHub.

## Error X-Forwarded-For

El backend incluye `app.set('trust proxy', 1)` antes de express-rate-limit. Esto es correcto si hay **un solo proxy inverso confiable** entre Railway y la app. Si el error `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` persiste **y** `/health` no muestra `version:1.8.2`, verifica el despliegue efectivo; si muestra la versión correcta, revisa que los logs provengan del mismo servicio y de un despliegue reciente.

## Precauciones

No activar cobros Live sin comprobar elegibilidad del negocio con PayPal, pruebas de compra end-to-end, conciliación y manejo de reembolsos/contracargos. Activar `PAYPAL_ENABLE=true` en modo Sandbox solo habilita pruebas; no implica autorización comercial.

