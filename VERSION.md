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
