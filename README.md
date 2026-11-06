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
