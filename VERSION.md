# Fijas de Élite v2.2.2 — Reintentos tras cero pronósticos

Corrección de la v2.2.1. Si el escaneo completado no generó propuestas, el bot ahora puede volver a intentar después de 60 minutos (30 cuando no analizó partidos), en vez de bloquear automáticamente cuatro horas. Los controles se ejecutan cada 15 minutos, respetando siempre la cuota del proveedor. También filtra candidatos ya procesados ANTES de seleccionar los 10 partidos del siguiente escaneo, para explorar otros encuentros. El panel indica el próximo intento, estadísticas de descartes y motivos por los que no se publicó una propuesta.

Las propuestas realmente creadas mantienen el intervalo de cuatro horas. No se reducen exigencias estadísticas ni se fabrican resultados. No se han verificado los tokens, datos ni el despliegue de Railway del usuario.
