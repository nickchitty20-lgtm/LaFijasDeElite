# Fijas de Élite v3.1.0 — N-FORCE Football Intelligence mejorado

**Base:** v3.0.0; mantiene web, Telegram, pagos, miembros y base de datos sin borrados.

- Modelo nforce-poisson-1.1 con regularización ataque/defensa, localía y ajuste de resultados bajos.
- Calidad explicable del historial, tamaño efectivo de muestra y detección de falta de datos.
- Backtesting cronológico por liga, categoría GRATIS/VIP y banda de probabilidad; Brier y log-loss.
- Autopublicación solo con backtest reciente de esta versión; borradores anteriores se actualizan y no se publican obsoletos.
- Dashboard muestra la calidad de historial y razones de descarte; mantiene permisos y flujos de Telegram.

**No cambia:** MySQL requiere las mismas tablas; la migración es compatible y aditiva; API-Football no es obligatorio. Sin cuotas ni lesiones inventadas.

**Cautela:** estos cambios no demuestran mayor precisión hasta comparar métricas históricas y, sobre todo, resultados fuera de muestra en producción.
