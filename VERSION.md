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
