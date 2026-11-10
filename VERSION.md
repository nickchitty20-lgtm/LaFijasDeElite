# 3.3.9 — Diagnóstico de calendario y verificación de horarios

- Distingue por liga partidos con fecha pero sin hora, con hora, y excluidos por estado.
- Permite comprobar si la ventana de 14 días está vacía por la importación o por el calendario.
- Indica que la verificación independiente de horarios solo tiene cinco ligas mapeadas; no equivale a las 20 configuradas.
- No inventa horas ni relaja filtros ni cambia predicciones publicadas. No requiere migraciones.

---

# 3.3.8 — Ventana predeterminada de 14 días y diagnóstico de ligas

- Ventana de análisis por defecto ampliada de 72 horas a 14 días; configurable 3–21 días.
- La API de estado y el panel muestran la cantidad persistente de ligas realmente presentes en MySQL, separada de las 20 configuradas en código.
- El análisis se mantiene seguro y manual; no se relajan los filtros para fabricar fijas.
- Si hay un valor anterior `NFORCE_SCAN_DAYS=3` en Railway, ese ajuste sigue teniendo prioridad y debe actualizarse.
- Para cargar las ligas nuevas, primero ejecutar la importación y comprobar finalización; luego analizar.

---

# 3.3.7 — N-FORCE 20 ligas y cobertura internacional

Amplía la lista de 5 a 20 competiciones compatibles, añade calendario anual para Brasil, corrige zonas horarias no europeas, amplía la consulta histórica y hace el rango de escaneo configurable de 3 a 21 días (3 por defecto). Los archivos no disponibles se omiten e informan; no generan partidos inventados. Mantiene el modelo conservador 1.5, filtros VIP, MySQL, Telegram y aprobación manual.

---

# Fijas de Élite v3.3.6 — Pendientes coherentes y filtro VIP conservador

- **Comparativa corregida**: «Pendientes» cuenta directamente pronósticos publicados activos con `outcome=pending` y `archived_at IS NULL`. Los pendientes retirados dejan de inflar el indicador; sus victorias o derrotas históricas sí se conservan. El API informa `retired_unsettled` para auditar las diferencias.
- El panel de administración prioriza mostrar pendientes y eleva su límite a 300 registros; sigue existiendo la vista de retirados.
- Se deshabilita la caché de resultados públicos para reflejar cambios manuales sin demoras de caché.
- **VIP más selectivas**: exige mayor historial reciente de ambos equipos, rendimiento suficiente como local/visitante, modelo ajustado por rivales y estabilidad ante variaciones ±12% de goles esperados y frente al pronóstico regularizado anterior. No se añade ningún porcentaje artificial. Se priorizan propuestas con mejor escenario conservador respecto de la frecuencia de liga.
- El criterio VIP sigue exigiendo validación walk-forward vigente, tamaño de muestra y calibración. Si no hay evidencia adecuada, **no se publica una VIP**; ninguna fija es segura o tiene acierto garantizado.
- Nuevo identificador estadístico `nforce-poisson-1.5`: **es necesario ejecutar «Validar modelo» y «Analizar ahora»** tras importar datos. Propuestas N-FORCE antiguas en borrador requieren «Reanalizar»; las ya publicadas y sus resultados no se alteran.
- No requiere migración de MySQL ni variables nuevas. Conserva usuarios, pagos, Telegram y los marcadores históricos.
- Los filtros VIP nuevos no han demostrado por sí solos mayor acierto en producción: revisar el backtesting y seguir acumulando resultados contrastados antes de presentarlos como mejores.

# Fijas de Élite v3.3.5 — Marca simplificada

- La identidad de la plataforma se presenta como **Fijas de Élite** y el módulo estadístico como **N-FORCE**.
- Se reemplazó la denominación anterior en portada, acceso, área privada, panel y análisis futuros.
- Para los análisis anteriores ya guardados, se normaliza el nombre **al mostrarlos o enviarlos a Telegram** sin modificar su trazabilidad en MySQL.
- Se mantienen el motor, el análisis de 72 horas, la sincronización de horarios, Telegram, usuarios, suscripciones y filtros VIP.
- Sin migraciones de base de datos ni nuevas variables de entorno. Confirmar `/health` y `Panel JS` = `3.3.5`.

# Fijas de Élite v3.3.4 — Horarios compatibles con plan gratuito

## v3.3.4 — Horarios compatibles con plan gratuito (2026-11-08)

- **Solucionado el error de fecha de API-Football Free**: `FOOTBALL_SCHEDULE_PLAN=free` (predeterminado) consulta solo ayer, hoy y mañana **en UTC**. Ya no intenta verificar días +2/+3 que el plan no permite.
- El motor N-FORCE **sigue analizando partidos de 1 a 72 horas**; el límite de sincronización no reduce la ventana predictiva. Horarios de partidos fuera de cobertura siguen claramente identificados como **no verificados en vivo**.
- Si el servicio comunica otro rango permitido, el sincronizador lo detecta y evita repetir peticiones fuera de él durante ese día. Evita avisos repetidos en los logs y reduce consumo innecesario de cuota.
- En `Panel → Análisis automático → Estado del calendario` la API informa `schedule_plan` y `allowed_dates_utc`. Se limpia un error transitorio anterior después de una comprobación satisfactoria.
- Si más adelante contratas un plan que permita más días, establece `FOOTBALL_SCHEDULE_PLAN=extended` para volver a verificar hoy y los próximos 3 días. No hace falta cambiar otras claves.
- No modifica MySQL, Telegram, resultados, membresías ni filtros VIP.

# Fijas de Élite v3.3.3 — Identificación de versión y horarios en administrador

- Se muestran el build JS y el del servidor; alerta visible cuando no coinciden (despliegue parcial o caché).
- La API de pronósticos administrativos devuelve `match_kickoff_utc` como UTC explícito para evitar interpretaciones ambiguas de `DATETIME`.
- Cada pronóstico muestra la hora de Perú: se usa el calendario verificado cuando está disponible y, si falla el módulo, se conserva una hora programada **sin afirmar que sea en vivo**.
- No afecta predicciones, cuotas, historial, MySQL, envíos Telegram ni filtros VIP.
- Railway: tras desplegar, verifica `/health` = `3.3.3` y `Panel JS v3.3.3`. Si la captura sigue mostrando `cuota null`, estás viendo código anterior.

# Fijas de Élite v3.3.2 — Sincronización verificable de horarios

- UTC fijado explícitamente para las fechas MySQL; todas las vistas muestran `America/Lima` sin depender de la zona horaria del dispositivo.
- Publicaciones manuales: el campo de entrada ahora indica **hora de Perú**, convertida a UTC en el servidor antes de guardar o enviar a Telegram.
- Verificación deportiva independiente del motor: `FOOTBALL_SCHEDULE_LIVE=true` + `FOOTBALL_API_KEY` permiten consultar cambios reales de fecha y estado. El motor N-FORCE sigue en modo `own` y en ventana de 72 horas.
- Consulta de calendario controlada por cuota: fechas más próximas hasta cada 30 minutos, días futuros con intervalos mayores, máximo 70 consultas diarias por defecto (configurable hasta 75). El estado no se presenta como señal minuto a minuto.
- Vinculación prudente de partidos: liga + ambos equipos + fecha aproximada, con rechazo de coincidencias ambiguas. Un horario verificado tiene prioridad frente a ficheros de calendario antiguos.
- Web, clientes y administrador actualizan horarios desde `/api/schedules/live` sin recargar. Los avances VIP solo exponen metadatos del encuentro, nunca selecciones.
- **Si no existe un feed actualizado o la verificación envejece, NO se muestra cuenta regresiva como si fuera cierta**: figura hora orientativa, sin confirmación. Se distinguen partido en juego, aplazado, cancelado o finalizado cuando lo confirma el feed.
- `/api/admin/schedules/status` permite diagnosticar última verificación, partidas enlazadas y fallos.
- Migración MySQL aditiva: `nforce_fixture_schedules`, `nforce_schedule_requests`. Conserva todos los usuarios, pagos, suscripciones, propuestas y resultados históricos.
- **Límite**: los mensajes ya enviados a Telegram son fotografías del momento en que se publicaron; para ver el horario corregido, consultar la web actualizada. La verificación depende de la cobertura, permisos, cuota y disponibilidad del feed; nunca garantiza datos en vivo continuos.

---

# Fijas de Élite v3.3.1 — Horarios de pronósticos publicados

- El panel de administrador ahora muestra la fecha y la **hora de inicio del partido en Perú (America/Lima)** junto a cada pronóstico publicado, también en el historial de retirados.
- Diferencia claramente un partido cuyo horario programado ya pasó de uno con resultado final confirmado. No cambia estados a GANADA/PERDIDA por el simple paso del tiempo.
- La portada muestra la hora de inicio en los adelantos de pronósticos publicados, sin revelar las selecciones VIP bloqueadas; el historial de resultados muestra también la hora.
- El panel de clientes ya presentaba un reloj de inicio y lo conserva.
- Mantiene la predicción estadística N-FORCE v3.3.0, la ventana de 72 h, filtros VIP, MySQL, Telegram y suscripciones. No requiere migraciones ni nuevas variables.
- Si faltan horas en la base de datos se muestra «Horario no disponible»; no se inventan horas.
- Validar con Railway tras desplegar. Las pruebas automatizadas locales no sustituyen una prueba en producción.
