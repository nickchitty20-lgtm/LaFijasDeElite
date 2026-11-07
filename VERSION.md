# v3.2.6 — N-FORCE multimerkado con aprobación manual

- Modelo propio Poisson v1.2: menor contracción de las fuerzas relativas; no se afirma una mejora de acierto sin backtesting real.
- Mercados elegibles: 1X2, totales de goles, ambos marcan y doble oportunidad. Se selecciona **solo una** propuesta por partido.
- Los umbrales de VIP comprueban muestra reciente, calidad y diferencia frente a la frecuencia histórica de la liga; no sustituyen una cuota ni equivalen a valor esperado de apuesta.
- Doble oportunidad ahora admite cotejo por marcador final sin alterar apuestas antiguas. Backtesting registra acierto y Brier por mercado sobre propuestas históricas.
- Escáner muestra candidatos existentes, borradores actualizados y ejemplos de filtros. Un partido ya publicado o descartado **no se republica**.
- Se conserva aprobación manual, MySQL, Telegram, suscripciones, web y compatibilidad con históricos v1.1.
- No se exponen nombres comerciales de proveedores en fichas públicas; procedencia y licencias permanecen en metadatos/documentación.
- Los datos de lesiones, sanciones y alineaciones **no** están incorporados; no se inventan.
- Para autopublicar (si está activado), el mercado debe tener ≥40 propuestas revisadas retrospectivamente en backtesting vigente, además de las condiciones existentes.

**Migración:** no necesita alterar tablas ni añadir variables obligatorias. Tras desplegar, importar, ejecutar «Validar modelo» y «Analizar ahora» para actualizar los borradores. Las publicaciones anteriores permanecen como historial.
