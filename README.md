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

## Novedad 3.6.5 — Telegram GOLD con lista blanca y anuncio previo

**Cliente GOLD/VIP:** Mi cuenta → Telegram GOLD / VIP → Lista blanca GOLD. Escribe `@usuario`, confirma el enlace de 10 minutos y pulsa **Iniciar** dentro de la conversación privada con el bot. Telegram envía al servidor un identificador seguro de la cuenta y el username actual. Si ambos corresponden con el registro de la web, el bot responde "Autorizada en la lista blanca GOLD". Es imposible enviar el primer mensaje a una cuenta únicamente a partir de su `@usuario`: Telegram exige que el cliente inicie al bot primero.

**Mensajes privados:** solo nuevas publicaciones GOLD, y solo mientras la membresía GOLD o VIP, la cuenta web, la lista blanca y el vínculo de Telegram sigan vigentes. No hay retransmisiones automáticas de publicaciones antiguas. `/stop` cancela envíos hasta una nueva autorización desde la web. VIP mantiene su acceso propio al canal VIP.

**Propietario:** Panel privado → Telegram → Lista blanca GOLD. Se muestran últimos registros autorizados, pendientes, inactivos y desvinculados. No hay autorización manual sin verificación del bot.

**Canal oficial:** al publicar GOLD se envía un adelanto con datos no privados del partido. La selección, probabilidades, análisis y cuotas no se revelan. Para propuestas creadas manualmente se omiten los títulos por seguridad. No se publica la fija completa en el canal oficial.

**Variables existentes necesarias:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_BASE_URL` (HTTPS). El webhook se activa desde Panel → Telegram. `TELEGRAM_VIP_CHAT_ID` solo es requerido para gestionar el canal VIP. El bot debe ser administrador con permiso de publicar en el canal oficial si se desean adelantos. La base de datos crea la tabla adicional automáticamente al iniciar el servidor con credenciales MySQL.

# Versión 3.6.4 — Tercera fuente deportiva configurable

En Railway configura una clave válida `FOOTBALL_DATA_ORG_KEY` obtenida de https://www.football-data.org/ (no la agregues al repositorio). En el panel del propietario, abre **Fuentes deportivas**, activa **Calendario ampliado · Fuente III** y ejecuta **Importar y analizar al terminar**. El panel identifica los encuentros nuevos y los que carecen de horario.

El servicio requiere una atribución visible cuando se activa, por contrato: https://www.football-data.org/about. La portada añade esa atribución solo al activarse. Si deseas ocultar todas las referencias a fuentes externas al público, **deja este interruptor desactivado** y usa una alternativa cuyo contrato lo permita; API-Football (ya soportada en verificación) ofrece más cobertura al contar con el plan y la clave necesarios. La búsqueda adicional no es una integración de ESPN y no garantiza propuestas GOLD/VIP: el histórico, los filtros y las comprobaciones vigentes de horarios siguen siendo obligatorios.

---

# Versión 3.6.3 — Detección deportiva por fecha y liga

Para ampliar el calendario de Fijas de Élite, ve a **Fuentes deportivas** y activa **Calendario complementario**. Al pulsar **Importar datos ahora**, el sistema consulta también siete días por fecha y las 22 ligas/torneos conocidos. El servicio gratuito de TheSportsDB limita la respuesta a 3 eventos por día y 1 por liga; no equivale a copiar el calendario total de ESPN.

En **Ver próximos partidos detectados en MySQL (21 días)** puedes comprobar los equipos importados, si tienen horario y si el estado está verificado. Después ejecuta **Analizar ahora**: un partido descubierto sin suficientes resultados históricos o sin superar los filtros no producirá un pronóstico.

Si ya utilizas el verificador independiente con `FOOTBALL_SCHEDULE_LIVE=true` y `FOOTBALL_API_KEY` válida, ahora también detecta partidos de clubes en ligas admitidas, además de selecciones, dentro de la ventana temporal de tu plan. Las fuentes de descubrimiento no sustituyen la comprobación de estado NS antes de publicar. No se añaden automáticamente ligas femeninas, menores o torneos sin histórico compatible.

No se ejecutan migraciones destructivas. Ver VERSION.md para detalles y límites.

---

## Control de APIs desde el panel (v3.6.2)

En **Panel de administración → Fuentes deportivas** (solo propietario) puedes activar o desactivar la búsqueda complementaria, consultar el estado del verificador y solicitar una importación. Los cambios quedan guardados en MySQL y sobreviven reinicios/despliegues de Railway. Para conocer si aporta nuevos partidos, revisa las métricas de **Análisis automático** después de importar. La antigua variable `FOOTBALL_SECONDARY_SCHEDULE` solo determina el estado inicial una vez creada la tabla; no sobreescribe una preferencia guardada en MySQL.

La clave del verificador independiente, si se utiliza, se mantiene en Railway y nunca aparece en el navegador. El calendario complementario es para descubrir encuentros, no para confirmar que un partido aún no ha comenzado. No se eliminan encuentros previos al desactivar su búsqueda.

## v3.6.1 · API complementaria de detección de partidos (opcional)

El escaneo ahora puede **descubrir más encuentros reales** de clubes y selecciones desde TheSportsDB v1 además de los archivos históricos habituales y la comprobación independiente que ya utilizaba el proyecto. El endpoint público permite una clave compartida `123`, sin registrarse. No lo confundas con un feed minuto a minuto: la fuente adicional **solo permite descubrir calendario**, no garantiza que un partido siga sin iniciarse. Los filtros GOLD/VIP, la revisión manual y los controles de publicación permanecen intactos.

**Activación en Railway:** añadir `FOOTBALL_SECONDARY_SCHEDULE=true` a las variables del servicio y redesplegar. `FOOTBALL_SECONDARY_API_KEY` se puede dejar vacío para usar `123`. En el panel N-FORCE, pulsar **Importar datos deportivos**, esperar a que termine, y usar **Analizar ahora** con 21 días. Revisa las filas **Calendario complementario**, **Partidos exclusivos de la fuente adicional**, **Último rastreo complementario** y **Errores del calendario complementario** para identificar si la segunda fuente realmente detectó encuentros. Si no aporta partidos, puede deberse a la cobertura o límites del plan gratuito y no a un fallo del modelo.

La cuota documentada es de 30 solicitudes/minuto; la modalidad gratuita devuelve como máximo unos 20 próximos encuentros por liga según endpoint y puede devolver menos. Se realizan hasta 22 consultas cuando se completa la importación; un escaneo ordinario no consulta esta API. La app reconcilia equipos y horarios para evitar duplicados. Los eventos sin hora UTC comprobable, cancelados o ya iniciados no se aceptan. No se importan resultados desde esta fuente para fabricar estadísticas ni se confunde una fecha programada con una verificación independiente de estado.

Antes de usar datos de este servicio en un producto monetizado, confirmar con el proveedor sus condiciones de uso comercial y atribución. En entornos sin acceso de red, las pruebas automáticas solo validan la integración con respuestas simuladas: confirmar consultas reales desde el entorno Railway.

---

## Actualización v3.6.0 (diagnóstico de escaneos)

El motor revisa por defecto los próximos **21 días**. Si Railway tiene `NFORCE_SCAN_DAYS=14`, ese valor previo se mantiene hasta que lo cambies a `21` o elimines la variable. Después de importar datos, selecciona **21 días** y ejecuta **Analizar ahora** y consulta **Diagnóstico del escaneo**, **Competición** y **En observación**. Estos últimos partidos *no* son propuestas aprobables. La función no rebaja los filtros GOLD/VIP ni inventa horarios de selecciones nacionales. Un resultado de cero propuestas sigue siendo posible cuando no hay datos suficientes.

## Selecciones nacionales (v3.5.9)

N-FORCE mantiene las 20 ligas de clubes y añade 11 categorías de torneos de selecciones: Mundial, Eurocopa, eliminatorias mundialistas, amistosos, Nations League, Copa América y competiciones de confederaciones. En el panel del dueño, `Análisis automático` ahora muestra los torneos y registros importados.

Usa **Importar datos** para recuperar resultados recientes y calendarios públicos. Los archivos históricos de selecciones sin hora no permiten programar ni publicar una propuesta por sí solos; el escaneo necesita una hora real. Con `FOOTBALL_SCHEDULE_LIVE=true` y `FOOTBALL_API_KEY` configurados, el verificador existente puede identificar encuentros próximos en torneos nacionales explícitamente admitidos, respetando la ventana de fechas y cuota del plan. Publicar sigue requiriendo revisión de horarios, estado NS y los controles de calidad del modelo. Una selección no recibe pronóstico si su muestra histórica es insuficiente.

Datos CC0: `openfootball/worldcup.json`, `openfootball/euro.json`, catálogo internacional `openfootball.github.io/internationals`. Integración futura o de países concretos depende de la disponibilidad real de registros: no se prometen todos los amistosos del calendario.

## v3.5.8 — Comprobación del horario por propuesta

Cuando el panel indique **Falta una comprobación reciente**, pulsa **Verificar horario y estado del partido** en esa propuesta. Esta acción consulta la fecha admisible y devuelve una respuesta real de verificación, sin generar otro borrador ni publicar. Si cambia el horario, utiliza **Reanalizar esta propuesta** antes de aprobarla.

La verificación independiente requiere `FOOTBALL_SCHEDULE_LIVE=true` y `FOOTBALL_API_KEY` en Railway. El plan `free` admite ayer, hoy y mañana UTC; el plan `extended`, hoy y los tres días siguientes. Para propuestas fuera de esa cobertura o ligas sin soporte, la publicación sigue requiriendo una importación local reciente (máximo 36 horas), sin atribuirle un estado en vivo. Si el encuentro ya comenzó o no puede verificarse, se bloquea.

# Fijas de Élite v3.5.7 — Reanálisis de propuestas antiguas y verificación de calendario

## Corrección de la aprobación de borradores antiguos

- Ya no se exige **crear una propuesta nueva** por el solo hecho de que el calendario local sea antiguo: el dueño puede importar resultados y pulsar **Reanalizar esta propuesta**, conservando el mismo registro e ID hasta su revisión.
- Si está habilitada la verificación independiente del calendario y existe una comprobación reciente del partido **no iniciado (NS)** y horario sin cambios, se admite esa verificación aunque la fecha de la importación comunitaria tenga más de 36 horas. Si no hay verificación independiente disponible, continúa exigiéndose una importación local reciente.
- **Aprobar y publicar** se inhabilita en el panel si se detecta calendario realmente desactualizado, horario modificado, estado inválido o falta de verificación obligatoria; se muestra un motivo concreto y, cuando corresponde, un botón **Actualizar datos deportivos**.
- Se mantienen los bloqueos de encuentros ya iniciados o finalizados, versiones de modelo incompatibles, borradores GRATIS pendientes de conversión GOLD, publicaciones duplicadas y controles VIP.
- Flujo recomendado tras desplegar: **Análisis automático → Actualizar datos deportivos** (si lo pide) → **Reanalizar esta propuesta** → revisar la nueva selección → **Aprobar y publicar**. Si el calendario no puede verificarse o el encuentro ya comenzó, seguirá bloqueada.
- No requiere migración SQL ni elimina propuestas, membresías ni historial. Las pruebas locales usan datos simulados y no sustituyen la verificación de tu base de datos y canales desplegados.

---

# Fijas de Élite v3.5.6 — Recuperación de descartes incompatibles (panel dueño)

Algunas propuestas descartadas tras mensajes de incompatibilidad se guardaban como `manual` o sin motivo verificable y por eso la recuperación automática 3.5.5 no las reabría. Esta versión añade en el panel **Análisis automático → Recuperar propuestas descartadas por incompatibilidad**.

Pulsa **Consultar descartadas** y luego **Reanalizar y pasar a Pendientes** sobre el partido elegido. El servidor valida permisos, fecha futura, ventana de escaneo, estado de partido, ausencia de publicación previa y calidad de predicción del modelo vigente; si pasa las comprobaciones cambia la propuesta a borrador GOLD/VIP y registra la auditoría. **Nunca publica por sí misma**. Si no pasa, muestra el motivo sin alterar el descarte.

El listado se limita a los últimos 150 descartes de N-FORCE. Si las fechas ya pasaron o falta historial suficiente, no es posible recuperarlos sin inventar una selección. Las decisiones manuales antiguas solo se reabren si el dueño selecciona el registro y lo confirma explícitamente. No se requieren nuevas variables de entorno ni migraciones destructivas.

# Fijas de Élite v3.5.4 — Publicidad GOLD en canal oficial

A partir de esta versión, cuando se **publica un pronóstico GOLD nuevo**, el sistema guarda la publicación y realiza dos operaciones independientes:

1. Encola el contenido GOLD completo **solo** para suscriptores GOLD y VIP con Telegram vinculado y membresía activa. Nunca se envía contenido GOLD completo al canal ni al grupo.
2. Envía **un aviso promocional corto** al canal oficial de Telegram (el configurado mediante `TELEGRAM_FREE_CHANNEL_CHAT_ID` y `TELEGRAM_FREE_CHANNEL_URL`). El aviso no revela el encuentro, selección, cuota, análisis ni porcentaje estimado. Incluye el enlace de portada obtenido desde `PUBLIC_BASE_URL`.

**El grupo comunitario no recibe avisos GOLD**. Los adelantos y avisos VIP mantienen su comportamiento anterior. Las fijas GOLD publicadas en versiones anteriores no se anuncian otra vez: no hay reenvío retroactivo.

La tabla MySQL `telegram_gold_public_announcements` se crea al iniciar. Su clave por `prediction_id` evita avisos repetidos tras reinicios de Railway. Si Telegram devuelve un error después de reservar el envío, el registro queda para revisión manual y **no se reintenta automáticamente**, para evitar spam por respuestas ambiguas. Si el propietario retira el pronóstico, el sistema intenta borrar el anuncio registrado, según las limitaciones de la API de Telegram.

**Configuración:** conserva el token del bot, el canal oficial y el dominio público. Para que el botón lleve a tu nuevo dominio cuando ya esté activo, usa `PUBLIC_BASE_URL=https://fijasdeelite.xyz`. No hay variables nuevas. Tras desplegar, comprueba `/health` v3.5.4, verifica permisos del bot en el canal y prueba publicando una fija GOLD nueva. Los pagos, planes y migraciones anteriores permanecen intactos.

---

# Fijas de Élite v3.4.1 — Reabrir descartadas de versiones anteriores

Al ejecutar **Analizar ahora**, una propuesta N-FORCE descartada con un modelo estadístico o versión de la aplicación anterior puede volver a aparecer como **borrador** si el motor actual la selecciona de nuevo, el encuentro sigue siendo futuro y su ID no está ligado a una publicación. Nunca se recuperan descartes hechos en esta misma versión de la aplicación, pronósticos publicados o registros sin una versión anterior verificable. Los descartes antiguos sin sello de versión pueden recuperarse una vez; los nuevos quedan identificados por versión. Se guarda auditoría del cambio con las versiones previas/nuevas.

El panel informa cuántos descartes antiguos se recuperaron. La reaparición no publica nada automáticamente: requiere revisión y aprobación con las mismas verificaciones de calendario y backtesting. Los filtros VIP no cambian; no hay pronósticos seguros ni garantía de VIP. Sin cambios de esquema ni de variables de Railway.

# Fijas de Élite v3.4.0 — Selección multimerkado GRATIS y diagnóstico VIP

Esta versión **no fuerza fijas sin calendario confirmado**: añade análisis visible para detectar por qué N-FORCE no encuentra propuestas incluso con 14 días.

- Desglosa encuentros futuros con fecha pero sin hora, horarios utilizables, horarios descartados por estado del encuentro y partidos futuros con hora fuera del rango.
- Muestra qué ligas tienen encuentros próximos, así como el próximo partido con hora **importada**.
- Expone la diferencia entre las 20 ligas configuradas y las 5 ligas mapeadas para verificación adicional de horarios. Una liga sin esa verificación aún puede analizarse si la fuente original incluye una hora utilizable.
- El diagnóstico se recalcula al abrir el panel, incluso tras reiniciar Railway; no depende de que el último escaneo siga en memoria.
- No altera MySQL, pronósticos publicados, pagos, usuarios, Telegram, permisos ni criterios VIP. No cambia la ventana existente configurada mediante NFORCE_SCAN_DAYS.

Para revisar el diagnóstico de mercados GRATIS/VIP: ejecuta Importar datos → Validar modelo → Analizar ahora. Los borradores anteriores se actualizan, sin alterar los pronósticos publicados. Para investigar un cero de propuestas: despliega, comprueba `/health` = `3.4.0`, ejecuta **Importar datos** y luego **Analizar ahora**. En el panel, revisa **Calendario: diagnóstico**, **Fechas dentro del rango sin hora utilizable**, **Horarios utilizables dentro del rango**, **Ligas cargadas** y **Ligas con verificación independiente**.

La fuente abierta puede retrasarse en comunicar horarios; no es un sistema de datos en vivo garantizados.

---

# Fijas de Élite v3.3.8 — Corrección de ventana y diagnóstico de cobertura

- **Corrección:** el motor ahora busca partidos de los próximos **14 días por defecto** (antes 3); `NFORCE_SCAN_DAYS` sigue aceptando entre 3 y 21 días. No cambia los umbrales de probabilidad ni permite publicación automática.
- **Diagnóstico persistente:** el panel muestra cuántas de las 20 ligas configuradas tienen partidos almacenados en MySQL, incluso después de reiniciar Railway. Además, distingue la cobertura de la última importación.
- **Importante:** agregar una liga a la configuración no es suficiente. Es necesario ejecutar **Importar datos**, esperar a que la importación termine, y después **Analizar ahora**. El botón Analizar no descarga archivos nuevos.
- **Advertencia:** algunos calendarios tienen horarios pendientes o datos incompletos; el motor no inventa encuentros ni marcadores. Las propuestas para partidos lejanos deben volver a comprobarse antes de publicarse.
- Despliega esta versión, confirma `/health` v3.3.8, comprueba **Ventana de búsqueda: 14 días** y **Ligas cargadas en MySQL**. Si Railway conserva `NFORCE_SCAN_DAYS=3` como variable, cámbiala a 14 o elimínala para usar el nuevo valor por defecto.

---

# Fijas de Élite v3.3.7 — Cobertura multiliga

- N-FORCE permite **20 ligas** configuradas, frente a cinco antes: Premier League, Championship, League One, League Two, LaLiga, Segunda División, Bundesliga, 2. Bundesliga, Serie A, Serie B, Ligue 1, Ligue 2, Eredivisie, Primeira Liga, Premiership escocesa, primera de Bélgica, Bundesliga de Austria, Süper Lig, Super League de Grecia y Brasileirão Série A. **Configuradas no significa que todas tengan resultados y horarios disponibles para la temporada actual.** El importador omite archivos inexistentes, informa ausencias y no inventa partidos.
- Temporadas de Brasil adaptadas al año natural (2025, 2026), y horarios convertidos correctamente a UTC incluso fuera de Europa y en cambios de horario de verano.
- Descargas por lotes pequeños para impedir bloqueos prolongados por archivos inexistentes. Informe de cantidad de ligas importadas y temporadas sin datos en el administrador.
- Consulta histórica de hasta 20.000 encuentros recientes (antes 6.500), ordenados para evitar descartar accidentalmente datos del calendario actual al añadir más competiciones.
- El análisis continúa en **72 horas de forma predeterminada**. Si lo deseas, configura `NFORCE_SCAN_DAYS=14` en Railway (admite enteros de 3 a 21) para preparar borradores más anticipados. Esos pronósticos deben volver a comprobarse al acercarse el inicio; el dato de calendario no equivale a verificación reciente. No se habilita la publicación automática ni se disminuyen filtros de calidad o VIP.
- No se requieren migraciones de MySQL. Se conservan sesiones, historial, pagos, suscripciones y Telegram.
- Pasos: desplegar, verificar `/health` versión 3.3.7, pulsar **Importar datos** y esperar a que termine (la cobertura ampliada puede tardar más), **Validar modelo** y **Analizar ahora**. Consultar el diagnóstico para saber cuántas ligas y encuentros realmente se importaron.
- El código se ha probado localmente con datos simulados; **no se han comprobado la disponibilidad en Railway ni el historial o acierto reales**. Una mayor cantidad de ligas no garantiza más fijas ni mejores resultados.

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

# Fijas de Élite v3.3.4 — Corrección del rango de horarios

## v3.3.4 — Horarios compatibles con plan gratuito (2026-11-08)

- **Solucionado el error de fecha de API-Football Free**: `FOOTBALL_SCHEDULE_PLAN=free` (predeterminado) consulta solo ayer, hoy y mañana **en UTC**. Ya no intenta verificar días +2/+3 que el plan no permite.
- El motor N-FORCE **sigue analizando partidos de 1 a 72 horas**; el límite de sincronización no reduce la ventana predictiva. Horarios de partidos fuera de cobertura siguen claramente identificados como **no verificados en vivo**.
- Si el servicio comunica otro rango permitido, el sincronizador lo detecta y evita repetir peticiones fuera de él durante ese día. Evita avisos repetidos en los logs y reduce consumo innecesario de cuota.
- En `Panel → Análisis automático → Estado del calendario` la API informa `schedule_plan` y `allowed_dates_utc`. Se limpia un error transitorio anterior después de una comprobación satisfactoria.
- Si más adelante contratas un plan que permita más días, establece `FOOTBALL_SCHEDULE_PLAN=extended` para volver a verificar hoy y los próximos 3 días. No hace falta cambiar otras claves.
- No modifica MySQL, Telegram, resultados, membresías ni filtros VIP.

## v3.3.3 — El panel muestra su versión y el horario de todos los pronósticos publicados

En **Panel → Pronósticos → Últimos pronósticos**, la etiqueta `Panel JS v3.3.3` permite detectar caché antigua. La consulta `/health` debe responder `3.3.3`. La API entrega `match_kickoff_utc` explícitamente; se muestra en la zona `America/Lima`. Si no se confirma con datos deportivos recientes, se identifica como horario programado no verificado; no se inventa una cuenta regresiva.

## v3.3.2 — Horarios deportivos contrastados y sincronizados (opcional)

La web, el panel administrativo y el área de clientes comparten horarios en **hora de Perú (America/Lima)**. Se consulta el endpoint `/api/schedules/live` periódicamente; éste consulta exclusivamente datos ya verificables en MySQL (NO hace una petición externa por cada visitante). Los partidos que todavía no han sido verificados muestran **Horario sin confirmación reciente** y no presentan una cuenta regresiva engañosa. Las horas manuales se introducen en Perú y se guardan en UTC.

Para activar la comprobación de horarios sin cambiar de motor estadístico, agrega en Railway:

```env
FOOTBALL_ENGINE_MODE=own
FOOTBALL_SCHEDULE_LIVE=true
FOOTBALL_API_KEY=TU_CLAVE_EXISTENTE
FOOTBALL_SCHEDULE_MAX_CALLS=70
```

El servidor consulta un feed deportivo ya compatible con el proyecto y comprueba coincidencias unívocas de equipos y liga. No se inventan eventos para compensar diferencias de nombres; ante datos ambiguos o ausentes, se indica no verificado. La consulta al proveedor se limita por presupuesto diario y una planificación de 30 minutos para hoy, más espaciada en días futuros (no es minuto a minuto). Verifica **Panel → Análisis automático → Estado del calendario** para el estado y la fecha de última comprobación. Sin clave, los pronósticos y la web siguen funcionando, pero **no existe sincronización real de horarios**. Las publicaciones antiguas en Telegram no se editan retroactivamente.

---

## Versión 3.3.0 — N-FORCE con ajustes por rival (modelo 1.4)

El pronóstico ahora incluye un componente regularizado de fuerza ofensiva/defensiva **ajustada por los rivales** y por la antigüedad de los resultados, conservando el anclaje Poisson anterior. La probabilidad no se incrementa de forma artificial. El rango de publicación GRATIS pasa a 40%–menos de 68% (con margen/calidad mínimos), sin modificar el estándar VIP. El backtest permite comparar el Brier del motor anterior y nuevo con las mismas fechas y resultados; una comparación favorable necesita validarse con muestras históricas suficientes y datos no utilizados al entrenar.

Se corrigió el tratamiento conservador de los resultados cuya hora se desconoce para prevenir filtración temporal. No se importan lesiones, alineaciones o cuotas inexistentes. Mantiene 72 horas, Telegram, panel, pagos, sesiones y MySQL. Una propuesta antigua necesita reanalizarse tras actualizar el modelo a 1.4. Despliega, comprueba `/health` (v3.3.0), luego **Importar datos → Validar modelo → Analizar ahora**. Si tienes propuestas pendientes antiguas usa **Reanalizar esta propuesta**. El cambio está probado localmente, no constituye validación de precisión con tus partidos reales.

---

## Versión 3.2.9.4 — Propuestas dentro de las próximas 72 horas

Se volvió a limitar el análisis de N-FORCE a **3 días (72 horas)**, para priorizar partidos cercanos. El sistema examina únicamente partidos con hora conocida que comiencen entre **1 y 72 horas** desde cada escaneo. Se conserva la capacidad de hasta 240 partidos dentro de esa ventana y el diagnóstico de duplicados/rechazos de la versión previa.

Los intervalos actuales de importación y análisis permanecen intactos; el usuario debe tener `FOOTBALL_AUTO_IMPORT=true` y `FOOTBALL_AUTO_SCAN=true` para la operación automática. La cercanía del partido no garantiza que estén disponibles lesiones, alineaciones o noticias recientes; N-FORCE sigue utilizando los datos deportivos que efectivamente haya importado.

Para desplegar: actualizar el proyecto, confirmar `/health` con `3.2.9.4`, luego en el panel pulsar **Importar datos** y **Analizar ahora**. Las fijas descartadas o publicadas siguen sin regenerarse, y el sistema mantiene las restricciones de aprobación. No hay migraciones de MySQL ni nuevas variables obligatorias.

---

## Historial: versión 3.2.9.3 — Ventana de 14 días (revertida en 3.2.9.4)

El escaneo ahora examina partidos con hora conocida hasta 14 días adelante. Esto evita quedarse sin nuevas propuestas cuando hay pausas de competición. No elimina el límite estadístico: es posible obtener cero propuestas si los partidos ya están registrados, carecen de historial o no superan los filtros.

Tras actualizar, en el panel pulsa **Importar datos**, espera a que termine, luego **Analizar ahora**. El diagnóstico separa propuestas pendientes, descartadas y publicadas. No hay cambios de MySQL ni nuevas variables obligatorias. La publicación requiere aprobación manual, tal como antes.

## Fijas de Élite v3.2.9.2 — Propuestas pendientes limpias

- Al pulsar **Descartar** en el panel, una propuesta automática desaparece inmediatamente de la lista al confirmar el servidor el cambio.
- Los dos motores (N-FORCE y clásico) ahora consultan **solo propuestas en estado `draft`** en sus listas de pendientes. Las descartadas y publicadas no consumen lugares en los primeros 40/30 registros.
- El registro descartado **no se borra de MySQL**: queda con estado `discarded` y auditoría, para evitar que el escaneo vuelva a proponer el mismo partido repetidamente.
- Descartar no ejecuta una búsqueda automática nueva ni cambia filtros de calidad. Para generar nuevas, usa **Analizar ahora** o espera al escaneo programado.
- Incluye la reparación v3.2.9.1: las propuestas gratuitas de un modelo anterior pueden actualizarse mediante **Reanalizar esta propuesta** antes de aprobarlas.
- Sin migraciones de MySQL, nuevas variables de entorno ni alteraciones a Telegram, VIP o pagos.

---

## Corrección v3.2.9.1: aprobación de fijas GRATIS

Si una propuesta quedó en borrador con el modelo antiguo `nforce-poisson-1.2`, la v3.2.9 la bloquea porque ahora utiliza `nforce-poisson-1.3`. En el panel de análisis, pulsa **Reanalizar esta propuesta**, revisa la selección actualizada y entonces pulsa **Aprobar y publicar**. No se exige validación VIP a una propuesta gratis. Si no se puede actualizar, el panel indica el motivo (inicio próximo, calendario sin actualizar o filtros actuales no superados).

La publicación no se ejecuta durante la actualización: requiere un segundo paso explícito de aprobación. No se publican partidos ya comenzados ni se eliminan pronósticos anteriores.

# Fijas de Élite v3.2.9 — Filtro VIP con validación histórica

Esta versión completa conserva la web, el canal oficial, la comunidad, Telegram VIP, acceso unificado, pagos y base de datos de v3.2.8.2.

## Cambio central

Una propuesta del motor N-FORCE se etiqueta como candidata VIP si supera los filtros de pronóstico, pero **NO se puede aprobar ni publicar** hasta superar los filtros de validación del mercado. Afecta tanto a aprobación manual como automática; nunca inventa aciertos, cuotas ni resultados.

- Filtros de generación VIP más selectivos: muestra >=16 partidos por equipo, >=110 de liga, calidad >=78/100; mayores probabilidades mínimas y ventaja estadística frente a la frecuencia de la liga.
- Requiere backtesting cronológico de la versión actual (modelo `nforce-poisson-1.3`), ejecutado hace menos de 8 días, con >=80 encuentros evaluados y >=40 selecciones retrospectivas de **ese mercado**.
- Requiere >=70% de aciertos observados por mercado (solo en el backtest), límite inferior de Wilson >=58%, diferencia entre la media estimada y la observada <=12 puntos, al menos +5 puntos de acierto sobre la frecuencia histórica del mismo mercado, y reducción de error Brier >=0.01 frente a esa referencia.
- Cuando existen >=40 selecciones retrospectivas GRATIS y VIP, exige además que el conjunto VIP supere en >=5 puntos la tasa observada del conjunto GRATIS. Sin muestras suficientes no se hacen comparaciones concluyentes.
- Si falla la evaluación, la VIP queda **pendiente sin botón de publicación habilitado** y el panel indica el motivo. No se elimina la propuesta ni se modifica la historia publicada.
- La generación GRATUITA y las publicaciones anteriores no se alteran. El dueño conserva la aprobación manual. Publicaciones VIP de otros flujos administrativos no se reclasifican retroactivamente.
- Un backtest aprobado **no prueba** que futuras VIP vayan a ganar más que las GRATIS, ni demuestra rentabilidad. El modelo no cuenta con cuotas verificadas ni datos confirmados de lesiones o alineaciones. Puede ser normal que por periodos **no haya ninguna VIP**.

## Despliegue

1. Actualiza GitHub/Railway con este ZIP sin borrar MySQL; no requiere nuevas variables.
2. Comprueba `GET /health` y la versión `3.2.9`.
3. En Panel → Análisis automático: **Importar datos → Validar modelo → Analizar ahora**. Esto recalcula borradores del motor previo (no modifica los publicados).
4. Si una VIP aparece bloqueada, consulta el motivo en su ficha. No bajes umbrales para forzar pronósticos. Actualiza backtesting según cambien los resultados.
5. Conserva `FOOTBALL_AUTO_PUBLISH=false` si deseas aprobación manual y tus variables Telegram existentes.

Las pruebas incluidas funcionan con datos simulados y verifican selección, validación, controles de publicación y retrocompatibilidad. No validan Railway ni demuestran precisión predictiva en producción.

---

# Fijas de Élite v3.2.8.2 — Avisos breves en comunidad

**Publicaciones principales sin cambios:** la fija GRATIS completa va solamente al canal oficial `@FijasDeEliteOficial`; la fija VIP completa va solamente al canal VIP. El canal GRATIS mantiene sus adelantos VIP actuales. **El grupo de comunidad ahora recibe únicamente avisos cortos con enlaces, nunca la selección o el análisis.**

- **GRATIS en el grupo:** «⚽ ¡Se publicó una nueva fija GRATIS! 📢 Revísala en nuestro canal oficial: https://t.me/FijasDeEliteOficial».
- **VIP en el grupo:** «👑 ¡Se publicó una nueva fija VIP! 🔒 Accede desde nuestra web: https://tu-dominio/».
- Ambos incluyen una nota breve sobre riesgos, sin odds, mercados ni pronósticos exclusivos.
- **Solo después del envío principal exitoso:** si Telegram no publica en el canal correspondiente, no se anuncia en el grupo. Si falla el aviso al grupo, la publicación principal no se marca como fallida.
- `TELEGRAM_FREE_CHAT_ID` identifica el **grupo** y es distinto de `TELEGRAM_FREE_CHANNEL_CHAT_ID` (canal). El bot necesita permiso para **enviar mensajes en el grupo**. Mantén `TELEGRAM_FREE_CHANNEL_URL` y `PUBLIC_BASE_URL` con tus URLs reales.
- Se agrega la tabla MySQL `telegram_community_announcements` automáticamente al iniciar, para evitar duplicados y permitir borrar los avisos al retirar una predicción. No se eliminan datos anteriores. No reenvía publicaciones históricas.
- Comprueba en Railway `GET /health` → `version: 3.2.8.2`. Las pruebas locales no sustituyen una prueba real de Telegram.

> Los apartados siguientes conservan el historial de versiones anteriores. Para desplegar y configurar el sistema utiliza las indicaciones de **v3.2.8.2** arriba.

# Fijas de Élite v3.2.8.1 — Telegram SOLO canal oficial

**Corrección importante de v3.2.8:** Se eliminó el envío alternativo de fijas GRATIS y adelantos VIP al grupo de discusión. Los mensajes públicos automáticos van **exclusivamente al canal GRATIS**, o no se envían. El VIP completo permanece únicamente en el canal privado VIP.

Configura en **Railway → Variables** (el usuario público es válido como `chat_id`):

```env
TELEGRAM_BOT_TOKEN=TOKEN_EXISTENTE_DEL_BOT
TELEGRAM_FREE_CHANNEL_CHAT_ID=@FijasDeEliteOficial
TELEGRAM_FREE_CHANNEL_URL=https://t.me/FijasDeEliteOficial
# El grupo es opcional y solo se enlaza desde la web; el bot NO publica ahí:
TELEGRAM_FREE_CHAT_ID=
TELEGRAM_FREE_GROUP_URL=
```

- La URL pública del canal tiene prioridad al resolver el destinatario. Evita errores por IDs numéricos mal copiados. Si el canal es privado, configura su ID numérico `-100...` (y usa una URL de invitación para el botón de la web si aplica).
- El bot debe ser administrador del **canal oficial** con permiso **Publicar mensajes**. No sirve ser administrador únicamente del grupo.
- Tras desplegar, entra a **Panel → Telegram → Verificar canal y permisos**. La comprobación consulta a Telegram si es un canal real y si el bot puede publicar. Después usa **Enviar mensaje de prueba al canal**. Solo entonces aprueba una fija nueva.
- Si Telegram devuelve «chat not found», revisa el nombre público exacto y que el bot esté en el canal; «Forbidden» normalmente indica falta de permisos. En el panel se mostrará el error, sin divulgar el token.
- **Las fijas ya publicadas no se reenvían automáticamente**. Esto evita anuncios repetidos o resultados antiguos presentados como nuevos. Los mensajes históricos enviados al grupo se mantienen allí hasta que los borres manualmente.
- No requiere cambios en MySQL ni nuevos servicios. `GET /health` muestra `3.2.8.1`. Pruebas automatizadas sin credenciales reales; la entrega efectiva se comprueba con el botón de prueba.

---

# Fijas de Élite v3.2.8 — Canal GRATIS principal + Grupo GRATIS extra

El canal GRATIS de Telegram recibe las fijas completas y los adelantos públicos de VIP. El grupo GRATIS original sigue disponible como comunidad secundaria para conversar y compartir el enlace al canal; **no se duplican** las selecciones por defecto. El canal VIP privado conserva su flujo actual de suscripción.

Variables de Railway:

```env
TELEGRAM_FREE_CHANNEL_CHAT_ID=-100ID_REAL_DEL_NUEVO_CANAL
TELEGRAM_FREE_CHANNEL_URL=https://t.me/TU_CANAL_GRATIS
TELEGRAM_FREE_CHAT_ID=-100ID_DEL_GRUPO_GRATIS_EXISTENTE
TELEGRAM_FREE_GROUP_URL=https://t.me/TU_GRUPO_GRATIS
TELEGRAM_VIP_CHAT_ID=-100ID_DEL_CANAL_VIP_ACTUAL
```

1. Crea el canal GRATIS en Telegram, con un nombre como «Fijas de Élite | GRATIS», y pon el bot como administrador con permiso **Publicar mensajes**.
2. Obtén el ID numérico real del canal (normalmente empieza con `-100`). No inventes ese ID ni coloques el username en `CHAT_ID`.
3. Configura `TELEGRAM_FREE_CHANNEL_CHAT_ID` y `TELEGRAM_FREE_CHANNEL_URL` en Railway. Mantén las dos variables del grupo GRATUITO, sin cambiarlas.
4. Despliega y comprueba el panel «Telegram» y la portada. Publica una propuesta de prueba aprobada. El mensaje completo GRATIS debe llegar al **canal**, no al grupo; la web muestra enlaces a ambos.
5. Las publicaciones antiguas no se mueven automáticamente al nuevo canal. Si el canal no está configurado, se mantiene la compatibilidad con `TELEGRAM_FREE_CHAT_ID` y las publicaciones seguirán llegando al grupo.

La versión añade una columna `chat_id` opcional al registro de adelantos VIP para poder retirar correctamente los mensajes del nuevo canal. Las publicaciones anteriores conservan el grupo original como destino de respaldo. La migración es aditiva y la aplica `initializeDatabase()`; no borra datos.

---

## v3.2.7.2 — Acceso unificado y panel privado

- El botón «Administración» se elimina del pie de página de la portada.
- Se elimina físicamente `public/admin.html`; no hay pantalla de login separada para el personal.
- Todos usan **Iniciar sesión** en la portada, mediante `/api/login`. Tras autenticar, los usuarios normales acceden a `/clientes.html` y el personal autorizado a `/panel`.
- El panel de gestión se sirve desde `views/panel.html` **fuera de la carpeta pública**, solo mediante la ruta `/panel` que valida sesión administrativa con la misma protección de los endpoints.
- Las sesiones, roles, privilegios por cargo, pagos, Telegram y el motor permanecen sin cambios. No hay migraciones MySQL.
- Primer dueño: se mantiene el comando existente de instalación inicial desde servidor (`src/create-owner.js` / `OWNER_SETUP_TOKEN` según despliegue), sin pantalla pública de administración.

> Actualización **v3.2.7.1**: acceso y registro móviles sin espacio superior excesivo. Modales alineados arriba; formulario directo en `/clientes.html`; sin cambios de backend ni base de datos.

## v3.2.7 — acceso moderno en la portada y panel de clientes renovado

La portada ofrece inicio de sesión, registro y recuperación en una ventana emergente accesible. No redirige a `/clientes.html` hasta que el usuario haya iniciado sesión; si elige un plan, conserva su elección y accede a la sección de pago después de autenticarse. Las sesiones y la autorización VIP siguen siendo responsabilidad exclusiva del backend.

El panel privado conserva sus seis secciones: resumen, pronósticos, membresías, pagos, Telegram VIP y notificaciones. Actualizado con la estética oscura y dorada de la portada, animaciones compatibles con la preferencia de movimiento reducido y diseño adaptable a móviles. Los enlaces de recuperación de contraseña y PayPal siguen funcionando en `/clientes.html`; NO se cambiaron contratos de API ni datos MySQL.

Nuevos recursos: `public/landing-auth-v327.js`, `public/landing-auth-v327.css`, `public/client-premium-v327.css`. No requiere nuevas variables ni migraciones. En `GET /health` aparecerá la versión `3.2.7`.

## v3.2.6.1 — enlaces de Telegram a la portada

Se corrigió el enlace incluido en anuncios públicos, avances VIP y avisos privados de Telegram: ahora siempre apunta a `PUBLIC_BASE_URL` en la ruta `/`, sin `/clientes.html`. Ejemplo: `PUBLIC_BASE_URL=https://tu-dominio.com` envía a `https://tu-dominio.com/`. Se conservan las rutas `/clientes.html` para navegación web, cobros de PayPal y recuperación de contraseña. Los mensajes enviados anteriormente no se editan. No se necesitan migraciones.

## v3.2.5 — Identidad pública N-FORCE, sin nombres de proveedores externos

En la web y Telegram se emplea la marca Fijas de Élite / N-FORCE. El visitante ve diferencias entre cotejos automáticos y registros manuales, así como una explicación honesta de que los datos automáticos proceden de registros de terceros no oficiales, con posibles retrasos. No se borran derrotas ni se alteran cifras. La identificación de OpenFootball CC0 y API-Football se conserva únicamente en código, auditoría y documentación técnica, que deben permanecer accesibles para fines de licencias, mantenimiento y revisión.

## Novedades v3.2.5 — lenguaje público más sencillo

La portada mantiene la comparación VIP/Gratis, las victorias y las derrotas reales. Elimina del resumen principal los textos técnicos extensos sobre el origen de los marcadores; conserva una metodología desplegable con identificación de OpenFootball CC0 (comunitario, no oficial) y de las entradas manuales del equipo. No oculta derrotas, no altera resultados ni genera cifras de muestra en público. No requiere migraciones ni variables nuevas.

# Fijas de Élite v3.2.5 — Resultados automáticos + portada VIP vs. Gratis

- Portada: comparación VIP/Gratis prominente directamente después de la sección principal, con ganadas, perdidas, anuladas y tasa real, derivadas de MySQL. Los números DEMO permanecen **exclusivamente** en administración.
- N-FORCE coteja cada 15 minutos los pronósticos pendientes vinculados por ID a `nforce_matches` con **marcador FT reportado por OpenFootball (CC0)** ya importado. La importación externa se ejecuta aprox. cada 2 horas si `FOOTBALL_AUTO_IMPORT=true`. No usa API-Football.
- Aplica resultado 1X2, mercados de totales de goles y ambos marcan **cuando la selección sea inequívoca**. Mercado ambiguo, partido reprogramado, marcador no disponible o fuente desactualizada → pendiente, sin inventar resultado.
- Cada cambio automático queda auditado con marcador, regla y fuente; solo se actualiza si sigue pendiente. No se sobrescriben cierres manuales o revisiones administrativas; el dueño puede corregir con motivo. Pronósticos retirados permanecen en el historial.
- El marcador fuente es comunitario **no oficial**. Se muestra si un resultado es automático (OpenFootball), manual o heredado, sin atribuirle certificación oficial.
- Solo se cotejan automáticamente los pronósticos de N-FORCE con fixture ID seguro; pronósticos antiguos de API-Football o creados a mano requieren revisión por administración.
- En Administración → Análisis automático, después de **Importar datos CC0**, pulsa **Verificar resultados finales** para adelantar el cotejo, o déjalo al programador.
- Migración aditiva automática: `predictions.settlement_source`, `settlement_score`, `settled_at`. No borra cuentas, pagos, membresías ni Telegram.

**Despliegue:** sube el ZIP a GitHub, espera Railway Success, comprueba `/health` en versión `3.2.5`. Conserva `FOOTBALL_ENGINE_MODE=own` y `FOOTBALL_AUTO_IMPORT=true`. El cotejo funciona incluso con `FOOTBALL_AUTO_PUBLISH=false`. Si la fuente no informa el resultado FT, el partido seguirá pendiente.

**Verificación:** `npm test`. Las pruebas simulan datos; el despliegue real con OpenFootball/Telegram/Railway requiere comprobarse aparte.

---

# Fijas de Élite v3.2.5 — Comparación clara VIP vs Gratis

- **En la portada (real):** sección «Pronósticos VIP vs. Gratis» con tarjetas lado a lado. Cada una muestra ganadas, perdidas, anuladas, pendientes y tasa de acierto con su denominador. Las cifras proceden del endpoint público existente, calculado desde MySQL, sin inventar estadísticas.
- **Filtros:** «Gratis + VIP» presenta ambas tarjetas; al elegir una categoría, se ve la tarjeta correspondiente. El período elegido se aplica consistentemente.
- **Sin historial:** aparece «—» en la tasa; nunca se muestra 0 % como si hubiera habido pronósticos perdidos.
- **Panel del dueño, vista DEMO:** comparación **exclusivamente ficticia** de VIP 8 ganadas/1 perdida (88,9 %) frente a Gratis 4 ganadas/2 perdidas (66,7 %); totales ficticios 12/3, tal como antes. El rótulo DEMO es permanente, esos datos **no** se escriben en MySQL y no se envían a Telegram.
- **Transparencia:** la web no presupone que VIP acierte más que Gratis. El rendimiento se calcula con los registros tal como están, incluidos los pronósticos retirados, y no constituye verificación independiente de marcadores.
- Sin cambios de credenciales, variables de entorno, tablas, motor de pronósticos, pagos o permisos.
- `GET /health` devuelve `3.2.5`.

## Instalación

Sube el ZIP completo a GitHub, o usa solo el ZIP de archivos modificados si tu última versión es la **v3.2.1**. Deja Railway desplegar y verifica `GET /health` → `3.2.5`. Abre la sección **Resultados** de la portada y comprueba **VIP vs. Gratis**. Ingresa como dueño para ver **Estadísticas DEMO**.

## Validación

`npm test` y `node --check` de los scripts. Las pruebas son locales: no se ha validado contra la base de datos de producción en Railway.

---

# Fijas de Élite v3.2.1 — Vista DEMO en administración

- **Nuevo menú de dueño:** `Estadísticas DEMO`, con ejemplo visual ficticio de 12 ganadas, 3 perdidas y 80 % de aciertos **SIMULADOS**. Incluye resultados de equipos ficticios y marca permanente de DEMO.
- **Nunca se publican cifras falsas:** la portada sigue consumiendo solo `/api/public/performance`, desde pronósticos reales de MySQL, incluidos los retirados.
- **Solo el dueño:** el nuevo menú es visible únicamente al cargo `owner`; no existe un endpoint que permita escribir los ejemplos ni modificar estadísticas reales.
- **Sin nuevas variables ni migraciones**: basta reemplazar los archivos y desplegar. `/health` devuelve la versión `3.2.1`.
- El panel no incluye opción de exportar ni de enviar las cifras DEMO a Telegram. Es una previsualización interna del diseño.

---

# Fijas de Élite v3.2.0 — Estadísticas públicas del historial

**Proyecto completo**, compatible con la v3.1.0. Mantiene web, Telegram, PayPal, MySQL, membresías, rangos y motor N-FORCE.

## Qué se agregó

- Portada `/` → sección **Resultados con transparencia**.
- Contadores: publicados, ganados, perdidos, anulados, pendientes y tasa de acierto real de los resultados registrados.
- Filtros `todo / últimos 30 / últimos 90 días` y `gratis / VIP / ambos`.
- Barras comparativas gratis y VIP; historial público de los últimos 15 resultados registrados, partido, categoría, fecha y estado. **No** se muestran selecciones, mercados, cuotas ni análisis VIP.
- Endpoint público `GET /api/public/performance?period=all|30d|90d&visibility=all|free|vip` con límite de peticiones.
- Todo procede de los pronósticos ya publicados en MySQL; no se añaden datos ficticios. Las publicaciones retiradas permanecen en el cómputo.
- Fórmula: **aciertos / (aciertos + perdidos)**. Los anulados y pendientes no cuentan en el denominador; si no hay resultados concluidos, se muestra `—`.
- Resultado marcado anticipadamente para un encuentro futuro se cuenta como pendiente y no como acierto hasta que su horario programado pase.
- Cambiar un resultado ya decidido solo puede hacerlo el dueño, indicando un motivo; la modificación (valor anterior, nuevo y razón) queda en el registro de auditoría.
- Los resultados siguen siendo **marcados manualmente por el personal**. El panel lo comunica explícitamente: no existe conciliación automática contra marcador oficial ni auditoría independiente.

## Publicar en Railway

1. Sube ZIP completo (o solo archivos cambiados) a GitHub.
2. Espera el deploy de Railway y comprueba `/health` → `3.2.0`.
3. Entra a la web principal y abre el apartado **Resultados**.
4. Con una cuenta autorizada, en **Administración → Pronósticos**, marca las selecciones concluidas como ganado, perdido o anulado. El resultado aparece en la portada después de guardar.
5. Si está vacío, significa que todavía no hay pronósticos concluidos registrados: no se muestran cifras de demostración.

No requiere variables nuevas ni migraciones SQL. La tasa no prueba rentabilidad y no predice futuros aciertos. Los resultados solo deben marcarse cuando se conocen realmente.

## Pruebas locales

`npm test` y `node --check` de los archivos JS modificados. Pruebas sintéticas para totalización, resultados retirados, cero casos, ventanas y ocultación de contenido VIP. No se realizó una prueba con la base de datos de Railway ni datos reales en esta sesión.

---

# Fijas de Élite v3.1.0 — N-FORCE · motor mejorado

Motor estadístico **propio y sin API-Football por defecto**. Mantiene la web, MySQL, usuarios, pagos, gestión de VIP, administración, bot de Telegram, eliminación de pronósticos y demás flujos existentes en la v2.2.2. Esta actualización es aditiva: **no borra la base de datos**.


## Mejoras de la v3.1.0

- **Poisson 1.1:** tasas de gol basadas en ataque/defensa por localía, regularización bayesiana conservadora y ajuste fijo de correlación para marcadores bajos (Dixon-Coles estilo). Los coeficientes son heurísticos y **no han sido calibrados con una muestra externa**.
- **Muestras transparentes:** cantidad de partidos por equipo, partidos en la misma localía, tamaño efectivo ponderado, edad del último partido y calidad descriptiva 0–100. **La calidad de muestra NO es una probabilidad de ganar**.
- **Más mercados estudiados:** probabilidades de over/under 2.5, over 1.5/3.5 y ambos marcan en la explicación. Se conserva **solo la selección oficial 1X2**; no se genera una segunda apuesta con los mercados descriptivos.
- **Validación mejorada:** además de Brier y log-loss, el backtesting cronológico presenta precisión observada y tamaño de muestra por liga, categoría GRATIS/VIP y bandas de confianza. Una banda con pocas observaciones no permite conclusiones sólidas.
- **Diagnósticos:** contador de históricos por equipo/liga insuficientes, forma obsoleta y partidos futuros sin hora exacta. No se inventan fechas.
- **Protección de migración:** el escáner actualiza borradores existentes al nuevo modelo sin modificar publicados o descartados; la publicación rechaza borradores de una versión antigua.
- **Autopublicación:** exige un backtest vigente de la versión **nforce-poisson-1.1** y 40 encuentros evaluados como mínimo; el dueño debe revisar sus métricas antes de activar `NFORCE_LIVE_RELEASE_ACK=true`.

Tras subir la versión, pulsa **Validar modelo** y **Analizar ahora** para refrescar los borradores del v3.0.0. El backtesting local mejora la evaluación, pero no prueba rentabilidad real ni garantiza publicaciones.

## Puesta en marcha en Railway

1. Sube **todos los archivos** del ZIP a tu repositorio de GitHub. Conserva las variables de MySQL, JWT, PayPal (si lo usas) y Telegram; **no incluyas contraseñas ni tokens en GitHub**.
2. Variables recomendadas al instalar:

   ```env
   FOOTBALL_ENGINE_MODE=own
   FOOTBALL_AUTO_IMPORT=true
   FOOTBALL_AUTO_SCAN=true
   FOOTBALL_AUTO_PUBLISH=false
   NFORCE_LIVE_RELEASE_ACK=false
   ```

   No necesitas `FOOTBALL_API_KEY` en modo `own`. Las credenciales del bot y los IDs de ambos chats siguen siendo necesarios para enviar mensajes.
3. Espera `Success` en Railway y comprueba `GET /health` → `version: 3.1.0`. El sistema creará las tablas `nforce_matches`, `nforce_import_runs`, `nforce_scans` y `nforce_backtests` sin borrar las existentes.
4. En `/panel` (tras iniciar sesión como dueño en la portada) → **Análisis automático**, pulsa **Importar datos CC0** (la importación automática también comienza al arrancar). Revisa cuántos partidos y resultados se importaron; algunos ficheros pueden faltar o contener calendarios no actualizados.
5. Pulsa **Validar modelo (backtest)** y comprueba su muestra, aciertos observados y Brier. El backtest se volverá a ejecutar automáticamente como mínimo cada 7 días y antes si aún no hay muestra suficiente.
6. Pulsa **Analizar ahora y guardar propuestas**. Si existe un partido futuro con **hora conocida**, historial suficiente y supera los filtros, aparecerá como borrador. Puedes aprobarlo manualmente para probar la publicación.
7. **Solo tras verificar el calendario, historial, rendimiento y canales**, habilita explícitamente:

   ```env
   FOOTBALL_AUTO_PUBLISH=true
   NFORCE_LIVE_RELEASE_ACK=true
   ```

   En modo propio, ambos son necesarios. Auto-publicación exige 40 evaluaciones retrospectivas como mínimo y respeta los topes de una gratuita y dos VIP al día. **40 observaciones no prueban precisión suficiente**: el dueño debe evaluar el modelo antes de activar el envío real.

## Funcionamiento

- **Fuente abierta:** ficheros JSON CC0 del repositorio [OpenFootball/football.json](https://github.com/openfootball/football.json) alojados en GitHub. Fuentes preaprobadas para Premier League, LaLiga, Bundesliga, Serie A y Ligue 1 de temporada vigente y anterior (hasta 10 ficheros). Sin clave API ni scrapers de webs ajenas.
- **Licencia y atribución:** [CC0 1.0](https://github.com/openfootball/football.json/blob/master/LICENSE.md). La fuente está en dominio público. Esto no certifica exactitud o actualización del calendario, ni derechos de logos deportivos.
- **Actualización:** cada 2 horas aproximadamente y reintento después de fallos; importación idempotente en MySQL. Una programación movida actualiza el encuentro existente. Se omiten partidos con hora ausente o ilegible para autopublicación.
- **Estadística:** modelo Poisson regularizado, corrección fija para marcadores 0-0/1-0/0-1/1-1, ajuste a medias de liga y promedios local/visitante, ponderación exponencial por recencia y muestra mínima de 7 partidos por club más 36 de liga. Produce 1X2, probabilidades de más de 1.5/2.5/3.5 goles, ambos marcan y un marcador orientativo. Las probabilidades **no están calibradas** y no proceden de cuotas.
- **Calidad:** no publica partidos ya empezados, con resultados registrados, sin fecha/hora válida, con calendario local desactualizado (más de 36h desde la última consulta), duplicados o sin respaldo estadístico.
- **Backtesting:** simulación cronológica *walk-forward* donde las predicciones pasadas solo ven datos anteriores a cada partido; Brier, log-loss, porcentajes observados y curvas de calibración por bandas de confianza y categoría gratis/VIP. Historial de backtests en MySQL. El backtest retrospectivo no representa resultados en producción.
- **Canales:** las gratuitas completas a `TELEGRAM_FREE_CHAT_ID`; las VIP completas a `TELEGRAM_VIP_CHAT_ID` y adelanto de cada publicación VIP en la comunidad. Funciones existentes de enlace, blacklist, invitaciones y permisos siguen intactas.
- **Sin cuota / lesiones / alineaciones:** OpenFootball JSON no las ofrece. Nunca se inventan. El bot publica «Cuota no disponible» y reporta esas limitaciones.
- **Modo anterior:** `FOOTBALL_ENGINE_MODE=api` restaura la antigua integración si necesitas compararla; en ese caso sí debes configurar `FOOTBALL_API_KEY` y verificar los límites del proveedor. El modo por defecto es **own**.

## Problemas y diagnóstico

**¿Sigue apareciendo 0 fijas?** Comprueba en orden: (1) ¿la importación indica al menos una fuente exitosa?, (2) ¿hay partidos futuros con **hora publicada**?, (3) ¿hay resultados históricos recientes de ambos clubes?, (4) ¿el modelo genera una probabilidad que supera el filtro?, (5) ¿se completó el backtest?, (6) ¿los interruptores de publicación están habilitados?, (7) ¿se configuraron los dos chats de Telegram? Ninguna publicación debe fabricarse para llenar el canal.

**Importante sobre OpenFootball:** sus archivos de la temporada en curso pueden regenerarse diariamente, pero la **fuente original no tiene garantía de actualización diaria**. Revisa los horarios contra el organizador oficial antes de activar publicación real. Si los datos están atrasados, la aplicación lo indicará; no podremos sustituir datos reales por porcentajes inventados.

**Pruebas locales:** `npm test` y `node --check src/nforce-engine.js`. Incluye pruebas de zona horaria/DST, licencia y fuente permitida, escaneo con memoria MySQL simulada, prueba de publicación a Telegram simulada, backtesting sin fuga de datos futuros y protecciones VIP heredadas. No demuestra integración real con Railway, MySQL alojado ni chats reales.

---

## Documentación del sistema anterior (v2.x; motor API legado)

# Fijas de Élite v2.2.2 — Reintentos y diagnóstico automático

**Instala el ZIP completo en GitHub/Railway y verifica `/health` → `2.2.2`.** Esta versión corrige la pausa injustificada de cuatro horas cuando el motor no consiguió ninguna fija. También permite considerar partidos nuevos aun si muchos fixtures anteriores ya fueron descartados. Conserva Telegram gratis/VIP, membresías, análisis avanzado, eliminación y PayPal.

## Para comprobar por qué no publica

1. Railway → Variables: `FOOTBALL_API_KEY`, `FOOTBALL_AUTO_SCAN=true`, `FOOTBALL_AUTO_PUBLISH=true`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_FREE_CHAT_ID`, `TELEGRAM_VIP_CHAT_ID`. No compartas ni publiques los tokens.
2. Panel dueño → **Análisis automático**. Comprueba los cinco indicadores (API, búsqueda, publicación, chat gratuito, chat VIP) y el dato **Próximo escaneo estimado**.
3. Revisa **Último escaneo: revisados / sin modelo / por filtros**. Cero partidos evaluados puede indicar cuota insuficiente o ausencia de partidos nuevos. Muchos descartes significan que el proveedor no aportó datos aptos, no un fallo de Telegram.
4. En **Motivo de cero publicaciones** se muestra si faltan canales, si hay propuestas sin requisitos o si no había candidatos futuros. Abre los logs de Railway si hay errores del proveedor.
5. Para comprobar al momento, pulsa **Analizar ahora y guardar propuestas** (máximo 2 análisis manuales al día; 10 min entre ellos). Ese botón inicia la búsqueda, no fuerza la publicación de datos insuficientes. Cuando `FOOTBALL_AUTO_PUBLISH=true`, el despachador intenta enviar las propuestas aptas.

## Frecuencias y límites

- Motor: chequeos cada 15 minutos, también al iniciar Railway.
- Escaneo completo con alguna propuesta creada: próximo intento después de 4 horas.
- Escaneo con partidos analizados pero sin propuestas: próximo intento después de 1 hora.
- Escaneo sin partidos nuevos evaluados: próximo intento después de 30 minutos.
- Proveedor Free: máximo 100 solicitudes al día, 10 por minuto; se conserva una reserva de cuota y pausas entre peticiones. Por ello algunos intentos pueden aplazarse si ya se consumió la cuota.
- Cada pronóstico sigue requiriendo evidencia y confianza mínima; no se garantiza encontrar selecciones ni enviar mensajes todos los días.

**Esta entrega pasa pruebas locales de lógica con API y Telegram simuladas; no prueba la conexión de la cuenta real de Railway ni su envío a Telegram.**

---

# Fijas de Élite v2.2.1 — Automatización corregida ⚽

**Proyecto completo para GitHub y Railway.** Basado en v2.2.0; conserva clientes, PayPal, Telegram, rangos, eliminación segura de pronósticos y análisis avanzado.

## Por qué no aparecían fijas en versiones anteriores

- El escáner examinaba solo **5 partidos**, exclusivamente entre 1 y 6 horas antes del comienzo.
- El filtro VIP exigía una probabilidad estimada ≥72%, margen ≥18 puntos, al menos dos familias de evidencia **y una cuota de bookmaker**. Muchas ligas no ofrecían cuotas; por ello los borradores VIP no podían publicarse automáticamente.
- El filtro gratuito también era rígido (40–50% de probabilidad estimada y margen ≥12 puntos).
- La publicación se intentaba durante un escaneo programado, pero no se revisaban regularmente los borradores previamente creados.
- Las llamadas sucesivas podían alcanzar el límite gratuito de **10 peticiones/minuto**.

## Comportamiento nuevo

1. **Ventana de 1–24 horas** desde el escaneo; hasta **10 encuentros nuevos** por ejecución, dando preferencia a competiciones conocidas y diversificando ligas.
2. **No gastar cuota dos veces en la misma propuesta**: evita volver a consultar fixtures ya registrados; guarda una pausa de 6 horas para partidos sin modelo disponible y de 8 horas para resultados que no superan los filtros. Prueba otros encuentros mientras tanto.
3. **Filtros verificables, no promesas**: gratuita, 40–50% de probabilidad 1X2 estimada, margen ≥8 puntos y ≥2 tipos de evidencia; VIP, ≥63%, margen ≥12 y ≥2 tipos de evidencia. Son **probabilidades no calibradas**, no porcentajes reales de acierto. Ningún partido que carezca de evidencia será fabricado para conseguir publicaciones.
4. **Cuota opcional**: las apuestas sin una cuota del proveedor muestran «No disponible»; no se calcula rentabilidad. La ausencia de cuota **ya no impide publicar** una propuesta estadísticamente válida.
5. **Publicación automática independiente**: cada 30 minutos revisa borradores aptos y próximos (más de 20 minutos antes del encuentro), aun si el escaneo está en espera; máximo 1 gratuita y 2 VIP automáticas cada día. No duplica publicaciones gracias al estado MySQL y bloqueo por ID.
6. **Escaneo completo cada 4 horas** cuando `FOOTBALL_AUTO_SCAN=true`. El proceso se inicia también cuando arranca Railway, tras la migración.
7. **Límites API Free**: hasta 18 consultas suplementarias por escaneo más la consulta al estado, reserva mínimo 20 consultas para el resto del día y espacia las peticiones al proveedor a 6.5 segundos (máximo ~9/minuto en la instancia). La cuota de 100/día es del proveedor y se comparte si se reutiliza la clave en otra aplicación.
8. **Panel de diagnóstico**: indica si faltan token o IDs de Telegram, configuración de automatización, estado del escaneo, cuántos partidos se revisaron, cuántos se descartaron o estaban pausados, consultas estimadas y publicación automática. La búsqueda manual se inicia como trabajo de servidor y el panel consulta el resultado, para evitar timeouts del proxy.
9. **Canales**: gratuita completa → Fijas de Élite Comunidad. VIP completa → canal VIP, con adelanto limitado en grupo público. Requiere bot administrador y IDs de chat correctos.

## Variables Railway

```env
FOOTBALL_API_KEY=tu_clave_privada
FOOTBALL_AUTO_SCAN=true
FOOTBALL_AUTO_PUBLISH=true
TELEGRAM_BOT_TOKEN=tu_token_privado
TELEGRAM_FREE_CHAT_ID=-100xxxxxxxxxx
TELEGRAM_VIP_CHAT_ID=-100yyyyyyyyyy
```

**Recomendación:** deja `FOOTBALL_AUTO_PUBLISH=false` durante la primera revisión real y actívala cuando hayas comprobado que los pronósticos y canales son correctos. Solo activa el envío autónomo si aceptas publicar selecciones sin aprobación humana.

## Cómo instalar y verificar

1. Respalda Railway MySQL. Sube los archivos del ZIP completo al repositorio GitHub, respetando las carpetas; espera a que Railway despliegue correctamente.
2. Comprueba que `/health` responda con `2.2.1`; recarga el panel con Ctrl+F5.
3. Como dueño, visita **Análisis automático**: las tres configuraciones de API/escaneo/publicación y los dos chats deben aparecer correctas.
4. Si quieres probar sin Telegram, usa **Diagnosticar API (sin guardar)**. Para crear propuestas reales, usa **Analizar ahora y guardar propuestas**, que continúa en segundo plano; el panel consulta su progreso.
5. Con publicación habilitada, las propuestas elegibles nuevas o previamente pendientes se intentan publicar al siguiente chequeo de 30 minutos; también al reiniciar el servidor. Si un partido no cumple los filtros, queda fuera y el motivo aparece en el historial.
6. Verifica la recepción real en ambos chats de Telegram y las fichas en `/clientes.html`. Si `telegram_status=failed`, consulta el bot y sus permisos.

Se crean de forma **aditiva** `football_fixture_checks` y nuevas columnas de métricas en `football_scans`, sin borrar pronósticos ni usuarios. No hay que ejecutar SQL manual.

**Validación:** pruebas locales con API y Telegram simulados prueban las reglas y flujo completo de publicación, pero **no** validan tu clave de API-Football, tu Railway, tus credenciales ni el envío real al grupo/canal. Ninguna versión puede garantizar que existirá una selección válida todos los días.

---

## Historial de versiones (informativo; las configuraciones antiguas pueden estar obsoletas)

# Fijas de Élite v2.2.0 — Investigación deportiva avanzada

**Actualización sobre v2.1.9; ZIP completo para GitHub y Railway.**

## Nuevo motor: lesiones, alineaciones, forma y goles
- `/predictions`: conserva el modelo 1X2, forma reciente de ambos equipos y proyecciones de goles; estas probabilidades NO son tasas de acierto históricas demostradas.
- `/injuries?fixture=...`: obtiene ausencias y dudas conocidas, indicando quién, motivo y tipo. **Sin registros no equivale a plantel sin lesiones**.
- `/teams/statistics` (solo cuando hay IDs de liga y temporada válidos): partidos, victorias, empates, derrotas y promedios de goles a favor/en contra, separados por equipo.
- `/fixtures/lineups?fixture=...`: consulta onces reportados solo cerca del inicio, porque suelen estar disponibles 20–40 minutos antes. Si no hay datos, el sistema dice Pendiente/No disponible. Los once reportados deben verificarse en la fuente.
- Los datos se guardan como `football_candidates.evidence_json.advanced` y en el análisis de cada propuesta. La web VIP muestra tarjetas por equipo, lesiones y onces, mientras el canal VIP recibe una síntesis.
- En **Dueño → Análisis automático → propuesta pendiente** existe el botón **Actualizar lesiones y alineaciones**. Puede usarse entre 120 y 10 minutos antes del inicio; máximo tres actualizaciones al día en total y separación de veinte minutos por propuesta. Solo actualiza propuestas sin publicar.
- **Consumo de API-Football Free:** se estudia en profundidad un máximo de **un candidato elegible por escaneo** (1 llamada de lesiones + 2 estadísticas de temporada si hay datos), además de las consultas previas. La actualización manual cerca del inicio puede consumir 1–2 llamadas adicionales. El presupuesto de cuota mínima del escáner se incrementó a 16 solicitudes disponibles. Los fallos de endpoints suplementarios son recuperables: el motor conserva el pronóstico base e informa lo que falta.
- Nunca se transforma el número de lesionados o la formación en una falsa garantía ni se eleva automáticamente el porcentaje estimado por el proveedor.

## Instalación
1. Respalda MySQL. Sube el **contenido** del ZIP a GitHub, conservando las carpetas originales, y despliega en Railway.
2. Comprueba `/health` → versión `2.2.0`. No se requieren nuevas variables obligatorias ni una migración destructiva.
3. Mantén `FOOTBALL_AUTO_PUBLISH=false` mientras pruebas. Ve a **Análisis automático → Analizar ahora y guardar propuestas**.
4. Abre la tarjeta de una propuesta. Puedes actualizar su estudio al acercarse el inicio, antes de pulsar **Aprobar y publicar**.
5. Comprueba la ficha del cliente VIP y el mensaje del canal privado. El adelanto en el grupo gratuito no revela detalles VIP.
6. Los candidatos de versiones antiguas no incorporan automáticamente los nuevos campos de investigación. No borres sus registros; crea propuestas nuevas.

**Limitaciones**: API-Football Free tiene 100 solicitudes/día y cobertura desigual por competición/temporada. En la ventana general de 1–6 horas anterior al inicio casi nunca estarán disponibles los onces completos; para ellos sirve la actualización cercana al partido. No se ha probado con tus credenciales reales en Railway. No se prometen aciertos del 99 % ni beneficios garantizados.

---

## Actualización v2.1.9 — Retirar pronósticos con seguridad

- **Dueño → Pronósticos → Últimos pronósticos → Eliminar pronóstico**: solicita motivo y doble confirmación.
- Se archiva (borrado lógico) y desaparece inmediatamente de la web del cliente, pronósticos públicos y listados activos. No se borran los resultados históricos, evidencias ni auditoría.
- Los próximos mensajes a Telegram (gratis, VIP y adelantos VIP) guardan ID de mensaje. Al retirar una publicación, el bot intenta borrar sus mensajes del canal VIP o grupo público.
- **Mensajes antiguos:** el bot no había guardado sus IDs antes de v2.1.9; podrían requerir eliminación manual desde Telegram. Telegram también puede impedir eliminar mensajes demasiado antiguos o sin permisos.
- Se bloquean las notificaciones privadas pendientes de un pronóstico retirado. Los mensajes ya leídos o reenviados no pueden recuperarse.
- Solo el **dueño** puede retirar. Los demás cargos conservan sus permisos de publicación y resultados.
- Puedes consultar el historial desde **Ver pronósticos retirados** y desde **Actividad**.
- Los resultados ya confirmados y su rendimiento histórico no se alteran al retirar un pronóstico.

Instalación: respaldo de MySQL, actualización de todos los archivos en GitHub, Railway `Success`, luego comprobar `/health` → `2.1.9`. No necesitas nuevas variables; la migración agrega columnas y tablas sin eliminar datos.

---

## Actualización v2.1.8 — Anuncios VIP limitados en la comunidad

- **Cada nueva fija VIP** publica el análisis completo solamente en `TELEGRAM_VIP_CHAT_ID` y un **adelanto limitado** en `TELEGRAM_FREE_CHAT_ID`.
- El adelanto anuncia el encuentro (cuando el título procede del motor automático), liga, hora prevista y enlace al acceso VIP, **sin selección, mercado, cuota, goles, marcador, probabilidad ni análisis**.
- Se reemplaza el límite antiguo de un anuncio por semana por **un anuncio por pronóstico**. La tabla nueva `telegram_vip_public_announcements` impide repetir el mismo anuncio al procesar otra vez su ID.
- Los pronósticos gratuitos continúan enviándose completos a Fijas de Élite Comunidad.
- MySQL crea la tabla nueva automáticamente al iniciar la versión; no se borran membresías, clientes ni la tabla antigua de adelantos.
- Se aplica solo a nuevas publicaciones. Requiere que el bot pueda publicar en ambos chats y que ambas variables `TELEGRAM_FREE_CHAT_ID` / `TELEGRAM_VIP_CHAT_ID` estén bien configuradas.
- Ante un fallo del envío al grupo, el pronóstico VIP permanece en el canal; se registra el fallo en Railway y no se hace reenvío automático que pueda duplicarlo.
- Instalar actualizando GitHub, desplegar Railway, comprobar `/health` versión **2.1.8**, y publicar un pronóstico VIP de prueba con `FOOTBALL_AUTO_PUBLISH=false`.

---

# Fijas de Élite v2.1.5 — Proyección de goles y escenarios de marcador ⚽

Esta actualización se aplica sobre v2.1.3. En **Análisis automático**, los candidatos nuevos incluyen un panel de goles por equipo, goles totales y, **solo con tres o más enfrentamientos directos válidos**, un escenario ilustrativo de marcador (p. ej., 2-1) y el margen de victoria. No garantiza que se produzca ese resultado.

La fuente `/predictions` de API-Football entrega límites de tipo *más/menos goles*, no probabilidades calibradas de marcadores exactos; la interfaz no transforma esos límites en una supuesta certeza. En caso de datos ausentes, muestra «sin estimación».

Las proyecciones se incorporan al **texto del análisis almacenado en MySQL** para nuevas propuestas, y por tanto se muestran a clientes con permiso y al canal VIP al publicarse. Las propuestas **ya creadas** permanecen tal como estaban: haz un escaneo nuevo cuando el límite de uso lo permita. No se recomienda introducir datos falsos ni re-publicar las mismas selecciones.

## Instalación
1. Copia el contenido de este proyecto en GitHub conservando las carpetas `src`, `public`, `sql` y `tests`.
2. Espera Railway Success y verifica `/health`: `2.1.5`.
3. En **Análisis automático**, busca partidos cuando el escáner esté disponible. Consulta los nuevos detalles de goles en las propuestas.
4. Mantén `FOOTBALL_AUTO_PUBLISH=false` hasta comprobar el rendimiento real.

No requiere nuevas variables de Railway ni cambios destructivos en MySQL. **Los escenarios de marcador y los porcentajes del proveedor no equivalen a una tasa de acierto demostrada.**

---

# Fijas de Élite v2.1.3 — Análisis real y propuestas

**Qué cambia frente a v2.1.2**

- Dos botones separados: diagnóstico de API (no guarda) y análisis manual (guarda propuestas válidas en MySQL, NO publica).
- El análisis manual ya no queda bloqueado por el enfriamiento automático de tres horas: tiene un cupo separado de **2 análisis al día** y al menos **10 minutos** entre intentos. El cupo se conserva en MySQL.
- Analiza hasta **5 partidos de ligas distintas**, no solamente los primeros 3 del calendario. El límite conservador del plan gratuito es de hasta 9 consultas computables por análisis, sujeto a cruces de medianoche y a la información disponible.
- Informe del análisis con partidos encontrados, revisados, rechazados y motivos, sin inventar pronósticos.
- El dashboard distingue correctamente el límite diario de la API-Football (`requests.limit_day`).
- Base de datos: migración aditiva para informes y escaneos manuales. No borres las tablas.

**Instalación:** sustituye todos los archivos en GitHub, espera Railway Success, revisa `/health` (2.1.3), entra como dueño en Análisis automático y pulsa **«Analizar ahora y guardar propuestas»**. La primera ejecución puede tardar por las llamadas reales. Si no aparece ninguna propuesta, consulta los motivos de descarte. **No significa un fallo de API**.

Durante la evaluación, fija `FOOTBALL_AUTO_PUBLISH=false` para que nada se envíe automáticamente a Telegram. Si el diagnóstico se ejecutó muy recientemente, el proveedor también aplica un límite de 10 solicitudes/minuto. No pulses ambos botones en sucesión rápida.

**Los estimados de API-Football no son tasas de acierto garantizadas.** No se garantiza un pronóstico en cada búsqueda.

---

# Fijas de Élite v2.1.3 — Corrección API-Football Free ⚽

**Problema resuelto:** la versión 2.1.1 usaba `last=5` en `/fixtures/headtohead`. El plan gratuito de API-Football devuelve el error `Free plans do not have access to the Last parameter`. Esta versión usa solo `h2h=ID-ID` y filtra localmente los encuentros terminados más recientes. No exige comprar otro plan.

## Instalar

1. Descomprime y sube el contenido (archivos y carpetas de la raíz) a GitHub, reemplazando la versión 2.1.1.
2. Espera que Railway muestre `Success` y verifica `/health` -> `"version":"2.1.3"`.
3. Como dueño, abre **Análisis automático** y pulsa **Buscar partidos próximos**. Como la búsqueda fallida no aplica cooldown, podrás reintentarlo. Revisa los contadores de examinados, sin predicción, descartados y advertencias.
4. Si encuentra propuestas de calidad, aparecerán como borradores en **Actualizar propuestas**, listos para revisión y publicación manual. **El diagnóstico** continúa siendo solo de lectura: no guarda ni anuncia nada.
5. Para pruebas, mantén `FOOTBALL_AUTO_PUBLISH=false` mientras confirmas datos, selección y cuotas. La publicación requiere aprobación manual salvo escaneos programados con publicación habilitada y filtros cumplidos.

## Limitaciones

- La API puede no devolver predicciones, encuentros o cuotas para algunas ligas o temporadas del plan gratuito. Eso no se debe reemplazar con números inventados.
- La búsqueda mira partidos entre **1 y 6 horas** de comenzar y analiza como máximo 3 por ejecución, respetando la cuota de API-Football.
- No garantizamos un porcentaje de aciertos (y mucho menos 99%).
- La lógica de pagos, memberships, rangos y Telegram permanece sin cambios; **no borres MySQL ni cambies tus variables existentes**.
- Las pruebas locales simulan al proveedor; se debe confirmar el resultado de la API real en Railway.

---

# Fijas de Élite v2.1.1 — Diagnóstico inmediato de análisis ⚡

**Corrección de un fallo real en v2.1.0:** el escáner utilizaba `DEFAULT_MAX_HOURS` sin importarlo; producía un error antes de leer los partidos. Además, el bloqueo de 180 minutos impedía otra búsqueda incluso cuando el escaneo había fallado. Ambas cosas están corregidas.

## Prueba inmediata sin esperar horas

1. Sube el contenido completo a GitHub y verifica Railway `Success` y `/health` versión `2.1.1`.
2. Inicia sesión como dueño → **Análisis automático** → **⚡ Probar conexión y partidos ahora**.
3. La prueba de solo lectura comprueba la cuenta de API-Football, consulta partidos de hoy y mañana si la ventana cruza medianoche, y consulta una predicción de muestra cuando hay partidos en las próximas 1–6 horas.
4. Verás si responde la API, cuántos partidos llegaron, cuántos están dentro de la ventana, si hay predicción de proveedor y si supera filtros. Si no hay partidos, indicará el motivo sin fingir un pronóstico.

**La prueba no escribe propuestas, no cobra, no envía nada a Telegram y no modifica la membresía.** Usa de 2 a 4 consultas API-Football. Se devuelve un resultado en caché durante 60 segundos para evitar consumir cuota y se limitan a 4 diagnósticos por día y proceso. Nunca muestra la API key.

La **Búsqueda completa** sigue limitada a tres horas tras una ejecución *completada*, para cuidar la cuota gratuita, pero los fallos anteriores ya no bloquean la búsqueda. Al esperar, muestra la fecha exacta. Los escaneos manuales no activan la publicación automática: solo los escaneos programados pueden publicarla cuando `FOOTBALL_AUTO_PUBLISH=true`.

**Limitación:** todavía se debe validar en Railway con credenciales reales; los tests locales simulan respuestas de la API. Se mantienen las variables `FOOTBALL_API_KEY`, `FOOTBALL_AUTO_SCAN` y `FOOTBALL_AUTO_PUBLISH`. Se recomienda desactivar la publicación automática mientras se evalúan resultados.

---

# Fijas de Élite v2.1.0 — Motor de análisis automático de fútbol

## Alcance real de esta versión
- Selección automatizada de partidos que comienzan en 1–6 horas mediante **API-Football**.
- Análisis reproducible de probabilidades 1X2 del proveedor, forma reciente, comparaciones de ataque/defensa, antecedentes e indicadores disponibles. **No se fabrican noticias, lesiones, cuotas ni porcentajes**.
- Preparación de propuestas en MySQL y aprobación desde **Dashboard → Análisis automático**, solo por el dueño.
- Publicación en web y Telegram, con control de duplicados, límites por día y publicación automática **opcional y apagada por defecto**.
- En canal VIP se publica la selección y el análisis. En el grupo público se puede publicar alguna selección gratuita completa solo si el dueño lo habilita (`FOOTBALL_PUBLIC_FREE_PICKS=true`); el panel web sigue pidiendo cuenta para consultar los pronósticos.
- Estadísticas de aciertos observados una vez que **se registran** los resultados; el asentamiento automático de resultados no está incluido todavía y hay que marcarlos desde Gestión de pronósticos. Nunca se promete 99 % de acierto.

## Variables adicionales de Railway
```
FOOTBALL_API_KEY=TU_CLAVE_DE_API_FOOTBALL
FOOTBALL_AUTO_SCAN=false
FOOTBALL_AUTO_PUBLISH=false
FOOTBALL_PUBLIC_FREE_PICKS=false
```
1. Regístrate en https://www.api-football.com/ y copia tu clave desde `My Access`. No la subas a GitHub.
2. Añádela en Railway, haz deploy y entra como dueño a **Análisis automático**. Pulsa **Buscar partidos próximos**. La aplicación limita a un escaneo cada **3 horas**, incluida ejecución manual; usa un bloqueo MySQL para evitar escaneos paralelos.
3. Revisa las propuestas y, si lo deseas, aprueba individualmente las selecciones y análisis. La fuente externa puede no ofrecer datos suficientes o cuotas, por lo que puede no haber propuestas.
4. Para búsqueda programada activa `FOOTBALL_AUTO_SCAN=true`. Cada **4 horas** examina una ventana de partidos de 1–6 horas, siempre dentro del cupo de la API.
5. **Opcional y bajo responsabilidad del dueño:** solo tras comprobar resultados y datos, activa `FOOTBALL_AUTO_PUBLISH=true`. Entonces las propuestas con cuota verificable pueden publicarse sin revisión (máx. 1 gratis y 2 VIP al día, con umbrales de evidencia). Las propuestas sin cuota quedan como borradores.
6. Si quieres que el grupo público vea **algunos pronósticos gratuitos completos** en lugar de solo avisos de la web, activa `FOOTBALL_PUBLIC_FREE_PICKS=true`. Este contenido será visible a cualquiera en el grupo; los pronósticos VIP siguen privados.

**Importante:** la probabilidad que devuelve la API es un pronóstico no calibrado. No es una tasa de acierto medida. El sistema podría producir 0 pronósticos algunos días. Su objetivo es ofrecer razonamientos auditables, no garantizar ganancias. No contiene modelo propio reentrenado ni investigación de prensa en tiempo real. Se recomienda ampliar cobertura y calibración con historial antes de activar publicación automática.

**Base de datos:** solo agrega `football_candidates` y `football_scans`. No borra datos actuales. Antes de desplegar, respalda MySQL.

---

# Fijas de Élite v2.0.4

**Nuevo:** el dueño puede forzar la desvinculación de Telegram y permitir que el cliente vincule otra cuenta sin expulsar al usuario anterior del canal VIP. Ver [VERSION.md](VERSION.md) para instrucciones y limitaciones.

---

# Fijas de Élite v2.0.3 — Corrección del desplazamiento horizontal móvil

## Cambios
- Corrige el desplazamiento del documento hacia la derecha en teléfonos y tablets.
- Controla el ancho máximo de los paneles, formularios, listas VIP, Finanzas y Telegram.
- Permite que los menús de navegación sigan desplazándose lateralmente dentro de su propia barra, sin desplazar la página completa.
- Los códigos, enlaces y mensajes de error largos se ajustan al ancho disponible.
- Se fuerza la actualización de los estilos con la versión `2.0.3` para evitar caché antiguo.
- Conserva todos los módulos del dashboard de la v2.0.2, sesiones, pagos, rangos, Telegram y MySQL.

## Despliegue
1. Respaldar el proyecto y subir **todos** los archivos del ZIP al repositorio que usa Railway.
2. Confirmar que Railway desplegó el commit nuevo y consultar `/health`: debe indicar `2.0.3`.
3. En móvil, probar la landing, el login, los paneles del dueño, cliente y VIP. El documento no debe moverse horizontalmente; los menús sí se pueden deslizar dentro de su barra.
4. Actualizar con recarga completa o borrar la caché de la web si se siguen viendo archivos antiguos.

No modifica la base de datos ni variables de Railway. Las pruebas automáticas locales y la prueba de navegador móvil no sustituyen la verificación con datos reales en Railway.

---

# Fijas de Élite v2.0.2 — Dashboard restaurado

Consultar `VERSION.md` para instalar y comprobar la corrección.

# Fijas de Élite v2.0.1 — Centro de notificaciones por Telegram

**Sobre v1.9.5:** nueva sección de preferencias en el dashboard, mensajes privados optativos sobre activación/renovación VIP, vencimiento y nuevos pronósticos, con cola persistente y controles de acceso. Configuración e instalación detalladas en [VERSION.md](VERSION.md).

Mantén PayPal Live en la configuración ya verificada; esta actualización **no habilita cobros Live por sí misma ni cambia sus credenciales**. Haz respaldo de MySQL y comprueba que Railway muestre `2.0.1` en `/health`.

---

# Fijas de Élite v1.9.5 — Desbloqueo de Telegram al salir de Rank 0

Continuación de la v1.9.4. No elimina cuentas, membresías, pronósticos ni pagos.

## Nuevo comportamiento

1. Cuando el dueño asigna **Rank 0**, el bot solicita `banChatMember` únicamente en el canal VIP. El grupo público no se modifica.
2. Cuando el dueño retira **Rank 0** y cambia el usuario a **Cliente** (u otro cargo), el bot ejecuta `unbanChatMember` para levantar el bloqueo del canal VIP, incluso si ese cliente no tiene membresía.
3. **Desbloquear no equivale a entrar:** el usuario permanece fuera; necesita VIP comprado vigente o VIP por cargo y generar una invitación NUEVA con solicitud de ingreso aprobada.
4. Si Telegram está desconectado o hay un error, la acción queda guardada en `telegram_rank0_actions` y se reintenta al reiniciar Railway, cada tres minutos y con la sincronización manual. No se marca como completada hasta confirmación de Telegram.
5. Al cambiar un usuario otra vez a Rank 0, la acción pendiente se reemplaza por un ban. Nunca debe ejecutarse una liberación pendiente para alguien que hoy siga bloqueado.
6. El panel de personal muestra si Telegram confirmó el desbloqueo o quedó pendiente. **El grupo público sigue intacto.**

## Instalación

- Haz respaldo de MySQL; reemplaza el proyecto completo en GitHub; comprueba Railway **Success** y `/health` versión `1.9.5`.
- No se requieren variables nuevas. `initializeDatabase()` crea una tabla de cola de acciones; no altera miembros ni pagos previos.
- El bot debe ser administrador del canal privado con permiso para restringir usuarios.
- Prueba con una cuenta cuyo Telegram esté vinculado: asigna Rank 0, comprueba que quede baneada del canal VIP, cámbiala a Cliente y verifica que ya no esté baneada **pero siga fuera**; sin VIP, no debe poder solicitar un enlace. Con VIP vigente podrá generar uno nuevo y pedir ingreso.
- Si falla un cambio, abre **Dueño → Telegram → Auditar y limpiar miembros conocidos**. La cola de acciones reintenta los bloqueos y desbloqueos pendientes. Revisa logs de Railway si Telegram sigue rechazando llamadas.

## Límites

- Como la versión anterior, solo se controlan IDs de Telegram vinculados y/o conocidos: Telegram Bot API no enumera todos los suscriptores.
- Una cuenta que nunca vinculó Telegram no tiene ID que desbloquear; puede vincularse desde su panel cuando esté habilitada.
- La confirmación completa requiere prueba real contra Telegram y MySQL; las pruebas locales verifican la política y sintaxis pero no reemplazan una integración desplegada.

---

# Fijas de Élite v1.9.4 — Telegram: limpieza al reiniciar + VIP gratuito por cargo

Continúa la **v1.9.3** y mantiene intactos los pagos PayPal, los rangos, la lista negra, las membresías, las sesiones y las reglas de invitación. **Respalda MySQL antes de instalar.**

## Comportamiento nuevo

- **Al arrancar Railway:** el servidor inicia una auditoría de los usuarios de Telegram cuyos IDs conoce. Cada 3 minutos audita de nuevo hasta 60 conocidos por tanda; desde **Dueño → Telegram** también puedes solicitar una auditoría manual. Si Telegram confirma que un miembro del canal no tiene VIP comprado, VIP gratuito por cargo ni cuenta habilitada, el bot lo expulsa. Un Rank 0 queda baneado; quien solo perdió VIP es retirado y puede solicitar otra invitación después de volver a obtener acceso.
- **Miembros rastreados:** registra los IDs observados por `chat_member` y los IDs vinculados en versiones anteriores en la tabla `telegram_channel_members`. Revisa cada uno por `getChatMember`. También puede retirar inmediatamente a un usuario ajeno que entre con una invitación distinta si Telegram envía el evento `chat_member`.
- **Limitación real de la API:** el Bot API de Telegram **no permite enumerar todos los miembros de un canal**. Por tanto, la auditoría automática **NO garantiza revisar usuarios antiguos/desconocidos** que estaban antes de instalar el bot y nunca generaron un evento. Tampoco puede expulsar a otros administradores del canal. Revisa esos casos manualmente desde Telegram y desactiva enlaces generales que salten la aprobación del bot. El panel compara el recuento informado por Telegram con los IDs conocidos, sin afirmar que sean equivalentes (el recuento incluye administradores).
- **VIP por cargo, sin pago ni vencimiento:** dueño, admin general, admin de pagos, analista y moderador conservan acceso VIP **mientras** tengan ese cargo en `admins` y la cuenta esté activa. No se crea una membresía de mentira ni se registra una venta. Al degradarlo a cliente, pierde el beneficio de rango; si tenía un VIP comprado todavía vigente, lo conserva. **Rank 0 lo bloquea incluso si tenía un pago válido**. El grupo público no se modifica.
- **Panel del personal:** todos los administradores ven **Mi Telegram VIP** para vincular su cuenta Telegram, solicitar la invitación segura y consultar pronósticos VIP. El dueño original, que se creó antes que los clientes, puede pulsar **Preparar mi cuenta de dueño** para crear su perfil web correspondiente sin modificar la contraseña.
- **Cambio de Telegram:** mantiene la comprobación de contraseña, un único Telegram vinculado y la espera de 30 días. La cuenta anterior se retira del canal antes de autorizar un cambio.

## Instalación y comprobación

1. Respalda la base MySQL. Descomprime el ZIP, sube todos sus archivos a GitHub y espera **Railway → Success**. Comprueba `GET /health` y la versión `1.9.4`.
2. Conserva `TELEGRAM_BOT_TOKEN`, `TELEGRAM_VIP_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` y `PUBLIC_BASE_URL`. No necesitas nuevas variables. El canal debe ser **privado** y el bot su administrador con permiso para gestionar invitaciones, aprobar solicitudes y banear miembros.
3. Como dueño abre **Telegram → Activar webhook Telegram** si no lo hiciste; comprueba que se suscriba a `chat_member` y `chat_join_request`. Ejecuta **Auditar y limpiar miembros conocidos**. Verás cuántos IDs auditó, retiró y no pudo revisar.
4. Prueba con un cliente sin VIP que ya esté en el canal: si su ID está registrado o el bot observa su ingreso, debe expulsarlo. Repite con un VIP vigente: debe permanecer. Prueba Rank 0: debe quedar fuera del canal, pero no del grupo público.
5. Asigna a una cuenta de cliente el rango Analista. Con esa cuenta entra al panel del personal → **Mi Telegram VIP**. Debe tener VIP por cargo sin comprar. Vincula Telegram, solicita ingreso y después retírale el rango: el bot debe retirarlo salvo que tenga VIP comprado vigente.
6. Audita **manualmente** a los miembros anteriores a la instalación del bot que no aparecen como conocidos. Los enlaces creados por otros administradores o el propietario deben revisarse en Telegram; el bot solo puede revocar sus propios enlaces.

### Precauciones

No uses Telegram como fuente exclusiva de identidad, ni confíes en `@username`: utiliza solo el ID numérico vinculado. Las expulsiones dependen de la disponibilidad de la API y los permisos; si falla la red, quedarán para reintento. La limpieza por reinicio se procesa **por tandas**, no es un escaneo mágico de todos los suscriptores. La condición de VIP por cargo es un privilegio interno y no constituye una venta ni un ingreso financiero. Los cambios en roles y pagos tienen efecto en el siguiente control del servidor; Telegram puede tardar en aplicar una expulsión.

## Pruebas

Se ejecutaron pruebas locales unitarias y de sintaxis. No equivalen a un despliegue real con tu MySQL, canal privado y credenciales de Telegram. Primero prueba con cuentas de demostración.

---

# Fijas de Élite v1.9.3 — Invitaciones VIP de un solo uso y Rank 0 en Telegram

Esta actualización continúa sobre **v1.9.2**. Mantiene los paneles, la seguridad de cambios de Telegram, pagos y membresías. No borres MySQL ni cambies tus variables existentes.

## Canal privado: reglas de ingreso

- El cliente solicita desde **Dashboard → Telegram VIP** un enlace de invitación de 15 minutos. Se crea con `creates_join_request=true`: abrirlo **no** permite entrar sin aprobación.
- El webhook comprueba que el **ID de Telegram del solicitante coincida exactamente** con el ID vinculado a la cuenta web, que no esté en Rank 0 y que exista VIP vigente **en ese momento**.
- El enlace sólo sirve para la cuenta vinculada. Si se reenvía a otra persona, se rechaza la solicitud aunque esa persona sea VIP de otra cuenta.
- Cuando se emite otro enlace se revoca el anterior; el que se use correctamente se revoca y elimina del registro. Los enlaces vencidos sin usar se desechan mediante una limpieza periódica; Telegram también impide usarlos después de su `expire_date`.
- Una cuenta sin VIP o en Rank 0 no puede usar invitaciones antiguas, incluso aunque Telegram todavía muestre el enlace. El bot rehúsa su solicitud de ingreso.
- **Rank 0:** al aplicarlo desde **Personal**, la web bloquea al cliente y solicita **inmediatamente** a Telegram que lo banee del **canal VIP** (no del grupo público). Si la API falla, el panel muestra una advertencia y la sincronización reintenta retirar al miembro.
- Cuando el dueño levanta Rank 0, el usuario **no recupera el ingreso automáticamente**; necesita VIP vigente y una invitación nueva.

## Instalación

1. Haz una copia de seguridad de MySQL. Sube el contenido del ZIP a GitHub y verifica **Success** en Railway.
2. Comprueba `GET /health` → `version: 1.9.3`. `initializeDatabase()` añade `telegram_vip_invites.invite_link` si la columna todavía no existe. No borra registros previos.
3. No hay variables nuevas. Mantén el bot como administrador del canal VIP, con permisos para **invitar, aprobar solicitudes y expulsar/bloquear miembros**; activa el webhook desde **Dueño → Telegram** si está desactivado.
4. Revoca manualmente invitaciones **externas, permanentes o creadas por otros administradores** que pudieran circular. El bot sólo puede revocar los enlaces que él mismo creó. Los enlaces antiguos de v1.9.2, de los que no se conservó el texto íntegro, expiran por sí solos a los 15 minutos y sus solicitudes no se aprobarán una vez sustituidos.
5. Prueba con dos cuentas de Telegram y un cliente VIP de prueba: usa un enlace válido desde el ID correcto, intenta reenviarlo a otro ID, pide otro enlace y prueba el antiguo; después aplica Rank 0 y comprueba el bloqueo al canal mientras el grupo público permanece intacto.

## Verificación y limitaciones

Los test unitarios y `node --check` no equivalen a una prueba real con tu bot, el canal ni MySQL. La expulsión inmediata exige que Telegram esté disponible y que el bot tenga permiso de bloqueo. Si la API falla, el panel lo advierte y queda pendiente de reintento. La limpieza de enlaces caducados ocurre en el barrido programado aproximadamente cada tres minutos, sujeto a la actividad de Railway.

---

# Fijas de Élite v1.9.2 — Cambio seguro de Telegram para clientes VIP

Esta actualización continúa sobre **v1.9.1**. Conserva los pagos, la administración, los pronósticos, los paneles y las vinculaciones Telegram existentes; no es necesario borrar MySQL ni cambiar el token del bot.

## Protección contra compartir membresías

- El cliente VIP ve **Telegram VIP → Cambiar mi cuenta Telegram** cuando ya tiene una cuenta vinculada.
- Para solicitar un cambio debe confirmar su contraseña de Fijas de Élite y aceptar que la cuenta de Telegram anterior perderá el acceso **inmediatamente**. El backend pide a Telegram expulsar y bloquear esa cuenta del canal **antes** de generar el enlace. Si el bot no puede hacerlo, rechaza el cambio.
- Se crea un enlace aleatorio de **un solo uso, válido 10 minutos**. Solo la cuenta Telegram que abra ese enlace mediante el bot puede completar el reemplazo. El Telegram antiguo no puede reutilizar el enlace. El nuevo Telegram no puede estar vinculado ya a otra cuenta web.
- **Máximo un cambio completado cada 30 días**. Si se abandona un cambio antes de completarlo, la cuenta anterior sigue fuera del canal; se puede emitir un enlace nuevo con la misma contraseña tras **30 minutos**, sin desbloquear el Telegram anterior.
- Al terminar, el cliente vuelve al panel y solicita una nueva invitación VIP para el **nuevo** Telegram. El bot comprueba la cuenta web, el VIP vigente y el ID de Telegram; no se conceden múltiples accesos en paralelo.
- Solo el dueño puede autorizar una excepción al plazo desde **Administrador → Telegram → Autorizar un cambio anticipado**, con ID del cliente y motivo obligatorio. La excepción **no vincula cuentas ni concede acceso**: el cliente debe iniciar el reemplazo y volver a autenticar su contraseña. Las operaciones quedan en `telegram_change_events`; las excepciones se guardan también en `audit_logs`.
- El bot verifica las solicitudes de entrada y bloquea cuentas de Telegram no autorizadas. Los enlaces de invitación antiguos deberían revocarse manualmente en Telegram si alguna vez se distribuyeron fuera del sistema.

## Instalación y prueba

1. **Respalda MySQL** y sube todos los archivos a GitHub; Railway debe terminar con **Success**. Comprueba `/health` → `version: 1.9.2`.
2. No agregues variables de Railway para esta función. Conserva `TELEGRAM_BOT_TOKEN`, `TELEGRAM_VIP_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_BASE_URL` y el resto de la configuración existente.
3. Confirma que el bot sea administrador del canal VIP con permiso para **expulsar/bloquear usuarios**, aprobar solicitudes de ingreso y crear enlaces. Si no puede expulsar, el reemplazo será rechazado por seguridad.
4. Con una cuenta **VIP de prueba** ya vinculada, abre **Telegram VIP → Cambiar mi cuenta Telegram**, escribe su contraseña web y confirma la operación. Comprueba que el Telegram anterior sea retirado del canal.
5. Abre el enlace desde otro Telegram de prueba **no vinculado**, pulsa Iniciar y actualiza el panel web. Solicita una nueva invitación VIP y verifica que solo el nuevo Telegram pueda entrar.
6. Reintenta cambiar de inmediato: debe indicarse la espera de 30 días. Prueba también el enlace vencido, un Telegram vinculado a otra cuenta y la excepción autorizada por el dueño.

**Limitaciones:** las expulsiones dependen de la API de Telegram; el bot no puede impedir capturas ni mensajes compartidos fuera del canal. El cliente que comienza el cambio pierde acceso con su Telegram anterior incluso si luego deja vencer el enlace, como protección deliberada. Los ensayos locales no prueban la integración contra tu Railway/MySQL/Telegram reales. No actives cobros de producción sin probar de extremo a extremo los componentes financieros.

---

# Fijas de Élite v1.9.1 — Telegram Comunidad + Canal VIP

Actualización sobre la v1.9.0. Mantiene MySQL, las sesiones con cookies, Rank 0, pagos, PayPal, administración de VIP y el diseño oscuro y dorado. **No elimina los datos existentes.**

## Lo nuevo

- **Grupo público («Fijas de Élite | Comunidad»):** al publicar un pronóstico, el bot envía únicamente un AVISO con la liga y un enlace para iniciar sesión en la web. **No publica la selección, la cuota, el mercado ni el análisis**, ni siquiera de los pronósticos gratuitos. De este modo, los pronósticos gratuitos completos siguen disponibles solo para cuentas registradas.
- **Canal privado («Fijas de Élite | VIP»):** recibe los pronósticos VIP completos. Se requiere membresía VIP activa y cuenta Telegram vinculada. Los mensajes se publican con protección de contenido contra reenvío, sin garantía de impedir capturas de pantalla.
- **Panel de clientes > Telegram VIP:** vinculación desde un enlace temporal al bot y solicitud de acceso al canal. El cliente envía `/start <código>` por chat privado para demostrar qué cuenta de Telegram controla.
- **Acceso seguro:** invitación temporal de 15 minutos con solicitud de aprobación (`creates_join_request=true`). El webhook confirma identidad Telegram, cuenta web no bloqueada y membresía activa. **Compartir la invitación con otra persona no le concede entrada automáticamente.**
- **Vencimientos:** sincronización cada 3 minutos para retirar a miembros registrados cuyo VIP expiró, fue retirado o cuya cuenta fue puesta en Rank 0. El dueño también dispone de botón de sincronización manual en el panel Telegram. Al renovar, el cliente puede solicitar un nuevo acceso.
- **Panel admin > Telegram:** comprobar configuración sin mostrar secretos, activar webhook y sincronizar expulsiones.
- **Migración automática:** se crean `telegram_links`, `telegram_link_tokens` y `telegram_vip_invites`. Nunca se guardan los códigos de vinculación en texto plano.

## 1. Crear los chats y asignar permisos

1. Conserva tu grupo público **Fijas de Élite | Comunidad**. No necesitas otro canal gratuito. Agrega el bot como administrador con permiso para publicar mensajes.
2. Crea **Fijas de Élite | VIP** como **canal privado** (no público). Añade el bot como administrador con los permisos **publicar mensajes, invitar usuarios y bloquear/retirar miembros**. Necesita acceso a los eventos de solicitudes de unión y cambios de miembros.
3. Consigue el **ID numérico del canal privado** (generalmente empieza con `-100`). El `TELEGRAM_FREE_CHAT_ID` existente sigue identificando el grupo público. Utiliza canales/chats tuyos, no IDs inventados.
4. Desactiva o revoca enlaces de invitación generales permanentes al canal VIP que se hayan compartido anteriormente. Para que la moderación automática sea efectiva, no deben circular enlaces públicos de acceso sin verificación.
5. **Seguridad:** si compartiste anteriormente el token del bot, revócalo con BotFather y usa el token nuevo en Railway. No envíes el token, claves privadas ni secretos a nadie.

## 2. Variables nuevas en Railway

```env
TELEGRAM_BOT_TOKEN=TOKEN_NUEVO_Y_PRIVADO
TELEGRAM_FREE_CHAT_ID=-100ID_DEL_GRUPO_PUBLICO
TELEGRAM_FREE_GROUP_URL=https://t.me/ENLACE_PUBLICO_DE_TU_GRUPO
TELEGRAM_VIP_CHAT_ID=-100ID_DEL_CANAL_PRIVADO
TELEGRAM_WEBHOOK_SECRET=CADENA_ALEATORIA_DE_32_O_MAS_CARACTERES
PUBLIC_BASE_URL=https://lafijasdeelite-production.up.railway.app
```

Para generar un secreto aleatorio válido de ejemplo: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Establécelo **solo en Railway**, no en GitHub. No modifiques `JWT_SECRET` y conserva las variables de PayPal existentes. `TELEGRAM_FREE_GROUP_URL` es opcional; sin él el panel no muestra enlace del grupo.

## 3. Activar y comprobar

1. Respaldar MySQL y desplegar el ZIP en GitHub / Railway, comprobando `GET /health` → `version: 1.9.1`.
2. Entrar como **dueño → Telegram → Activar webhook Telegram**. Esto registra en el Bot API la URL HTTPS `https://lafijasdeelite-production.up.railway.app/api/telegram/webhook` con secreto de verificación y eventos `message`, `chat_join_request`, `chat_member`.
3. Entrar como cliente VIP → **Telegram VIP → Vincular mi Telegram**. Abrir el bot con el enlace proporcionado, pulsar **Iniciar** y volver a pulsar **Actualizar estado** en la web.
4. Elegir **Solicitar acceso al canal VIP**. Abrir el enlace y enviar la solicitud desde **la misma cuenta de Telegram vinculada**. El bot aprobará la solicitud solo si el VIP está vigente.
5. Publicar un pronóstico gratis y otro VIP. Comprobar que el grupo público ve **avisos sin selección, cuota, mercado ni análisis** y que el canal VIP sí recibe el pronóstico completo.
6. Desde **Gestionar VIP**, revocar una membresía de prueba y pulsar **Telegram → Sincronizar**, o esperar hasta 3 minutos. Confirmar que el cliente deja de pertenecer al canal. No pruebes con un cliente real pagador sin su consentimiento.

## Limitaciones y seguridad

- **El sistema no puede revocar capturas, copias anteriores o mensajes vistos antes de la expulsión**. La opción Telegram `protect_content` limita reenvíos pero no ofrece protección perfecta.
- La expulsión automática es por sondeo cada 3 minutos y depende de que Railway mantenga el servicio activo, el bot sea administrador y Telegram esté accesible. No es en tiempo real ni garantiza un SLA preciso.
- Si alguien ya entró al canal con un enlace de invitación externo antiguo, conviene auditar los suscriptores manualmente. El control automático identifica sobre todo a las cuentas vinculadas y los nuevos ingresos que el bot observa mediante el webhook.
- No se cobra dentro de Telegram. El acceso y los permisos financieros se verifican en el backend web; PayPal y otros medios de pago no cambian en esta actualización.
- Las invitaciones temporales requieren aprobación del bot; no dan acceso por poseer el enlace.
- Las actualizaciones desconocidas del webhook y los mensajes de otros chats se ignoran. Se verifica `X-Telegram-Bot-Api-Secret-Token`.
- Si una cuenta ya está vinculada a un Telegram incorrecto, en esta versión debe solicitar desvinculación a soporte; **no se permite reemplazar el Telegram desde un enlace sin revisión** para evitar el robo de accesos.

## Pruebas disponibles

`npm test` ejecuta 30 pruebas locales, incluidas nueve relacionadas con Telegram. `node --check` verifica sintaxis. Son pruebas unitarias y simulaciones de Bot API, **no pruebas reales con Telegram, MySQL ni Railway**. Antes de abrir el canal VIP a clientes, prueba los permisos y la expulsión con una cuenta de prueba.

---

# FIJAS DE ÉLITE v1.9.0 — PAYPAL PRODUCCIÓN (DESACTIVADO POR DEFECTO)

Este proyecto completo se basa en v1.8.9. **Se entrega con Live BLOQUEADO por defecto.**
No se ha validado con la cuenta de Railway ni PayPal del propietario. No publiques un checkout
Live antes de realizar las comprobaciones y obtener aprobación expresa del proveedor
para vender pronósticos o asesoramiento relacionado con apuestas.

## Novedades

- **Separación irrevocable de entornos:** cada nueva orden PayPal se guarda como `sandbox` o `live`.
  Las órdenes de versiones anteriores se migran como `legacy` y **no** figuran en ventas Live.
  No se borran cuentas, pronósticos, membresías ni pagos anteriores.
- **Captura comprobada:** la orden, su ID local, el importe exacto en USD y el ID de captura
  se cotejan contra PayPal en el backend; nunca se confía en un retorno del navegador.
  Las renovaciones son transaccionales e idempotentes.
- **Webhook seguro:** `/api/payments/paypal/webhook` valida la firma de cada evento mediante
  PayPal, guarda su identificador para evitar duplicados y concilia capturas de órdenes aprobadas
  incluso si el cliente no vuelve a la web.
- **Reembolsos y disputas:** los reembolsos totales confirmados revocan el período correspondiente
  y conservan el historial de cobro; los parciales y disputas quedan destacados para revisión
  humana. **No se inicia ningún reembolso desde nuestra API.**
- **Notificaciones dentro del portal:** avisos de compra confirmada, reembolso, rechazo de captura
  y disputa; el panel Admin > Finanzas lista importes Live en USD, Sandbox en USD, solicitudes
  manuales verificadas en PEN, incidencias y eventos no conciliados. Los totales son **brutos**:
  no descuentan comisiones, impuestos, tasas bancarias ni disputas sin resolver.
- Registro de auditoría y protecciones de lista negra, rangos, membresías manuales,
  paneles oscuros y pronósticos anteriores preservados.

## Despliegue seguro — orden obligatorio

1. **Haz un backup de MySQL.** Sube todos los archivos a GitHub y espera Railway `Success`.
   Verifica `GET /health` ⇒ `"version":"1.9.0"`.
2. Conserva `PAYPAL_MODE=sandbox`, configura Client ID y Secret Sandbox en Railway.
   Usa `PAYPAL_ENABLE=true` únicamente si deseas que funcione Sandbox.
3. En **PayPal Developer → aplicación Sandbox → Webhooks**, registra:
   `https://lafijasdeelite-production.up.railway.app/api/payments/paypal/webhook`
   (ajusta el dominio si cambiaste la web).
   Elige eventos `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`,
   `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`,
   `PAYMENT.CAPTURE.REVERSED`, `CUSTOMER.DISPUTE.CREATED`,
   `CUSTOMER.DISPUTE.UPDATED` y `CUSTOMER.DISPUTE.RESOLVED` (según disponibilidad).
   Copia el **Webhook ID** de esa app a `PAYPAL_WEBHOOK_ID`. No es el Client ID.
4. Prueba con dos cuentas ficticias Sandbox distintas (vendedor y comprador):
   compra, renovación, cerrar navegador antes del retorno, captura duplicada,
   reembolso total, reembolso parcial y consulta de auditoría. En `Admin → Finanzas`,
   confirma que todas figuren como **Sandbox**, nunca Live.
   **Ojo:** el simulador de webhooks puede no superar la verificación remota de firmas;
   para probar el flujo completo usa eventos de transacciones reales en Sandbox.
5. Completa la verificación de cuenta empresarial real y comprueba por escrito con PayPal
   que la actividad de análisis/pronósticos deportivos es admisible.
   Revisa el reembolso/contracargo y la política comercial; estas operaciones pueden requerir
   atención del equipo de soporte.
6. Antes de Live, configura en PayPal Developer **la aplicación Live**, con Client ID, Secret
   y **Webhook ID Live diferente**. Registra la MISMA URL en la app Live con los eventos indicados.
   **Nunca mezcles claves de Sandbox y Live.** Configura `PUBLIC_BASE_URL` por HTTPS y una
   tasa de cambio `PAYPAL_PEN_PER_USD` validada para presentar precios correctos en USD.
7. **Último paso, solo tras todos los controles anteriores**: establece `PAYPAL_MODE=live`,
   `PAYPAL_ENABLE=true`, `PAYPAL_WEBHOOK_ID=ID_DE_WEBHOOK_LIVE` y
   `PAYPAL_LIVE_RELEASE_ACK=true` junto con las credenciales Live en Railway.
   Esta última variable es una confirmación explícita: de lo contrario, el checkout Live
   permanecerá deshabilitado incluso si la autenticación funciona.
8. Haz una compra Live pequeña con una cuenta compradora distinta de la vendedora.
   Verifica el pago en PayPal Business, el ID de captura en MySQL, la membresía y la
   sección financiera. **Nunca repitas el cobro si la confirmación se retrasa.**

### Variables en Railway (ejemplo sin secretos)

```env
NODE_ENV=production
PUBLIC_BASE_URL=https://lafijasdeelite-production.up.railway.app
PAYPAL_MODE=sandbox
PAYPAL_ENABLE=false
PAYPAL_CLIENT_ID=TU_CLIENT_ID_DEL_ENTORNO
PAYPAL_CLIENT_SECRET=TU_SECRET_DEL_ENTORNO
PAYPAL_WEBHOOK_ID=ID_DEL_WEBHOOK_DEL_ENTORNO
PAYPAL_PEN_PER_USD=3.50
PAYPAL_LIVE_RELEASE_ACK=false
```

**Nota:** el valor `3.50` es solo un ejemplo, no una cotización vigente.
Una tasa mal elegida puede cobrar más o menos de lo anunciado. Las claves de Live,
JWT_SECRET y MySQL deben permanecer en variables privadas; no se suben a GitHub.

## Limitaciones y seguridad pendiente

- Los reembolsos parciales y las disputas se marcan para revisión; **no** se resuelven ni
  reembolsan automáticamente, ni representan devolución inmediata de dinero.
- Un reembolso total o reversión de un pago nuevo elimina el acceso de **ese** período,
  pero no reestructura automáticamente la duración de otros períodos ya adquiridos.
- Las membresías VIP de prueba que ya fueron activadas en versiones anteriores pueden
  continuar activas en Live. Revisa esas cuentas y utiliza «Gestionar VIP» para retirar
  períodos de prueba si corresponde, **sin borrar su registro de pago**.
- Los pagos PayPal antiguos quedan como `legacy` (origen no comprobado), no se clasifican
  retrospectivamente como Live. El administrador debe revisarlos si hubo cobros históricos.
- Los registros de pagos manuales incluyen solicitudes históricas; no deben asumirse
  como ingresos reales sin revisar depósitos en Yape/Plin/banco.
- El **2FA, revisión de seguridad independiente, seguimiento de eventos no conciliados,
  copias de seguridad, política de reembolsos y conciliación con los extractos oficiales**
  siguen siendo tareas operativas antes de una apertura pública masiva.
- Para evitar dobles reembolsos, ejecuta devoluciones desde el sistema oficial PayPal,
  no desde este backend; sus webhooks actualizarán la contabilidad.

## Pruebas automáticas

`npm test` — pruebas de renovación, permisos, archivado, validación monetaria, separación
Live/Sandbox y escenarios de captura y reembolso. También ejecutar `node --check src/server.js`.
**No equivale a una prueba real de PayPal Live ni de Railway/MySQL.**

---

# Fijas de Élite v1.8.9 — Eliminar una membresía individual

Esta versión conserva todo lo incluido hasta la v1.8.8 y agrega la acción **Eliminar esta membresía**, dentro de **Admin → Gestionar VIP → Buscar cliente → Últimas membresías**.

## Funcionalidad

- Solo el **dueño** puede eliminar una membresía individual; analistas, moderadores y admins de pagos no pueden hacerlo.
- Solicita motivo y una segunda confirmación.
- Elimina **del panel** la membresía indicada mediante archivado lógico; la fila queda guardada para auditoría.
- Corta el acceso de ese período (sin borrar otras renovaciones); si existen renovaciones futuras estas conservan sus fechas originales.
- Si la solicitud Yape/Plin/transferencia aún está pendiente, pasa su pago a `rejected` para impedir una aprobación posterior.
- Si hay una orden PayPal **pendiente de confirmar**, no deja eliminar hasta resolverla en PayPal.
- Los pagos ya `verified` permanecen inalterados, y la eliminación **no reembolsa** automáticamente. El historial financiero y los registros de auditoría se mantienen.
- Los períodos archivados ya no se contabilizan para VIP ni aparecen en la lista de membresías del cliente. El cliente puede seguir viendo su historial de pagos.
- Agrega a MySQL de modo automático `archived_at`, `archived_by`, `archive_reason`, sin borrar tablas ni datos.

## Instalación

1. Subir todos los archivos del ZIP al repositorio GitHub reemplazando la versión previa.
2. Railway despliega con las mismas variables y MySQL.
3. Comprobar `/health` con `version: 1.8.9`.
4. Entrar como dueño al panel y usar **Gestionar VIP**. Probar primero con una cuenta de prueba.

No cambies PayPal de Sandbox a Live sin verificar requisitos comerciales, conciliación, reembolsos y manejo de disputas.

## Alcance de las pruebas

Se ejecutaron pruebas de helpers y sintaxis JavaScript. No se dispone de tu MySQL ni de tu Railway para probar la migración en producción. Se recomienda respaldo previo de MySQL.

---

# Fijas de Élite v1.8.8 — Gestión VIP manual

**Nueva versión:** desde Administración → **Gestionar VIP**, los cargos **Dueño**, **Admin general** y **Admin de pagos** pueden buscar a un cliente registrado por nombre, correo o ID y seleccionar:

- **Asignar VIP manualmente:** elige un plan activo (7/30/90 días u otro plan creado), escribe un motivo y confirma. Se agregan los días al vencimiento confirmado existente (o desde ahora si no tiene VIP). **No se crea ninguna transacción de pago ficticia.**
- **Retirar acceso VIP:** cancela todos los períodos confirmados actualmente vigentes o programados para el futuro, incluyendo renovaciones pagadas, con motivo y confirmación adicional. Se revoca el acceso a pronósticos VIP desde el servidor al siguiente acceso. **No elimina los comprobantes ni efectúa un reembolso.**
- **Historial:** cada alta o retiro queda en `audit_logs` con el responsable, destinatario y motivo. Los registros de membresía también identifican los períodos manuales y las revocaciones.
- **Lista negra:** no se permite otorgar VIP a un usuario bloqueado (Rank 0). El dueño debe levantar primero la suspensión.
- **Solicitudes pendientes:** no se alteran durante la revocación. Un pago posterior legítimamente confirmado puede volver a conceder VIP; revisa las solicitudes pendientes antes de revocar si ese comportamiento no es deseado.

### Actualización

1. Descarga el ZIP completo y sube su contenido a tu repositorio GitHub, reemplazando la versión anterior.
2. Railway desplegará automáticamente: `/health` deberá devolver `version: 1.8.8`.
3. No borres la base MySQL: `initializeDatabase()` agrega 6 columnas de control a `memberships` de forma incremental, sin eliminar membresías ni pagos anteriores.
4. Entra como dueño a **Gestionar VIP**, busca una cuenta de prueba, otorga un plan, comprueba **Mi membresía** del cliente; luego revócalo y verifica que los pronósticos VIP se bloqueen.
5. Comprueba en **Actividad** quién realizó los cambios.

**Nota sobre pagos reales:** cancelar acceso no implica devolución de dinero ni resolución de disputas. Si el cliente había pagado, aplica tu política comercial y gestiona por separado cualquier reembolso. Mantén PayPal en Sandbox mientras validas el sistema.

### Pruebas

`node --check src/server.js`, `node --check public/app.js`, `npm test` y revisión de ZIP. No equivalen a una prueba en Railway/MySQL o PayPal reales.

---

# Fijas de Élite v1.8.6 — Corrección de renovaciones VIP

Actualiza v1.8.5 sin perder datos, cuentas, cookies ni pagos anteriores. Mantiene PayPal Sandbox, Yape, Plin, transferencias y paneles premium.

## Error corregido

Antes, el pago de una renovación se marcaba como `verified` y se registraba una membresía nueva con `starts_at` igual al vencimiento actual. Esa estrategia **acumulaba los días**, pero el endpoint `/api/customers/dashboard` ignoraba la renovación porque su comienzo era futuro. Por eso mostraba el vencimiento antiguo pese al pago confirmado.

Ahora, si el cliente tiene un plan VIP vigente, el panel muestra inmediatamente el **vencimiento máximo de todas las renovaciones confirmadas**, junto al número de renovaciones programadas. La sección «Mi membresía» distingue entre una membresía vigente y las siguientes renovaciones confirmadas.

También:

- Los pagos PayPal repetidamente verificados son idempotentes; no añaden días otra vez.
- La conciliación de órdenes PayPal y la aprobación manual bloquean la fila del cliente durante el cálculo de días para evitar pérdidas de renovaciones simultáneas.
- El botón «Verificar mi último pago PayPal» busca primero órdenes pendientes, no se limita a mostrar un pago anterior ya verificado.
- Las cuentas que no tienen un VIP **vigente ahora** continúan sin acceso VIP aunque exista una membresía futura. No se adelanta la fecha de acceso.
- El sistema sigue aceptando las renovaciones ya registradas en MySQL: el nuevo dashboard las refleja **sin cambios manuales de base de datos**.

## Instalación

1. Extrae el ZIP y reemplaza el contenido del repositorio GitHub; **no borres la base de datos Railway**.
2. Espera a que Railway indique `Success` y abre `/health`. Debe responder con `version: 1.8.6`.
3. Abre la cuenta VIP que renovó y visita `Resumen` y `Mi membresía`. La fecha total debe sumar los días confirmados.
4. Si la fecha sigue incorrecta, revisa en el panel admin el registro del último pago: `verified` vs `pending`. **No repitas el pago**. Una autorización de PayPal por sí sola no acredita el abono.
5. Mantén `PAYPAL_MODE=sandbox` y `JWT_SECRET` sin cambios.

## Verificación local

`npm test` ejecuta pruebas sin MySQL ni PayPal para el cálculo de acumulación de fechas. `node --check src/server.js` verifica la sintaxis. **No equivale a probar un cobro real**; las operaciones con PayPal Sandbox y la base de datos desplegada deben verificarse después de instalar.

Aviso: El registro de pagos verificables, el acceso VIP y el saldo del plan se mantienen en MySQL, nunca en cookies.


## v1.8.7 — Rank 0 (lista negra) y membresías ordenadas

- Desde **Administrador → Personal**, el dueño puede elegir **Rank 0 · Lista negra** y registrar un motivo obligatorio.
- La suspensión se guarda en `users.account_status`, `blacklist_reason`, `blacklisted_at` y `blacklisted_by` (migración automática al iniciar). **No borres ni recrees la base de datos.**
- La cuenta bloqueada no puede iniciar sesión, usar su sesión anterior ni acceder a pronósticos gratuitos/VIP o iniciar pagos. También se desactivan sus permisos administrativos. La comprobación se realiza en el backend y se registra una auditoría.
- El dueño puede quitar el bloqueo asignando nuevamente **Cliente** u otro cargo permitido desde la lista de personal. No es posible bloquear al dueño.
- Las membresías confirmadas y pagos históricos se preservan. El tiempo de VIP sigue transcurriendo durante el bloqueo; si hay pagos reales, revisar manualmente cualquier incidencia o eventual reembolso conforme a la política comercial.
- **Mi membresía** ahora separa VIP activo, renovaciones confirmadas, solicitudes pendientes (desplegable) e historial (desplegable). Los registros pendientes ya no ocupan toda la pantalla.
- Las consultas de membresías se limitan por categoría: 40 confirmadas, 20 pendientes y 20 históricas. No se modifica el cálculo de renovaciones ni la conciliación de PayPal.

### Prueba recomendada (Sandbox)
1. Instala el proyecto y comprueba `/health` versión 1.8.7. Confirma primero que puedes entrar como dueño.
2. Registra una cuenta de cliente de prueba; desde el panel de dueño asigna Rank 0 con motivo.
3. Comprueba que la sesión ya iniciada de ese cliente deja de acceder a pronósticos y pagos; el nuevo inicio de sesión recibe HTTP 403.
4. Como dueño, asigna **Cliente** a la misma cuenta y confirma que vuelve a poder entrar. No elimines cuentas ni borres MySQL.
5. Como VIP de prueba, verifica que «Solicitudes pendientes» esté cerrado inicialmente y que las renovaciones confirmadas se muestren arriba.

En producción, define y publica una política de sanciones, apelaciones, membresías y reembolsos. Mantén PayPal en Sandbox hasta completar las pruebas y aprobación comercial.


## v2.1.5 — Fichas de análisis completas para clientes
- La sección **Pronósticos** desglosa selección principal, cuota (cuando esté verificada), líneas de goles por equipo y total, frecuencia H2H de ambos marcan, marcador orientativo, margen y los riesgos.
- Los datos se consultan del JSON de evidencia de `football_candidates` por `prediction_id`. **No se borra ni modifica MySQL; no requiere migración.**
- Los pronósticos manuales o antiguos sin evidencia estructurada mantienen su análisis habitual; los detalles de goles no se inventan.
- Las tarjetas VIP bloqueadas no reciben datos exclusivos desde el backend, ni siquiera en la respuesta JSON.
- Los informes completos de nuevas selecciones automáticas se incluyen también en Telegram VIP, con límite de tamaño por mensaje.
- La API solo recomienda líneas de más/menos goles: no proporciona cuotas para esos mercados ni asegura un marcador exacto. La muestra H2H no es una probabilidad calibrada.
- Se consulta H2H como dato complementario para un candidato elegible cuando falten antecedentes (a lo sumo una consulta por escaneo, respetando la cuota).
- Los nuevos reportes se muestran **después de analizar, guardar y aprobar una propuesta**. El diagnóstico de API no publica nada. Los datos de los pronósticos publicados anteriormente en v2.1.4 también aparecen si su `football_candidates.evidence_json` contiene la proyección.

- Se versionan los CSS y scripts de la portada y ambos dashboards para evitar cachés antiguos.


## v2.1.7 — Horario y cuenta regresiva

El campo `match_date` se almacena en UTC. En la web se muestra el horario de Perú (America/Lima) y una cuenta regresiva dinámica que se actualiza cada 30 segundos. Los mensajes Telegram muestran una estimación del tiempo restante **al momento de envío**. No se presenta como información de marcador en vivo.

- Cliente gratuito y VIP: `Pronósticos` → tarjeta de inicio. VIP bloqueado solo ve datos públicos del encuentro.
- Dueño: `Análisis automático` → candidatos y hora de inicio. Personal: `Mi Telegram VIP` → ficha.
- La primera vez tras instalar, forzar actualización (`Ctrl+F5`) para evitar caché.


## v2.1.7 — Publicación en Telegram segmentada

- **Fijas de Élite Comunidad:** al publicar pronóstico gratuito, envía el contenido completo y la advertencia de riesgo alto. Los pronósticos gratuitos automáticos tienen estimación de proveedor del **40–50%** y no representan una tasa de acierto observada.
- **Canal privado VIP:** pronósticos completos solo para VIP; el grupo público recibe **como máximo un adelanto genérico en 7 días**, sin partido, selección ni cuota.
- **Control:** se añadió `telegram_vip_teaser_gate` en MySQL, automáticamente y sin borrar datos. La reserva semanal se realiza antes del envío para no duplicar mensajes ante reinicios.
- Las propuestas gratuitas pueden publicarse automáticamente aun sin cuota: se indica explícitamente que no existe cuota verificada. Las VIP automáticas sí exigen cuota del proveedor.
- Publicación automática: `FOOTBALL_AUTO_SCAN=true`, `FOOTBALL_AUTO_PUBLISH=true`; para pruebas mantener `FOOTBALL_AUTO_PUBLISH=false`.
- La variable `FOOTBALL_PUBLIC_FREE_PICKS` ya no hace falta: las selecciones gratuitas publicadas van completas al grupo.
- Las tasas de acierto SOLO se obtienen de resultados finalizados registrados, y la confianza estimada no garantiza una ganancia.


## Cambios v3.2.6 — mercados N-FORCE

El motor Poisson v1.2 calcula probabilidades de 1X2, goles, ambos marcan y doble oportunidad usando exclusivamente partidos terminados anteriores a la fecha del encuentro. Elige **una propuesta** por encuentro; si un mercado alcanza el umbral VIP y demuestra diferencia frente a la frecuencia histórica de la liga puede pasar a borrador VIP. **Una probabilidad del modelo no es tasa real de aciertos ni rentabilidad:** las estimaciones actuales no están calibradas.

Las lesiones y alineaciones NO se importan; si no existen datos, se indica su ausencia. La publicación continúa siendo manual salvo activación expresa. No elimina propuestas antiguas: las que estén publicadas o descartadas permanecen intactas. Tras desplegar el ZIP, importa datos, ejecuta backtesting y vuelve a analizar para recalcular borradores. El informe de escaneo incluye `already_present`, `eligible`, `updated_existing_drafts` y `filter_examples` para explicar los ceros. Los límites y detalles de licencias y procedencia siguen documentados internamente.

## Cambios v3.3.1 — Hora de inicio de los pronósticos

En Panel → Pronósticos → Últimos pronósticos, cada ficha publicada muestra fecha, hora de inicio del encuentro (hora de Perú), y un aviso si la hora prevista ya pasó. Este aviso no afirma que el partido haya terminado ni actualiza automáticamente un resultado. La portada también muestra el horario del encuentro en los adelantos, sin exponer la selección de los VIP bloqueados. No requiere cambios de MySQL ni variables de entorno.

### Presentación de membresías v3.5.0 (historial)
En v3.5.0 GOLD se mostró solo como prelanzamiento. **Esta limitación quedó sustituida por v3.5.1**, que habilita la compra GOLD, el acceso vinculado y el envío privado del bot. No se requiere un canal GOLD. Las tasas públicas de acierto solo se destacan cuando hay al menos 30 resultados decididos por categoría.


## ÉLITE GOLD por mensaje privado (v3.5.1)

GOLD es una membresía pagada, independiente de VIP, con un precio inicial de S/59.90 por 30 días que se puede administrar en el panel. Todos los planes anteriores de MySQL siguen siendo VIP.

- Cuando el dueño **publica manualmente** un pronóstico GOLD desde Panel > Pronósticos, se guarda en la web y se crea una fila de entrega por cliente con GOLD o VIP activo y Telegram vinculado.
- El bot solo envía la selección GOLD al privado del usuario autorizado, **nunca al grupo o canal GRATIS**. Los pronósticos VIP se mantienen en el canal VIP.
- El bot de Telegram **no puede escribirle** a quien no lo haya iniciado: el cliente debe entrar en Clientes > Telegram > Vincular, abrir el enlace y pulsar Iniciar en Telegram.
- Los envíos se hacen en lotes; el acceso y vínculo se revalidan justo antes de enviarlos. Tras un fallo ambiguo, no se reintenta para evitar duplicados; el dueño ve el diagnóstico en Panel > Telegram > GOLD.
- Las compras GOLD pueden solicitarse usando los flujos de pago actuales. La membresía solo se activa cuando el pago se verifica en el servidor. Los pagos VIP se mantienen independientes.
- Si la membresía expira, no se envían nuevas selecciones. VIP recibe GOLD también. Las selecciones GOLD se consultan desde el panel del cliente solo con permisos GOLD/VIP.
- Por ahora la **generación automática de candidatos GOLD desde N-FORCE está pendiente**. El dueño clasifica y aprueba manualmente GOLD; no se reetiquetan predicciones anteriores.

**Prueba segura:** configura Telegram, vincula una cuenta de prueba, activa el plan GOLD por un pago de prueba verificado, publica manualmente una selección GOLD futura y comprueba el chat privado de Telegram. No hace falta añadir un canal GOLD.


## GOLD automático y VIP premium — v3.5.2

- Desde esta versión, nuevas propuestas que el modelo seleccionaría como `free` se etiquetan `gold` al guardarlas, conservando sus probabilidades, selección y evidencia originales. No se altera el motor para fabricar más pronósticos ni para prometer resultados.
- La aprobación N-FORCE publica GOLD mediante la cola de mensajes privados ya disponible; suscriptores GOLD o VIP vigentes y con Telegram vinculado lo recibirán (requiere bot iniciado). No se publican fijas GOLD completas en el canal o grupo público.
- Para borradores antiguos que aún figuren `free`, ejecutar un escaneo o **Actualizar propuesta** antes de aprobar; mientras tanto se bloquea su publicación. Los pronósticos gratuitos ya publicados, con sus resultados, se preservan sin relabeling retroactivo.
- Precios recomendados VIP: 7 días S/89.90, 30 días S/249.90 y 90 días S/649.90. Un cambio de precios se aplica **una única vez** al arrancar en Railway sobre planes VIP activos con esas duraciones, subiéndolos hasta un mínimo por duración y dejando intactos los precios superiores. Planes de duraciones diferentes y GOLD no se modifican. Pagos históricos o solicitudes pendientes no se recalculan.
- El historial público sigue distinguiendo `free` (histórico), `gold` y `vip`; nunca se omiten pérdidas. VIP mantiene sus filtros estrictos y puede no generar ninguna fija.


## v3.5.5 · Revisión de propuestas incompatibles

En el siguiente escaneo efectivo de N-FORCE se recalcula el partido desde los datos vigentes. Si una propuesta descartada conserva una versión de modelo anterior o un formato legado que requiere migración a GOLD, puede volver al estado de borrador **solo si sigue siendo un encuentro futuro con horario válido y el modelo actual vuelve a proponer una selección apta**. No resucita automáticamente pronósticos publicados ni partidos fuera de la ventana. La recuperación es idempotente (mismo fixture) y se registra en `audit_logs`.

Los descartes manuales nuevos quedan diferenciados con `evidence_json.discard_reason = "manual"`, y las incompatibilidades identificables usan `"version_incompatible"`. Los registros históricos no etiquetados se recuperan únicamente cuando existe evidencia de incompatibilidad del modelo o del formato anterior; si no es posible identificar la causa, permanecen descartados para no anular decisiones del propietario. El motor sigue sujeto al intervalo de escaneo y al límite de partidos configurados.
