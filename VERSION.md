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
