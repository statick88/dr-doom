# Flujos Dr. Doom

`doom` ejecuta el arnés Gentle completo dentro de la imagen desechable `dr-doom-gentle:4.6.0`. El tema Dr. Doom es visual; no modifica la autorización.

## Estado funcional verificado y límites

**Acceptance profile: 32K full harness; no reduced harness. One synthetic CPU model → read → final scenario independently accepted on 2026-11-06; interactive performance is not accepted and remains resource-dependent.** La candidata seleccionada explícitamente completó el recorrido en **45 min 57 s**, sin reducir modelo, contexto ni arnés. No valida todas las herramientas, los flujos completos ni la eficacia de una evaluación. La aceleración GPU queda fuera de esta versión experimental CPU; no se declara validación térmica ni aceleración equivalente. No se declara PASS sin observar el flujo completo.

Una prueba CPU anterior agotó 30 minutos sin respuesta completa ni ejecución de herramientas; ese fallo histórico no se convierte retroactivamente en éxito. La nueva política local de 3600 segundos y la candidata verificada permitieron completar el escenario posterior. No es un benchmark completado ni demuestra falta de RAM; tampoco permite prometer latencia o aceleración Vulkan. Las comprobaciones offline, mock y estáticas no prueban inferencia, cabecera ni salida normal del TUI. No reduzcas el contexto ni retires herramientas o recursos del arnés para presentar una prueba equivalente.

## Inicio

1. Completa [instalación e integridad](install.md); inicia el modelo local con `./server.sh` (sólo `127.0.0.1:18080`).
2. Usa el `package-lock.json` suministrado: el Dockerfile ejecuta `npm ci --ignore-scripts --omit=dev`, sin regenerarlo. Construye y verifica una candidata con una etiqueta nueva siguiendo [instalación](install.md#select-the-image-deliberately); selecciona su ID inmutable completo con `DOOM_LOCAL_IMAGE_ID`. No reemplaces una imagen instalada: la etiqueta canónica anterior se conservó.
3. Ejecuta `./doom`, `./doom ctf`, `./doom pentest` o `./doom redteam`.

El directorio desde donde invocas `doom` no se monta. El único trabajo persistente del laboratorio es `harness/doom-workspace/`; no copies ahí secretos ni evidencia de evaluación sin una decisión separada.

## Comandos disponibles

Sin flujo inicial, usa `/ctf`, `/pentest` o `/redteam`. Cada plantilla contiene instrucciones directas del flujo. Al iniciar con `doom ctf`, `doom pentest` o `doom redteam`, la guía y el cuerpo de la skill seleccionada se incorporan al prompt del sistema antes de la tarea del usuario; no se encola un comando de flujo posterior. Conservan los límites de alcance, evidencia y stop rules. No instala un catálogo de scanners: la imagen declara sólo Node, Git, Python 3, herramientas de compilación básicas, `ripgrep` y `fd-find` (expuesto como `fd`). Las skills describen método; no prueban autorización, vulnerabilidad ni impacto.

## Límite de seguridad

El contenedor no tiene red, capacidades, Docker socket, credenciales ni montajes del host salvo su workspace y un socket temporal. El socket sólo retransmite al modelo local fijo; no permite destinos, puertos ni tráfico arbitrario. Para PoCs de kernel o privilegiados usa una VM desechable aprobada. El perfil completo requiere 32768 tokens, no 8192. La configuración productiva sigue siendo CPU; las recetas GPU y el modo eco no validado quedan fuera de esta versión. La política local usa 3600 segundos; los valores de API opcional permanecen en 1800 segundos. Ninguno de esos límites constituye por sí solo un presupuesto de prueba ni autoriza reintentos, nuevas solicitudes o promoción de imágenes. La aceptación nativa y la publicación siguen siendo decisiones separadas.
