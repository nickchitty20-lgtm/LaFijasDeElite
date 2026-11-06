# Fijas de Élite v2.0.3 — Corrección móvil

- Se elimina el desbordamiento horizontal del documento en todas las páginas (`/`, `/clientes.html`, `/admin.html`).
- Tarjetas, formularios y grids se adaptan a móviles estrechos; los menús conservan scroll horizontal interno.
- Todos los módulos y la desvinculación de Telegram de v2.0.2 se conservan.
- Verificar `/health` → `2.0.3`.

---

# Fijas de Élite v2.0.2 — Dashboard restaurado

Restauración de secciones en los paneles del dueño, personal y clientes. No cambia pagos, rangos, Telegram ni datos existentes.

- El menú administrativo se calcula desde los permisos del cargo, nunca desde qué panel está oculto por una pestaña.
- Resumen, pronósticos, pagos, finanzas, VIP, planes, clientes, personal, actividad y Telegram siguen accesibles según el cargo.
- Carga de información secundaria tolerante a errores: no desaparece el dashboard si un módulo responde mal.
- Cliente: se muestra el menú inmediatamente después de verificar su cuenta; las consultas de notificaciones/Telegram no bloquean su panel.
- Recursos HTML, CSS y JavaScript evitan mezclar versiones por caché.
- Mantiene «Desvincular Telegram sin expulsar» de v2.0.1.

## Instalación

1. Respaldar MySQL.
2. Reemplazar todos los archivos del repositorio GitHub con los del ZIP, no solo server.js.
3. Comprobar que Railway muestra **Success** y `/health` versión `2.0.2`.
4. Cerrar y volver a abrir `/admin.html` o `/clientes.html`; en caso necesario `Ctrl+F5`.
5. Probar todos los módulos del menú de dueño y cliente. Los demás cargos seguirán viendo solamente módulos autorizados.

**No borrar la base MySQL ni las variables de Railway.** La corrección es del frontend y carga de datos; los pagos siguen con la configuración existente.
# v2.0.1 — Centro de notificaciones

Base: Fijas de Élite v1.9.5. Esta versión NO cambia las credenciales PayPal, sus reglas de pago, los rangos ni las invitaciones privadas del bot.

## Nuevas funciones

- Cliente o personal → **Notificaciones**: tres interruptores independientes. Desactivados por defecto hasta consentimiento explícito. Requiere Telegram vinculado.
- Avisos privados por Telegram: VIP activado/renovado (manual, pago revisado o captura PayPal verificada), recordatorios de vencimiento a 3 y 1 día, y nuevos pronósticos de fútbol disponibles para ese usuario.
- Se comprueba el VIP en el backend en el momento del envío. Los usuarios gratuitos solo reciben avisos genéricos de pronósticos gratuitos. Ni cuotas ni selecciones VIP se envían en mensajes a usuarios gratuitos.
- Comando privado `/stop` para desactivar todos los mensajes privados opcionales del bot.
- Envíos con cola persistente MySQL, claves de deduplicación, reintentos limitados y lotes de hasta 12 mensajes por minuto.
- Los usuarios Rank 0, las cuentas sin Telegram vinculado y los cambios de cuenta Telegram pendientes no reciben avisos. Si alguien revoca su consentimiento antes del envío, la notificación pendiente se descarta.

## Instalación

1. **Haz copia de seguridad de MySQL.** Descomprime el ZIP y reemplaza todo el código en GitHub; comprueba **Railway Success** y `GET /health` con `"version":"2.0.1"`.
2. Conserva las variables actuales: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_VIP_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`, `JWT_SECRET` y todas las de PayPal. **No hace falta crear variables nuevas**.
3. La migración automática crea `telegram_notice_prefs`, `telegram_notice_outbox` y `telegram_notice_events` de forma aditiva. No toca membresías existentes.
4. Con una cuenta de prueba, vincula Telegram desde **Telegram VIP**, abre **Notificaciones**, marca avisos y guarda.
5. Con otra cuenta VIP de prueba, autoriza un período manual; debe llegar un aviso al Telegram vinculado del cliente que optó por recibirlo. Publica un pronóstico gratuito y comprueba el aviso (sin cuota ni selección).
6. Desmarca las opciones y comprueba que no llegan nuevos avisos. Envía `/stop` al bot para desactivar todos desde Telegram.

## Límites honestos

- Los mensajes del bot se entregan con **mejor esfuerzo**: Telegram puede rechazar o retrasar mensajes, o el usuario puede bloquear el bot.
- La cola evita los duplicados normales; sin embargo, una caída entre que Telegram acepta un mensaje y MySQL confirma su entrega puede producir un mensaje duplicado. La API `sendMessage` no ofrece idempotencia de extremo a extremo.
- La cola avanza en lotes; con muchos clientes los avisos tardarán más. El servidor Railway debe seguir ejecutándose para enviar mensajes.
- El recordatorio se calcula por fecha UTC del vencimiento total, después de renovaciones confirmadas. Los rangos con VIP por cargo no generan avisos de vencimiento.
- El sistema respeta los permisos y membresías de la base de datos, pero **no se han probado mensajes reales en tu Railway ni en tu bot**. Se ejecutaron pruebas unitarias y revisión de sintaxis, no pruebas end-to-end con Telegram/MySQL/PayPal reales.
- Las notificaciones por Telegram son optativas; las internas de pagos siguen en el portal y no requieren Telegram.
