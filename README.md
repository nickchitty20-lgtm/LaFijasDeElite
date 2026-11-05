# Fijas de Élite v0.5 — Landing y planes iniciales

Actualización completa basada en v0.4. **No borres MySQL ni tus variables de Railway.** Descomprime y reemplaza los archivos del repositorio, conservando carpetas.

## Rutas
- `/` — Landing pública profesional, responsive, negro y dorado.
- `/admin.html` — Panel administrativo existente (se movió desde `/`).
- `/clientes.html` — Portal de registro y solicitudes VIP existente.
- `/health` — Salud del backend y MySQL.

## Planes iniciales
En el arranque se comprueba la existencia de cada nombre de plan y se crea solo si falta:
- VIP Semanal: S/ 15, 7 días
- VIP Mensual: S/ 45, 30 días
- VIP Trimestral: S/ 120, 90 días

No se sobrescriben los planes que ya hayas creado, ni se elimina información. Si ya hay otros planes activos, también aparecerán en el landing, porque se consultan desde `/api/plans`.

## Limitaciones importantes
- Los pagos automáticos **no** están conectados. No aceptar pagos reales hasta completar seguridad, conciliación y verificación.
- El acceso al canal Telegram VIP todavía no se gestiona automáticamente por membresía.
- El contenido público usa los endpoints reales `/api/plans` y `/api/predictions/free`.
- El landing carga una fuente externa de Google Fonts; si el navegador o la política CSP la bloquea, se usa tipografía del sistema. No se necesita fuente externa para que funcione.
- Para pruebas, verifica `/`, `/admin.html`, `/clientes.html` y `/health` después de que Railway muestre Success.


## v0.6 Animaciones
Se agregó `public/motion.js` y mejoras en `public/landing.css` y `public/index.html`. Incluye entrada del hero, apariciones al desplazarse, tarjetas con hover, barra de progreso, brillo dorado y movimiento ambiental. Respeta `prefers-reduced-motion`. No modifica endpoints, pagos, usuarios, tablas ni credenciales.


## v0.7 — Motion en toda la web
Se añadieron `public/ui-motion.css` y `public/ui-motion.js` a landing, administración y portal de clientes. Animaciones suaves en botones, enlaces, tarjetas, formularios, secciones y elementos dinámicos. Compatible con `prefers-reduced-motion`. No se alteran rutas, autenticación, pagos ni tablas.
