# Fijas de Élite v1.8.3 — Métodos de pago unificados

Basado en la v1.8.2 con backend Node.js/Express, MySQL, roles, paneles premium y pronósticos protegidos.

## Cambios importantes

- El menú **Método de pago** del cliente incluye Yape, Plin, transferencia y **PayPal**.
- Los métodos manuales solicitan referencia y envían una solicitud de revisión; PayPal **no** usa la ruta de pagos manuales, sino el checkout oficial del servidor.
- El botón y los campos cambian automáticamente según el método elegido.
- Si PayPal está deshabilitado, el usuario ve el motivo general y no puede iniciar un checkout. **Agregar PayPal al menú no activa PayPal en Railway.**
- Al regresar de PayPal, el cliente inicia sesión otra vez (el token no se guarda en almacenamiento persistente) y solo entonces se comprueba/captura el pago contra la API de PayPal.
- Se puede reintentar la verificación de la orden PayPal desde el panel, sin volver a pagar.
- Se conserva el diagnóstico privado del dueño, el trust proxy de Railway y el versionado en `/health`.

## Instalación

1. Subir **el contenido del ZIP**, no el archivo ZIP como único elemento, a la raíz de GitHub.
2. Esperar un nuevo despliegue **Success** en Railway.
3. Abrir `/health` y comprobar `version: 1.8.3`.
4. Abrir `/clientes.html`, iniciar sesión y entrar en **Comprar VIP**: seleccionar los cuatro métodos y comprobar que cambia el formulario.
5. Si PayPal sigue deshabilitado, iniciar sesión como dueño en `/admin.html`, **Resumen → Diagnóstico de PayPal** y completar los nombres de las variables indicadas.

## Configuración de PayPal Sandbox

```env
PAYPAL_ENABLE=true
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=CLIENT_ID_DE_SANDBOX
PAYPAL_CLIENT_SECRET=SECRET_DE_SANDBOX
PAYPAL_PEN_PER_USD=3.50
PUBLIC_BASE_URL=https://lafijasdeelite-production.up.railway.app
```

**La tasa 3.50 es un ejemplo de prueba, no un tipo de cambio vigente.** No compartas credenciales ni subas secretos a GitHub. PayPal para venta de pronósticos deportivos está sujeto a sus requisitos y autorización. No activar pagos `live` sin validación comercial, pruebas completas, conciliación y manejo de disputas.

## Limitaciones

- No se ha ejecutado una compra contra el Sandbox real ni se ha verificado el despliegue público.
- Los pagos manuales requieren que el administrador valide el abono en su cuenta; la referencia del cliente no es prueba de pago.
- PayPal usa USD, con conversión configurada por el dueño.
