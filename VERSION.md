# Fijas de Élite v3.5.2 — GOLD automático y VIP premium

- Los próximos candidatos N-FORCE que antes eran GRATIS se convierten en **GOLD** sin modificar probabilidades ni criterios de selección.
- Se preservan las publicaciones históricas GRATIS y todas sus ganancias y pérdidas en su categoría original.
- Las propuestas antiguas GRATIS pendientes deben reanalizarse o actualizarse antes de poder publicarse, para evitar divulgación pública accidental.
- GOLD se distribuye por mensaje privado del bot a usuarios GOLD o VIP activos y vinculados; el canal oficial sigue siendo público y el VIP exclusivo permanece intacto.
- Tarifas VIP objetivo (PEN): 7 días S/89.90; 30 días S/249.90; 90 días S/649.90. Incremento único sobre planes activos de esas duraciones, sin bajar tarifas ya superiores ni modificar pagos anteriores.
- La clasificación GOLD por sí sola no significa mayor precisión; VIP puede quedar sin propuestas si ninguna supera sus filtros.
- Se mantienen todas las membresías, pagos, resultados, registros y funciones anteriores.

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
