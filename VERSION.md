# Fijas de Élite v2.1.8 — Anuncio VIP por cada publicación

- Cada pronóstico VIP publicado se envía **completo al canal VIP** y genera **un adelanto limitado en el grupo Fijas de Élite Comunidad**.
- El adelanto puede mostrar los equipos, la liga y el horario si son datos seguros del partido, pero nunca incluye la selección, cuota, probabilidades, mercados de goles, marcador ni análisis exclusivo.
- Se eliminó el límite de un adelanto cada siete días: **uno por cada nuevo pronóstico VIP**.
- Nueva tabla `telegram_vip_public_announcements`: deduplicación por `prediction_id`, resistente a reinicios de Railway. El antiguo `telegram_vip_teaser_gate` permanece intacto y sin uso para preservar la compatibilidad.
- Si el envío al grupo falla, el envío al canal VIP queda intacto. Para evitar duplicados, los fallos ambiguos no se reintentan automáticamente.
- Los pronósticos GRATIS completos continúan publicándose en el grupo gratuito. Se conservan controles de roles y bloqueo VIP.
- No se anuncian retrospectivamente todos los pronósticos VIP antiguos: aplica a nuevas publicaciones.

# Fijas de Élite v2.1.7 — Comunidad gratis + adelantos VIP ocasionales

- El motor clasifica como **GRATIS** los mejores resultados 1X2 con **estimación no calibrada entre 40% y 50%**, margen >=12 puntos y al menos dos familias de evidencias. Una estimación NO es una tasa real de aciertos.
- La clasificación **VIP** conserva umbral >=72%, margen >=18 y evidencia >=2. Solo pronósticos VIP con cuota real pueden publicarse automáticamente.
- Las publicaciones **GRATIS completas** se envían a `TELEGRAM_FREE_CHAT_ID` (manuales y automáticas); se muestra aviso de riesgo alto. Las VIP completas van exclusivamente a `TELEGRAM_VIP_CHAT_ID`.
- De las VIP se envía un adelanto público **como máximo una vez cada 7 días**, sin equipos, mercado, cuota, goles ni selección. El límite se mantiene en MySQL al reiniciar Railway.
- La publicación automática de GRATIS puede funcionar sin cuota del bookmaker; no se inventa ninguna. La variable `FOOTBALL_PUBLIC_FREE_PICKS` es obsoleta.
- Para automatizar: `FOOTBALL_AUTO_SCAN=true` y `FOOTBALL_AUTO_PUBLISH=true`; en pruebas mantener false hasta comprobar mensajes y filtros.
- La búsqueda puede descartar todos los partidos sin inventar pronósticos, y no promete 99% de éxito VIP ni 50% de precisión gratis.
