# Fijas de Élite 3.6.2 — Panel de fuentes deportivas

- Nueva pestaña **Fuentes deportivas** disponible exclusivamente para la cuenta propietaria, dentro del panel N-FORCE.
- Interruptor para **activar o desactivar el calendario complementario** desde la web, sin tocar variables de Railway después del despliegue.
- La configuración se almacena en la nueva tabla `nforce_source_settings` de MySQL. En la primera actualización conserva como valor inicial el estado de `FOOTBALL_SECONDARY_SCHEDULE` si ya estaba configurado; desde entonces mandan las decisiones tomadas en el panel.
- Cada modificación se registra en `audit_logs`, requiere sesión de propietario y usa el control anti-CSRF actual.
- Estado visible de las tres partes: **histórico deportivo** (necesario para el modelo), **calendario complementario** (configurable) y **verificador independiente** (solo lectura; necesita clave autorizada en Railway).
- Botón para solicitar **Importar datos ahora**, sujeto a los tiempos de espera y límites existentes. El nuevo estado se aplica a la próxima importación, sin interrumpir un proceso ya iniciado.
- Desactivar la fuente adicional no borra calendarios importados anteriormente ni las propuestas; tampoco cambia GOLD, VIP, Telegram ni las comprobaciones de publicación.
- El acceso público gratuito a datos puede tener condiciones de uso y límites: verificar que sea apto para la actividad comercial antes de activarlo en producción.
- Migración aditiva, sin eliminar ni modificar suscripciones, pronósticos o pagos. Pruebas automatizadas incluidas.

# Fijas de Élite 3.6.1 — Detección ampliada con API complementaria

- Añade TheSportsDB v1 como **segunda fuente optativa de descubrimiento de próximos partidos**; nunca sustituye el histórico ni el motor N-FORCE.
- 22 competiciones mapeadas explícitamente: 13 ligas de clubes y 9 torneos internacionales (incluye amistosos, Nations League, Mundial, Copa América y otros). Las eliminatorias no se incluyen en esta fuente cuando falta un identificador de competición inequívoco.
- Consume `eventsnextleague.php` con clave pública 123 (30 solicitudes/minuto, respuestas recortadas según el plan). Máximo 22 solicitudes por importación; los escaneos habituales usan MySQL sin llamadas adicionales.
- Rechaza resultados, aplazamientos, partidos en juego, fechas imprecisas, horarios con formato ambiguo y encuentros fuera de los 21 días. Acepta el `strTimestamp` UTC sin zona que devuelve la API cuando `dateEvent` y `strTime` coinciden; no deduce horas de una fecha sola.
- Reconcilia liga, equipos y horario con el calendario existente. Mantiene una clave estable por evento para evitar duplicados incluso cuando cambie el horario. No graba estados NS en la tabla de verificación independiente.
- El panel privado muestra si la segunda fuente está activa, competiciones configuradas, nuevos partidos almacenados, partidos vinculados y errores; los módulos públicos no muestran su nombre.
- **Para activar en Railway:** `FOOTBALL_SECONDARY_SCHEDULE=true`. No hace falta otra clave con el servicio gratuito; `FOOTBALL_SECONDARY_API_KEY` es optativa para una clave v1 propia.
- Ejecutar **Importar datos deportivos** y, al terminar, **Analizar ahora (21 días)**. Que se detecten partidos no implica que todos pasen los criterios estadísticos o sean publicables. La información complementaria no sustituye una comprobación actual de horario/estado.
- No modifica suscripciones GOLD/VIP, Telegram, tablas de pagos ni pronósticos antiguos. No se elimina la base de datos.
- Uso comercial: verificar las condiciones vigentes y derechos del proveedor antes de utilizar la API gratuita en un servicio de pago; esta integración no afirma una licencia universal para redistribuir datos.
- Pruebas locales con respuestas simuladas; la conexión real desde Railway debe validarse en el panel. Se consultó documentación pública para identificar endpoint y estructura de evento.

# Fijas de Élite 3.6.0 — Diagnóstico de búsqueda y ventana ampliada

- Ventana de análisis por defecto: **21 días** (configurable con `NFORCE_SCAN_DAYS` entre 3 y 21). Útil al volver del parón internacional; si Railway ya tiene la variable definida, hay que cambiarla manualmente a 21 para ampliar el rango.
- Selector manual de **7 / 14 / 21 días** en el panel, independientemente de la variable que controle los escaneos programados.
- El último escaneo diferencia los motivos de **cero propuestas nuevas**: calendario sin hora confirmada, partidos fuera de ventana, historial escaso, selecciones bajo los filtros y propuestas ya registradas.
- Desglose por liga/torneo de encuentros revisados, modelos evaluados, nuevas propuestas, existentes y rechazados. Ejemplos marcados **en observación / NO publicables**, sin falsificar probabilidades ni generar recomendaciones fuera de los filtros.
- Mantiene los requisitos GOLD y VIP, la aprobación de dueño, el control de horarios, la validación retrospectiva y el bloqueo de encuentros iniciados.
- No hay garantía de obtener propuestas: depende de los datos deportivos realmente disponibles. No altera ni borra la base MySQL.

# Fijas de Élite 3.5.9 — Selecciones nacionales (integración sin romper clubes)

- Añade **11 categorías de competiciones de selecciones** y un importador CC0 con allowlist cerrada: Mundial FIFA, Eurocopa, amistosos, eliminatorias mundialistas, UEFA Nations League, CONCACAF Nations League, Copa América, Copa Africana, Copa Asiática, Copa Oro y clasificatorias de Eurocopa.
- Importa históricos y calendarios válidos desde JSON de torneos internacionales; los archivos sin hora se conservan para estadísticas, NUNCA como partidos con horario confirmado. Detecta offsets UTC explícitos en los calendarios del Mundial.
- El análisis de selecciones utiliza un historial internacional separado del de clubes, agrupado entre torneos para evitar muestras vacías por cambiar de competición; conserva umbrales de tamaño y filtros GOLD/VIP.
- Si el verificador independiente ya configurado devuelve amistosos/torneos internacionales programados, vincula o incorpora dichos partidos con fecha, hora y estado **NS** verificados; nunca inventa un inicio ni publica automáticamente por el mero hallazgo.
- Mantiene límites del plan y los chequeos de horarios de v3.5.8. En competiciones, fechas o países sin cobertura fiable, no se crean propuestas por intuición.
- Para partidos internacionales terminados, solo registra resultados oficiales FT a los 90 minutos cuando están disponibles; no confunde prórroga o penales con el 1X2.
- Panel N-FORCE: recuento de partidos y competiciones de selecciones, junto a clubes. Sin migraciones destructivas ni cambios a pagos, GOLD/VIP o Telegram.
- Fuentes de fechas internacionales son datos comunitarios y pueden retrasarse. La disponibilidad concreta depende de los encuentros incluidos en los archivos y de la cobertura/plan del verificador.

# Fijas de Élite 3.5.8 — Verificación manual del horario por propuesta

- Se agrega **Verificar horario y estado del partido** junto a los borradores pendientes que requieren una comprobación independiente en la ventana disponible.
- Solo el dueño puede solicitar la verificación. Se consulta la fecha real de la propuesta, con límites de plan, cuota diaria, bloqueo entre instancias y un intervalo de al menos cinco minutos por fecha.
- Si no se puede verificar el encuentro (fuera de fecha, liga sin cobertura, fallo del proveedor, estado distinto de NS o sin correspondencia), el sistema explica la razón y mantiene bloqueada la publicación.
- Fuera de la cobertura de la fuente independiente, se admite el camino conservador del calendario local actualizado dentro de 36 horas, sin confundirlo con un estado en vivo verificado.
- Los horarios modificados obligan a reanalizar la misma propuesta y volver a confirmar la publicación; no se publica automáticamente.

# Fijas de Élite 3.5.7 — Reparación de publicación de propuestas antiguas

- Comparación de horario, marcador y frescura del calendario antes de publicar.
- Las verificaciones recientes e independientes de un encuentro aún no iniciado permiten reanalizar borradores antiguos aunque el fichero comunitario sea viejo; nunca se da por vigente un encuentro sin evidencia suficiente.
- El dueño puede actualizar datos y reanalizar la misma propuesta sin perder su ID, sin crear borradores duplicados ni publicar automáticamente.
- El panel presenta un diagnóstico comprensible, bloquea publicar si faltan verificaciones y conserva las salvaguardas existentes.
- Pruebas de regresión de propuesta de modelo antiguo, cambios de horario, finalizados y datos desactualizados.

# Fijas de Élite 3.5.6 — Recuperación controlada de descartes antiguos

- Añade **Recuperar propuestas descartadas por incompatibilidad** en Análisis automático del panel dueño.
- Lista las 150 propuestas descartadas más recientes y muestra motivo, versión y requisitos de calendario.
- Un botón por registro permite reanalizar de forma explícita descartes históricos que la v3.5.5 dejó permanentemente bloqueados como `manual` o sin etiqueta.
- Sólo vuelve como borrador en Pendientes si el partido está en el horizonte de escaneo, tiene horario válido, no está finalizado, no fue publicado y supera los filtros estadísticos actuales.
- Cada cambio queda auditado con responsable. No se eliminan registros, no se publican recomendaciones ni se cambian resultados.
- La recuperación automática 3.5.5 por incompatibilidad registrada sigue vigente; el rescate manual es adicional y explícito.
- Se conservan GOLD/VIP y anuncios GOLD únicamente en el canal oficial.
