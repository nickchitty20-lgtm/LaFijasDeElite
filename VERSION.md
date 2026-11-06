# Fijas de Élite v2.1.2 — Compatible con API-Football Free

- Corrige el error `Free plans do not have access to the Last parameter` en la búsqueda completa: ahora `fixtures/headtohead` se consulta con `h2h` y los 5 encuentros anteriores se eligen en el backend.
- Los fallos de datos complementarios H2H no bloquean el análisis del partido.
- Si la consulta de predicciones falla para un partido, se continúa con los siguientes; si fallan todas, el escaneo se marca como fallido y se puede reintentar sin el bloqueo de 3 horas.
- La web informa partidos examinados, descartados, sin predicción y errores del proveedor.
- No modifica MySQL, pagos, Telegram ni membresías; publicación automática sigue controlada por `FOOTBALL_AUTO_PUBLISH`.
