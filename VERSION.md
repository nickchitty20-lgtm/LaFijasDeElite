# Fijas de Élite v3.5.4 — Anuncios GOLD en canal oficial

- Las nuevas selecciones GOLD se mantienen privadas para los suscriptores GOLD/VIP.
- El canal oficial recibe **un aviso promocional breve por nueva publicación GOLD**, sin partido, selección, probabilidad, análisis ni cuota.
- Los anuncios GOLD no se envían al grupo de la comunidad. El flujo de VIP conserva sus destinos previos.
- Nuevo registro `telegram_gold_public_announcements` que evita anuncios duplicados después de reinicios.
- Si se retira una publicación, el sistema intenta eliminar el anuncio de Telegram si la API lo permite.
- Se corrige la ruta de publicación de N-FORCE y del motor API para garantizar que GOLD pase siempre por el mismo control de envíos.
- No requiere variables nuevas: usa TELEGRAM_FREE_CHANNEL_CHAT_ID, TELEGRAM_FREE_CHANNEL_URL, TELEGRAM_BOT_TOKEN y PUBLIC_BASE_URL.
- Solo afecta publicaciones GOLD nuevas, no reenvía el historial.
