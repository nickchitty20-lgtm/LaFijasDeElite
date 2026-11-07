# v3.2.8.2 — Avisos comunitarios de novedades

- Las fijas GRATIS se publican completas en el canal oficial y generan un aviso breve en el grupo con el enlace del canal.
- Las fijas VIP siguen completas solo en el canal privado y generan un aviso breve en el grupo con enlace a la portada de la web; el canal GRATIS conserva su adelanto VIP.
- El bot comprueba que `TELEGRAM_FREE_CHAT_ID` sea realmente un grupo y nunca lo usa como fallback para pronósticos completos.
- Los anuncios de grupo se registran una vez por predicción; fallos de Telegram en el grupo no afectan al estado de publicación principal ni se reintentan a ciegas.
- Migración aditiva automática de la tabla `telegram_community_announcements`, con soporte de retirada de avisos. Sin nuevas variables de entorno.

# v3.2.8.1 — Publicación pública solo en el canal

- Eliminado el fallback automático a `TELEGRAM_FREE_CHAT_ID`. El grupo es únicamente un enlace comunitario.
- Se admite `@FijasDeEliteOficial` como destino del canal, y se prioriza `TELEGRAM_FREE_CHANNEL_URL` cuando corresponde a un canal público.
- `getChat` confirma el tipo real `channel` y contrasta su nombre; no se envía una fija a un grupo ni a un destino diferente sin detectarlo.
- El panel privado del dueño incorpora pruebas de permisos (`getChatMember`) y un mensaje de prueba expreso. Los errores son visibles en el panel, sin mostrar el token.
- Se preservan los envíos VIP privados y los adelantos VIP al canal oficial. El historial no se reenvía automáticamente para evitar duplicados.
- Corrección de caché del panel. Sin migración de base de datos.

# v3.2.8 — Telegram canal GRATIS principal + grupo extra

- Nueva configuración `TELEGRAM_FREE_CHANNEL_CHAT_ID` y `TELEGRAM_FREE_CHANNEL_URL`: el canal recibe las fijas GRATIS y los adelantos públicos VIP; el grupo se conserva como comunidad secundaria.
- Se mantiene el grupo actual como respaldo hasta configurar un ID de canal real. Evita duplicar cada pronóstico entre canal y grupo para concentrar las visualizaciones en el canal.
- Portada y panel del cliente enlazan al canal GRATIS y al grupo de comunidad, usando URLs de Telegram validadas en el servidor.
- El administrador ve por separado el estado del canal GRATIS, grupo extra y canal VIP.
- Se registra `chat_id` para nuevos adelantos VIP, evitando intentar borrar un mensaje del canal equivocado. Migración aditiva automática de MySQL sin eliminar publicaciones anteriores.
- El canal VIP privado, login único, N-FORCE, pagos y permisos permanecen intactos.

# v3.2.7.2 — inicio de sesión único (sin /admin.html)

- El pie de página público ya no tiene botón de Administración.
- El panel se ofrece por `/panel`, previa autorización como personal en el servidor.
- Un único formulario de inicio de sesión en portada tanto para usuarios como para administradores.
- Se conserva la comprobación de roles y la validez de sesión en todas las APIs administrativas.
- Se elimina el antiguo HTML estático público de administración.
- No necesita nuevas variables ni migraciones.

# v3.2.7.1 — corrección de espacio superior en móvil

- La ventana de inicio de sesión y registro ahora se sitúa cerca del borde superior en pantallas pequeñas en lugar de centrarse con un hueco vacío.
- En móviles de poca altura se evita que el bloque decorativo crezca a 480 px por una regla conflictiva.
- Al entrar directamente en `/clientes.html`, el formulario se muestra después de la cabecera, sin el hero promocional delante. En escritorio se conserva el diseño.
- Solo cambia la presentación móvil. Sesiones, pagos, recuperación, suscripciones, Telegram y motor N-FORCE no se modifican. No requiere migración de base de datos.
- Versiones de CSS actualizadas para evitar cachés antiguas.

# v3.2.7 — acceso en portada y rediseño premium de clientes

- Inicio de sesión, registro y recuperación desde un modal accesible en la **portada** (`/`), sin navegación previa a `/clientes.html`.
- Tras iniciar sesión, el cliente entra a su panel privado; las cuentas administrativas entran a `/admin.html`. Las sesiones siguen usando la cookie segura validada por el servidor, sin guardar contraseñas en el navegador.
- La elección de planes VIP desde la portada conserva el `plan_id` y abre directamente el área de pagos del panel **después del inicio de sesión**, sin activar membresías ni cobrar automáticamente.
- `/clientes.html` se conserva como panel privado, recuperación de contraseña y retorno de PayPal; se moderniza con la identidad visual de la portada, tarjetas y animaciones, navegación adaptable al móvil y opción de movimientos reducidos.
- Se preservan los formularios, endpoints, permisos, base de datos, pagos, membresías, Telegram y motor N-FORCE de la versión anterior; no requiere migración MySQL ni nuevas variables.
- Para desplegar: sustituir los archivos anteriores y comprobar `GET /health` → `3.2.7`; recarga la web si está en caché.
- Pruebas del proyecto y pruebas visuales en navegador usan datos simulados para la parte de autenticación. No sustituyen probar credenciales reales y pagos en Railway.

# v3.2.6.1 — enlaces de Telegram a la portada

- Los anuncios del bot en los grupos públicos y los adelantos VIP ahora enlazan únicamente a la raíz de `PUBLIC_BASE_URL` (`https://tu-dominio/`).
- Los avisos privados del bot también usan el inicio, sin añadir `/clientes.html`.
- No se modifican los enlaces de pago PayPal, restauración de contraseña o navegación interna; dependen de las rutas de clientes.
- No requiere cambios de MySQL, nuevas variables ni regenerar el bot. Desplegar el código y usar `PUBLIC_BASE_URL=https://tu-dominio` (sin path).
- Los mensajes ya enviados en Telegram conservan sus enlaces antiguos.

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
