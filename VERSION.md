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
