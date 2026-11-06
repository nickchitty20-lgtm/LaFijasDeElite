# Fijas de Élite v2.0.4 — Forzar cambio de Telegram sin expulsión (solo creador)

- Se mantiene toda la v2.0.3, incluyendo la corrección de desplazamiento horizontal móvil.
- Dueño → Telegram → **Forzar cambio de Telegram · Solo creador**: introduce ID del cliente, motivo, tu contraseña y confirma la operación.
- El cliente queda desvinculado y **puede vincular otra cuenta inmediatamente**. El bot **no expulsa** al Telegram anterior como consecuencia de este cambio.
- El miembro anterior queda documentado en `telegram_owner_preserved`; mientras la cuenta del cliente conserve VIP y no esté en Rank 0, las auditorías periódicas preservan expresamente al antiguo.
- Si el VIP vence o el usuario pasa a Rank 0, la limpieza habitual del canal sí puede retirarlo; la excepción nunca garantiza VIP ilimitado.
- Un máximo de una cuenta antigua se preserva por cliente. Antes de otro cambio, el creador debe retirar el anterior manualmente (o esperar a que salga), y comprobar su salida desde **Comprobar Telegram anterior conservado**.
- La nueva vinculación sigue usando un enlace temporal `/start`, el ID numérico de Telegram y la comprobación de VIP. El miembro antiguo NO recibe nuevos enlaces. No se modifica el grupo público.
- Cada uso registra actor, motivo e ID previo en `audit_logs` y `telegram_unlink_events`. Solo el dueño autenticado puede ejecutar la operación, confirmando también su contraseña.
- Es una **excepción deliberada** a la regla de una sola cuenta por VIP: durante un tiempo pueden existir dos miembros dentro del canal.

## Instalación

1. Respalda MySQL y sube todo el ZIP al repositorio GitHub que despliega Railway.
2. Comprueba Railway Success y `/health` con versión **2.0.4**.
3. No borres las variables existentes de PayPal, Telegram o JWT. La migración crea una tabla adicional sin eliminar datos anteriores.
4. Prueba con un cliente VIP y dos cuentas Telegram: fuerza desvinculación desde la cuenta del dueño, verifica que el Telegram antiguo siga en el canal y permite al cliente abrir el nuevo enlace desde la web.
5. Para comprobar que un Telegram anterior fue retirado, usa la función del dueño; la API no puede enumerar todos los miembros de un canal.

## Importante

- La expulsión manual del antiguo solo la realiza el creador desde Telegram. El bot todavía aplica las limpiezas normales por vencimiento VIP o Rank 0.
- Si la cuenta anterior estaba en Rank 0, no se permite forzar el enlace mientras esté bloqueada.
- Hay que validar las operaciones y los permisos de Telegram en Railway; las pruebas locales no hacen llamadas reales a la API.
