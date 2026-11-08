# Fijas de Élite v3.2.9.4 — Pronósticos próximos (72 horas)

- Ventana de análisis máximo de **3 días (72 horas)**, con horario conocido y al menos una hora antes del inicio.
- Hasta 240 partidos por escaneo **dentro** de esa ventana: no se amplía a partidos lejanos para forzar más propuestas.
- Mantiene el diagnóstico de propuestas nuevas, ya registradas por estado, historial insuficiente y filtros rechazados de v3.2.9.3.
- Conserva actualización automática de datos (cada ~2 h si está habilitada), análisis (cada ~1 h), selección multimerkado, filtros VIP, aprobación manual, web, Telegram, MySQL y pagos.
- No se añaden datos de lesiones o alineaciones sin una fuente de datos real. Buscar 72 h antes no garantiza información completa ni actualizada.
- Se corrigió también la versión de `/health` para que identifique este despliegue.
- El motor puede generar cero propuestas cuando los datos o criterios no alcanzan. No se fuerzan porcentajes ni pronósticos.
