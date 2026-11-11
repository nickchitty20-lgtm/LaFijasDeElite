# Fijas de Élite v3.5.1 — GOLD por Telegram privado + VIP superior

- Planes por nivel (`gold`/`vip`) en MySQL, conservando como VIP todos los planes anteriores.
- Plan GOLD mensual inicial S/59.90; el administrador puede crear otros y configurar precios.
- Una única vinculación Telegram permite recibir GOLD por privado si GOLD o VIP está activo. VIP sigue en el canal privado como antes.
- Pronósticos GOLD publicados manualmente desde Panel > Pronósticos, con envío privado en cola durable y comprobación de permisos al enviar.
- Los clientes GOLD nunca reciben selecciones VIP. La compra de GOLD tampoco concede permiso VIP.
- Emisión idempotente por usuario y pronóstico: los envíos interrumpidos o fallidos requieren revisión manual para evitar duplicados.
- GOLD no altera ni modifica los resultados ni los pronósticos existentes.
- GOLD generado automáticamente por N-FORCE no está activado en esta versión: las selecciones GOLD se aprueban y publican manualmente.
- El cliente debe abrir /start mediante el enlace de vinculación. Un bot no puede escribir primero a usuarios que jamás lo iniciaron.
