# Fijas de Élite v3.6.7 — Más historial y auditoría detallada del filtro VIP

- El importador histórico consulta **tres temporadas de clubes** (antes dos) para las 20 competiciones autorizadas. Los archivos inexistentes se informan como faltantes; no se crean resultados artificiales. Se mantienen las mismas fuentes y reglas de licencia.
- El horizonte de análisis de clubes pasa de **540 a 900 días** para aprovechar resultados efectivamente importados, sin usar encuentros posteriores al inicio del partido analizado. La frescura exigida para crear un modelo sigue en 90 días y los umbrales específicos VIP permanecen intactos.
- Modelo **nforce-poisson-1.7**: debido al mayor horizonte de entrenamiento, se debe ejecutar **Validar modelo (backtest)** de nuevo. Los borradores de un modelo anterior deben reanalizarse; jamás se publican por compatibilidad forzada.
- En **Análisis automático → ¿Por qué todavía no aparece ninguna VIP?**, nuevo desglose por partido de muestra insuficiente: cantidad de partidos del equipo, partidos de liga, local en casa, visitante fuera, muestra efectiva, actualidad y calidad. Los contadores por partido se separan de los 9 mercados por encuentro.
- Se mantiene el cálculo Bayesiano local/visitante existente para evitar sobreponderar muestras pequeñas. No se rebajaron umbrales, ni se inventó una mejora de acierto; importar tres temporadas puede tardar más y algunos archivos pueden no existir.
- El flujo **Fuentes deportivas → Importar y analizar al terminar** importa primero el historial nuevo y después reevalúa borradores *activos* a través del escaneo existente. Los descartes manuales, las publicaciones y los pagos permanecen inalterados.
- Actualiza mediante Railway, pulsa **Importar y analizar al terminar** y luego **Validar modelo (backtest)**. Consulta el diagnóstico VIP actualizado. La conexión real con MySQL y los proveedores debe confirmarse en Railway.

# Fijas de Élite 3.6.6 — Diagnóstico de ausencia de VIP

- Nueva sección **Análisis automático → ¿Por qué todavía no aparece ninguna VIP?** (solo propietario).
- Endpoint de solo lectura `GET /api/admin/football/vip-diagnostic`: consulta las propuestas N-FORCE, el último backtest y el último diagnóstico de escaneo disponible en este proceso.
- Separa *partidos encontrados*, *modelos calculados*, *clasificados VIP*, *borradores VIP*, *modelo válido* y *backtest VIP aprobado*; incluye ejemplos de bloqueo sin revelar claves.
- Razones desglosadas: no hay calendario, falta historial, filtros VIP, validación vencida, muestra por mercado insuficiente, mala calibración y configuración del canal.
- Los rechazos por mercado se identifican explícitamente como **mercados evaluados, no partidos diferentes**. En Railway, la información detallada del último escaneo en memoria se pierde si el proceso se reinicia; los borradores y backtests continúan en MySQL.
- **No se relajan umbrales, no se prometen VIP, no se generan estadísticas ni pronósticos artificiales.** No cambia el modelo, la publicación, GOLD, la lista blanca ni Telegram.
- Tras desplegar, abre la sección, pulsa **Diagnosticar candidatas VIP**, ejecuta **Importar datos deportivos → Analizar ahora → Validar modelo** si corresponde, y consulta el motivo real.
- Pruebas automatizadas locales; faltan datos reales de MySQL/Railway para identificar el bloqueo exacto de la instalación.

# Fijas de Élite 3.6.5 — Lista blanca GOLD y adelantos oficiales

- Nueva lista blanca GOLD con registro de @usuario desde el área de clientes. El @usuario NO acredita identidad: el bot exige el enlace de un solo uso y confirma el `from.id` y `from.username` que aporta Telegram.
- El bot confirma por privado la autorización GOLD después de pulsar Iniciar y verificar una membresía GOLD o VIP vigente. Un Telegram ya vinculado y previamente verificado puede autorizarse de inmediato si coincide su usuario. Telegram no permite iniciar conversaciones privadas solo con un @usuario.
- Los pronósticos GOLD completos se distribuyen únicamente a usuarios autorizados en la lista blanca, con un vínculo activo a la misma cuenta de Telegram y membresía vigente. El worker revalida permisos antes de enviar. Las publicaciones anteriores NO se reenvían retroactivamente.
- Se conserva la continuidad de cuentas VIP/GOLD vinculadas con anterioridad mediante una migración aditiva de los vínculos legítimos a la nueva lista blanca; no se modifica MySQL manualmente ni se pierde el canal VIP.
- El canal oficial recibe un adelanto de cada nuevo GOLD: nombre del encuentro y competición solamente si provienen de una propuesta automática validada, más horario cuando exista. Nunca publica pick, selección, mercado, cuota, porcentaje ni análisis completo. Un anuncio manual no revela títulos potencialmente sensibles.
- Nuevo panel de auditoría de lista blanca GOLD, exclusivo para el propietario, con autorizados, pendientes, sin membresía y desvinculados. Nadie puede conceder acceso desde el panel sin verificar el Telegram.
- `/stop` desactiva notificaciones y mensajes GOLD hasta una nueva autorización. Los mensajes privados requieren que cada usuario haya iniciado previamente el bot.
- Mantiene las fuentes deportivas, GOLD/VIP, la base de datos y los módulos de la v3.6.4.

# Fijas de Élite 3.6.4 — Calendario ampliado configurable

- Integra una tercera fuente opcional: **football-data.org v4** (no es ESPN). Consulta encuentros de 21 días mediante una solicitud de fecha inicial y final, en lugar del tope de 1 por liga y 3 por día de TheSportsDB gratuito.
- El plan gratuito admite 12 competiciones, pero solo **11** están homologadas con el historial que posee actualmente N-FORCE. La Champions League no entra hasta disponer de una base de resultados compatible. La cantidad efectiva depende del proveedor, su plan y las fechas.
- Los encuentros con estado `SCHEDULED` o una hora 00:00 UTC se guardan **sin hora confirmada**, útiles para observación, pero nunca como candidatos publicables. Solo `TIMED` con hora UTC válida obtiene la marca de horario conocido. Ningún calendario complementario afirma estado NS verificado en vivo.
- Unifica partidos mediante código de competición, nombres y fecha, mantiene un ID estable del proveedor, conserva las comprobaciones independientes ya realizadas y no inventa goles, cuotas ni probabilidades.
- N-FORCE tiene ahora un interruptor exclusivo de propietario en **Fuentes deportivas**, guardado en MySQL con auditoría. Requiere `FOOTBALL_DATA_ORG_KEY` en Railway y aprobación de las condiciones del proveedor. Se puede desactivar sin borrar partidos existentes.
- El panel muestra cuántos partidos devolvió la API, cuántos son compatibles, cuántos se insertaron o enlazaron, cuántos carecen de hora confirmada, y los fallos de autenticación o cuota.
- **Atribución obligatoria:** cuando esta tercera fuente está habilitada y configurada, la portada muestra la frase de crédito exigida por su contrato. La fuente está apagada por defecto, respetando el diseño original. Si no se desea mostrar fuentes públicamente, no activar este proveedor y usar uno cuyo contrato lo permita.
- No se ha comprado ni activado ningún plan. Es preciso confirmar la habilitación comercial de la cuenta y su licencia antes de operar. Integración cubierta por pruebas con respuestas simuladas; hace falta validarla en Railway con la clave real.
- Conserva fuentes anteriores, MySQL, GOLD, VIP, Telegram, las propuestas existentes y las barreras antes de publicar.

# Fijas de Élite 3.6.3 — Cobertura diaria y diagnóstico del calendario importado

- **Causa diagnosticada:** TheSportsDB v1 gratuito solo devuelve 1 próximo partido por liga en `eventsnextleague.php`; esto no equivale al calendario completo. Los partidos televisados por ESPN no se encuentran todos en las 22 competiciones habilitadas y hay torneos (como Champions femenina) para los cuales el motor aún no posee historial.
- El verificador independiente, cuando está configurado con la clave y plan correspondientes, ahora puede incorporar también partidos futuros de clubes dentro de ligas reconocidas (antes solo incorporaba selecciones si el encuentro no existía localmente). Exige kickoff real y estado NS; no genera propuestas sin historial válido.
- El importador complementario hace 7 consultas adicionales por fecha UTC (`eventsday.php?d=...&s=Soccer`) y conserva las 22 consultas por liga: **29 consultas en total** por importación completa; el plan gratuito limita cada día a 3 eventos, de los cuales solo entran en el análisis las ligas con identificador homologado. Los 7 días son una cobertura adicional, NO una garantía de encontrar todos los partidos.
- Nuevo botón **Importar y analizar al terminar** para evitar que un escaneo inmediato se ejecute antes de haber recibido los nuevos partidos. Respeta los bloqueos y pausas existentes.
- Indicadores detallados: consultas diarias, eventos recibidos, partidos de competiciones sin correspondencia, fechas que alcanzaron la cuota gratis, errores por fecha y por liga. No se inventan horarios ni se eluden filtros para crear propuestas.
- Nuevo panel privado «Ver próximos partidos detectados en MySQL (21 días)» muestra exactamente qué encuentros han entrado al sistema, con fuente, hora y condición de verificación.
- Mantiene fuentes configurables, GOLD, VIP, Telegram, MySQL, propuestas existentes y los bloqueos de publicación.
- Importar datos y después analizar. Comprobar resultados en Railway; el test usa respuestas simuladas, no acredita conexión en producción. El calendario ESPN se utilizó solo como contraste público; no se extraen ni redistribuyen automáticamente sus datos.
- Importante: TheSportsDB documenta límites 1 por liga y 3 por día en el plan gratuito; una fuente autorizada con cobertura más amplia podría ser necesaria para detectar todas las competiciones.

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
