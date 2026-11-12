## v3.8.0 · Comparativa adaptable y anuncios limpios (2026-11-12)

- Comparativa GOLD/VIP reestructurada con mejor alineación, saltos de línea y ancho disponible. En móvil cada beneficio tiene una fila independiente con dos columnas GOLD/VIP; en escritorio conserva tabla de tres columnas. Se comprobó que no aparece scroll horizontal en siete tamaños de pantalla.
- Se retiraron comentarios comerciales repetitivos de la landing y los mensajes Telegram. No se alteran textos de estado técnicos necesarios para evitar publicar partidos sin datos válidos.
- Sin migraciones destructivas ni cambios de comportamiento en Telegram, membresías, pagos o modelos. Las plantillas nuevas afectan solo a mensajes futuros.

## v3.7.9 · Descuentos, GOLD manual y comparativa (2026-11-12)

- Promociones temporales o indefinidas, por porcentaje o importe fijo, con motivo obligatorio, gestionadas solo por el propietario en **Planes y precios**. Precio base intacto; promoción visible en la landing y en las opciones del cliente. Los pagos Yape/Plin y PayPal toman el precio promocional vigente al abrir la solicitud, guardando el importe en el recibo; cambios futuros no afectan pagos creados.
- Asignación manual GOLD/VIP desde **Gestión manual GOLD y VIP**; acumula renovaciones del mismo nivel, conserva auditoría y no crea pagos ficticios. También permite retirar cualquiera de los dos niveles. El cliente GOLD debe vincular y verificar su Telegram para recibir selecciones privadas; VIP incluye GOLD.
- Comparativa pública GOLD vs VIP con canal privado, Radar, listas blancas, envío y límites de servicio, sin promesas de pronósticos diarios ni resultados garantizados.
- Migración MySQL aditiva `plan_discounts`, sin borrar usuarios, historial, cobros ni suscripciones.

# Fijas de Élite v3.7.8 — Mensajería Telegram premium unificada

- Se rediseñaron los anuncios públicos de VIP, GOLD y Radar VIP, los comunicados a la comunidad, los mensajes con pronósticos gratuitos, la entrega privada VIP/GOLD y las notificaciones de membresía.
- En lugar de expresiones como «no son fijas VIP aprobadas», Radar VIP se describe de manera precisa como **análisis anticipado**, diferenciando las **selecciones VIP validadas** sin inducir a error sobre su alcance.
- Los anuncios públicos siguen ocultando selecciones privadas, mercados, cuotas, probabilidades y análisis exclusivos. Se mantienen el escape HTML y los enlaces al sitio público.
- Las aclaraciones sobre incertidumbre permanecen breves y verificables; no se prometen aciertos, ganancias ni contenido exclusivo inexistente.
- No se alteran APIs deportivas, criterios GOLD/VIP, el cálculo del modelo, envíos de Telegram, auditoría, recuperación de mensajes, MySQL ni variables Railway. Los nuevos textos aplican a **mensajes enviados después de desplegar**.

---

# Fijas de Élite v3.7.7 — Recuperación manual de envíos a Telegram mal configurados

- **Reenvío VIP excepcional desde N-FORCE:** un boletín marcado `sent` puede reenviarse al canal VIP correcto *solo* a petición explícita del propietario, tras comprobar que no aparece allí. El mensaje previo sigue registrado, sin borrar su ID ni cambiar el estado de entrega original. La configuración VIP se vuelve a verificar contra Telegram antes de intentarlo.
- **Adelanto oficial independiente:** un anuncio con estado `pending`, `skipped` o `failed` puede recuperarse sin reenviar el boletín VIP. `sent` y `reserved` quedan bloqueados contra duplicados. Un anuncio oficial confirmado no vuelve a publicarse.
- **Persistencia y seguridad:** columnas MySQL aditivas para intentos de reenvío y sus estados, con límite de tres intentos excepcionales confirmados por el propietario, auditoría y reserva atómica protegida por bloqueo distribuido de MySQL. Fallos de red ambiguos no provocan reintentos automáticos. No hace falta borrar ninguna tabla ni añadir claves.
- **Panel:** botones de recuperación separados bajo Radar VIP, con dos confirmaciones para el VIP. Los envíos diarios normales continúan limitados a uno por fecha, salvo autorización excepcional. El envío automático nunca ejecuta estas recuperaciones.
- **Límite:** en boletines de versiones antiguas no se guardó el texto exacto: el reenvío reconstruye el boletín utilizando el historial y calendario que estén disponibles en ese momento. La aceptación de la API de Telegram acredita la entrega al chat configurado en ese intento, no la lectura por los miembros.

---

# Fijas de Élite v3.7.6 — Diagnóstico real de Telegram y separación de canales

- El envío del boletín VIP **no espera ni exige** que el canal oficial esté disponible. Verifica exclusivamente el canal VIP y sus permisos de publicación; impide el envío si coincide con el oficial por ID o @usuario.
- Panel N-FORCE → Radar VIP: **Diagnosticar Telegram (VIP y oficial)** comprueba credenciales, existencia de cada canal y permisos de publicación sin enviar mensajes.
- Botones independientes **Probar canal VIP** y **Probar canal oficial**: requieren confirmación del propietario y envían solo un mensaje de prueba; los errores de Telegram aparecen en el panel.
- Recuperaciones tras fallos: hasta tres intentos de recuperación por día, **solo con comprobación y confirmación explícita del propietario**, sin reenvíos automáticos tras resultados inciertos. Los boletines confirmados nunca se duplican.
- El adelanto oficial sigue dependiendo de que el envío VIP haya sido confirmado. Si falla el oficial, no se reenvía el VIP.
- No cambia MySQL, las claves ni los controles GOLD/VIP. Si Railway falla, los resultados del diagnóstico permitirán identificar la causa sin compartir tokens.

# Fijas de Élite v3.7.5 — Recuperación segura del boletín VIP

- El botón de envío explica si el boletín de **hoy ya se entregó**, si Telegram lo rechazó o si la entrega quedó incierta; ya no presenta un simple bloqueo ambiguo.
- **Reintento controlado:** si Telegram rechaza explícitamente el mensaje (y por tanto no lo aceptó), permite hasta un reintento el mismo día. Para intentos anteriores fallidos con entrega incierta —incluidos los de v3.7.4— el propietario puede confirmar manualmente que el mensaje NO está en el canal VIP y autorizar un único reintento.
- Si Telegram confirmó la entrega pero MySQL falló al registrar el ID, se muestra como entrega exitosa y NO se marca como fallido ni se reenvía automáticamente.
- El adelanto oficial solo se intenta después del envío VIP confirmado; sus errores no afectan la entrega privada.
- Se registra en MySQL el tipo de fallo y el número de recuperaciones, sin eliminar historial, pagos o membresías. No hay nuevas variables.
- La fecha única diaria se calcula en hora de Perú. Sigue existiendo máximo un boletín confirmado al día y se evita la duplicación por reintentos no confirmados.

---

# Fijas de Élite v3.7.4 — Adelanto del boletín Radar VIP en el canal oficial

- Al enviar manualmente o mediante el programador diario un boletín **Radar VIP**, el sistema publica **un único adelanto breve** en el canal oficial, después de confirmar la entrega privada.
- El adelanto revela como máximo el número de partidos estudiados, un encuentro de ejemplo, competición y hora en Perú; **no** revela probabilidades, selecciones, mercados, análisis, calidad ni otros detalles exclusivos.
- El texto identifica expresamente el Radar como **análisis anticipado y no pronóstico VIP validado**. La página de entrada se enlaza mediante `PUBLIC_BASE_URL`.
- Se valida que el destino público sea un **canal** distinto al VIP y que el bot pueda publicar allí. No se utiliza el grupo de discusión como alternativa.
- Cada boletín diario se registra en MySQL con estado de envío privado y estado de adelanto público independientes. El fallo del aviso público **no deshace** el envío VIP ni provoca un reenvío duplicado.
- La migración añade columnas a `nforce_vip_radar_dispatches` automáticamente; conserva pagos, miembros, candidatos y propuestas. No requiere nueva clave ni modificación de MySQL manualmente.
- En el panel del propietario se muestra el resultado del envío al canal oficial. La frecuencia continúa siendo como máximo una al día, y solo si hay partidos elegibles.

---

# Fijas de Élite v3.7.3

Ajuste de importación del calendario próximo y diagnóstico de cobertura para el propietario.

# Fijas de Élite v3.7.3 — Fechas próximas y diagnóstico de IA

- El rango de investigación de la IA y del Radar VIP cambia de 24 h a **2 h** antes del inicio, hasta 30 días. No afecta las reglas de publicación.
- El radar expone **near_term** y **watchlist** para los próximos siete días, con los motivos por los que un partido aún no puede modelarse. No se inventan horarios, resultados o probabilidades.
- Se incluye 2026 entre los años que el importador intenta consultar para la UEFA Nations League; la disponibilidad del archivo queda sujeta al proveedor.
- **Importación desde el panel:** botón en Radar VIP para ejecutar «Importar y analizar al terminar» y luego volver a revisar qué partidos de los próximos siete días tienen datos.
- Mantiene el envío a Telegram únicamente para modelos suficientemente respaldados con hora conocida. Nunca envía la lista de observación ni falsea recomendaciones oficiales.
- Nueva versión de interfaz y aplicación v3.7.3. Conserva `nforce-poisson-1.9` y `nforce-ml-0.1` sin requerir migración de MySQL ni backtest nuevo por versión.

---

# Fijas de Élite v3.7.1 — Cobertura de 30 días y boletín privado Radar VIP

- **Más partidos programados:** escaneo de 7, 14, 21 o 30 días, por defecto 30; la Fuente IV con plan extendido puede consultar el rango completo en una petición. El plan gratuito de API-Football conserva su limitación de fecha; ninguna configuración del código aumenta la cuota del proveedor.
- **Radar VIP anticipado:** analiza partidos que empiezan dentro de **24 horas o más**, hasta 30 días, con historial suficiente. Presenta probabilidades 1/X/2 del modelo estadístico y, si el modelo IA realmente mejoró en un holdout cronológico, muestra también las estimaciones híbridas. No afirma que esos porcentajes sean tasas de acierto.
- **Boletín exclusivo:** el propietario puede previsualizar y enviar un informe al canal VIP. También puede activar desde N-FORCE un boletín automático diario (09:00, hora Perú, después del siguiente control del programador). El programa **no envía si no encuentra encuentros aptos** y no repite boletines de un mismo día. El destino se comprueba frente al canal oficial antes de enviar.
- **Diferencias transparentes:** «Radar VIP · Análisis informativo» nunca se confunde con «Pronóstico VIP validado». Ningún boletín añade registros a `football_candidates`, altera estadísticas, derrota filtros de publicación o garantiza una apuesta rentable. Los pronósticos VIP oficiales siguen pasando las mismas validaciones de mercado, riesgo y horario que en v3.6.9.
- **Histórico, membresías y seguridad:** mantiene el motor `nforce-poisson-1.9`, experimentos IA `nforce-ml-0.1`, GOLD, VIP, whitelist, MySQL y pagos. La migración añade una preferencia `vipradar` desactivada por defecto y una tabla para impedir duplicados diarios en Telegram.
- **Configuración:** despliega la nueva versión, importa datos, ejecuta backtest, busca 30 días, abre Análisis automático → Radar VIP. Si deseas boletines privados automáticos, habilita el interruptor. La disponibilidad de encuentros depende del calendario e histórico reales del servicio desplegado.
- **Límites:** no hay garantía de una selección VIP oficial diaria, y el boletín informativo no sustituye esa selección. Revisa las condiciones de uso de las fuentes antes de operar comercialmente. No se ha comprobado en la base Railway real.

---

# Fijas de Élite v3.7.0 — IA experimental para partidos próximos

- **Predicción adicional con aprendizaje automático real (sin API externa):** clasificador multinomial (regresión logística regularizada) entrenado con resultados históricos importados. Combina como entradas probabilidades Poisson, goles esperados, forma y calidad del historial; nunca consulta resultados futuros para hacer el pronóstico de un partido.
- **Validación cronológica:** el entrenamiento utiliza el 75% más antiguo y comprueba el 25% posterior sin utilizarlo para ajustar inicialmente el modelo. Se calcula Brier 1X2 de Poisson, IA e híbrido (30% IA), separados entre clubes y selecciones. Solo se marca como señal prometedora si el híbrido mejora el Brier del grupo en al menos 0.005, sin afirmar una tasa futura.
- **Muestras mínimas honestas:** 100 partidos modelados de clubes o 60 de selecciones en el backtest de IA. Si faltan datos, el panel señala la insuficiencia y no inventa probabilidades de IA. Una vez comprobado el holdout, el modelo final puede entrenarse con todos los resultados anteriores disponibles para proyectar partidos futuros.
- **Panel de propietario:** sección **Análisis automático → IA experimental · Probabilidades de partidos próximos** con botón para comparar los próximos 21 días, porcentajes 1/X/2 de Poisson, IA e híbrido, marcador meramente orientativo y estado del historial. Sin contraseña adicional, sin coste por API y sin claves nuevas.
- **Prohibido promover de forma automática:** las probabilidades de IA son una herramienta de contraste y estudio; no sustituyen los picks de N-FORCE, no desbloquean VIP/GOLD ni alteran el criterio de backtesting/pagos/publicación. El modelo productivo sigue siendo `nforce-poisson-1.9` y la investigación se registra como `nforce-ml-0.1`.
- **Operación:** desplegar v3.7.0, importar datos históricos, pulsar **Validar modelo (backtest)** para entrenar y guardar los parámetros en el JSON de la validación, luego **Calcular predicciones IA de los próximos 21 días**. Si no hay históricos suficientes, se mostrará la razón. No se borran datos ni cambian membresías, bot, calendario, MySQL o variables de Railway.
- **Límites:** el aprendizaje automático no garantiza una predicción correcta, una cuota favorable ni ingresos. Su uso en publicación requeriría validaciones prospectivas adicionales con resultados de Railway. No se ha conectado a la base de datos o las APIs reales del usuario.

---

# Fijas de Élite v3.6.9 — VIP equilibrado y calendario amplio por API

**Cambios principales**

- **VIP equilibrado:** 16 partidos por equipo (antes 20), 120 por liga (150), 5 por sede (6), muestra efectiva 9 (11), calidad 81/100 (86), actividad reciente de clubes 35 días (28). Las selecciones conservan el margen de inactividad de 180 días.
- **Riesgo/robustez:** ajuste prudente de probabilidad mínima y tolerancia a escenarios, sin forzar la selección de mercados ni inventar probabilidades.
- **Backtesting VIP:** mínimo global y de cohorte de 70 partidos (antes 80); 32 pruebas para el mercado específico (antes 40), rendimiento observado mínimo 68% (antes 70%), Wilson inferior 55%, y requisitos positivos de calibración, diferencia con referencia y Brier. No garantiza 68% en futuros partidos. Clubes y selecciones continúan con validación independiente.
- **Sin mínimos escondidos:** los controles de autopublicación y aprobación manual utilizan las mismas constantes de política; continúa bloqueado un VIP sin validación. Cambia el modelo a `nforce-poisson-1.9`, así que se debe repetir **Validar modelo (backtest)** después del despliegue. Las propuestas antiguas deben reanalizarse antes de publicarse.
- **Fuente IV de cobertura ampliada:** nueva sección en **Panel N-FORCE → Fuentes deportivas**. Cuando se habilita, reutiliza `FOOTBALL_API_KEY` y consulta partidos de hasta **29 competiciones compatibles con el historial**. En plan `free` consulta **solo mañana en UTC**; únicamente `FOOTBALL_SCHEDULE_PLAN=extended`, en una cuenta del proveedor que permita ese rango, consulta **hasta 21 días en una petición**. No desbloquea ligas sin históricos y no equivale a una verificación del estado NS al momento de publicar.
- **Importaciones auditables:** deduplicación contra MySQL, registros por nueva fuente, resultados: recibidos/compatibles/ligas sin correspondencia/nuevos/vinculados. Cupo interno: 6 consultas diarias en free o 4 en extended, separado del verificador de horarios. El switch persiste en MySQL y está desactivado por defecto.
- **Sin borrar MySQL:** migración crea el switch y el contador de consultas. No modifica membresías GOLD/VIP, pagos, lista blanca de Telegram ni contenido publicado.

**Pasos:** 1) despliega la versión, 2) entra en Fuentes deportivas y activa **Calendario amplio · Fuente IV** cuando tengas `FOOTBALL_API_KEY`, 3) opcionalmente configura `FOOTBALL_SCHEDULE_PLAN=extended` si tu plan admite fechas ampliadas, 4) pulsa **Importar y analizar al terminar**, 5) ejecuta **Validar modelo (backtest)**, y 6) revisa el diagnóstico VIP y las propuestas.

**Limitaciones:** no se ha probado contra una clave real, MySQL remoto o Railway. Una nueva fuente no garantiza candidatos suficientes ni un resultado económico. Para ampliar ligas sin historial compatible, primero debe integrarse su historial de forma autorizada. Verifica los derechos de uso comercial de la API que contrates.

---

# Fijas de Élite v3.6.8 — Modelo VIP adaptado a selecciones nacionales

- **Fallo real corregido:** el modelo de fuerza de rivales ignoraba numerosos resultados internacionales que solo incluyen fecha, porque exigía `kickoff`. Ahora utiliza el mismo instante conservador de cierre del día empleado por el modelo base; nunca aprovecha partidos en la fecha/hora posterior al encuentro evaluado. No se inventan horarios de futuros partidos.
- **Forma de selecciones:** conserva los 900 días de antecedentes, pero usa ponderación temporal de 360 días, frente a 165 días en clubes, y un historial internacional de referencia ampliado hasta 900 partidos, frente a 250 en clubes. Los equipos de selecciones no compiten semanalmente; la frescura para modelado sigue limitada a 180 días.
- **Filtro VIP especializado:** para las selecciones se admite como máximo 180 días desde el último partido, acorde con el filtro de actividad existente en su modelo. Los mínimos de partidos, muestra efectiva, calidad 86/100, cobertura local/visitante, ajuste de rivales y robustez de mercados **siguen idénticos**. Los clubes mantienen su ventana VIP de 28 días.
- **Backtest estratificado:** `by_context.club` y `by_context.national`, además del resumen global. Para autorizar VIP de selecciones se requieren al menos 80 partidos retrospectivos modelados del grupo y 40 selecciones retrospectivas del mercado correspondiente, con las mismas exigencias de precisión, calibración y comparación de riesgo que antes. El éxito de clubes no autoriza pronósticos de selecciones y viceversa cuando hay estadísticas segmentadas. Los históricos sin hora solo se usan como resultados pasados.
- **Panel N-FORCE:** diagnóstico VIP y estado de backtest muestran el desglose por clubes y selecciones, para saber si el bloqueo es insuficiencia de muestras o filtros de riesgo.
- **Versión del modelo:** `nforce-poisson-1.8`; cualquier borrador anterior debe reanalizarse, y se debe ejecutar de nuevo **Validar modelo (backtest)**. Se mantienen las comprobaciones de calendario NS, cuotas de Telegram, GOLD/VIP, lista blanca, pagos y MySQL. No se prometen nuevas VIP ni porcentajes de acierto; las pruebas locales no sustituyen la conexión real con Railway.
- **Activación:** desplegar el ZIP, ir a **Fuentes deportivas → Importar y analizar al terminar**, ejecutar **Validar modelo (backtest)** y revisar **Análisis automático → ¿Por qué todavía no aparece ninguna VIP?**. No borrar MySQL.

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
