# Doom en la barra de Omarchy

Estado de la API local y clic izquierdo para abrir **Doom completo** en terminal.
No arranca el backend, no genera inferencias ni modifica el perfil o las herramientas.

## Requisitos

Omarchy con Quickshell, `omarchy-launch-terminal`, una terminal configurada,
`curl`, GNU coreutils (`timeout`, `/usr/bin/test`) y el proyecto Doom existente
con su ejecutable `doom`. Node solo se necesita para las pruebas.

Antes de usarlo, inicia **manualmente** `./server.sh` desde el proyecto si necesitas
el backend. El widget nunca ejecuta ese comando. No hay autostart, daemon,
controles de modelos/GPU, proveedores remotos ni conexiones a redes externas.
Solo consulta metadatos en `http://127.0.0.1:18080/health` cada 15 segundos;
cada consulta tiene un límite de tiempo y no se solapa con otra.
Los cambios de configuración pendientes se agrupan: tras terminar ambos procesos,
se consultan los últimos ajustes; los resultados anteriores no habilitan el lanzamiento.

## Instalar y configurar

1. Copia esta carpeta como archivos reales (sin enlaces simbólicos ni Git anidado)
   a `~/.config/omarchy/plugins/local.dr-doom/`. No hace falta un repositorio Git.
2. Valida: `omarchy plugin validate ~/.config/omarchy/plugins/local.dr-doom`.
3. Conserva una copia de `shell.json` y todas sus entradas existentes. Añade **una**
   entrada en `bar.layout.right` de `~/.config/omarchy/shell.json`:

   ```json
   { "id": "local.dr-doom", "launcherPath": "/ruta/absoluta/local-llm/doom", "healthPort": 18080 }
   ```

4. Ejecuta `omarchy-shell shell rescanPlugins` y `omarchy-shell shell reloadConfig`.

Las opciones van inline, no en un objeto `config`. `launcherPath` empieza vacío:
usa una ruta absoluta ejecutable de confianza; espacios y comillas son literales,
no comandos de shell. `healthPort` acepta enteros 1–65535 (predeterminado 18080).
El puerto opcional permite pruebas aisladas; el host siempre es loopback, nunca
una URL remota. No se cambia la dirección usada por el Doom existente.

## Uso y comprobación

| Texto | Significado |
|---|---|
| Doom · listo | HTTP 200 con JSON `status: "ok"` |
| Doom · cargando | HTTP 503 con `error.message: "Loading model"` |
| Doom · sin conexión | Fallo de conexión, JSON inválido u otra respuesta |

El widget sigue visible, atenuado y con tooltip cuando no puede lanzar.
Solo el clic izquierdo abre Doom, y únicamente con API lista, configuración válida
y ejecutable disponible. Se comprueba de nuevo el ejecutable antes de lanzar.
No hay popup. “Listo” no demuestra rendimiento, GPU ni aceptación del contexto 32K.

IPC de diagnóstico del widget **montado**:
`omarchy-shell local.dr-doom status` devuelve JSON sin entorno privado;
`omarchy-shell local.dr-doom refresh` actualiza las instancias de cada monitor.
`omarchy-shell local.dr-doom launch` es una solicitud explícita que usa la misma
guarda que el clic; no se difunde a otros monitores para evitar terminales duplicadas.
`launchCount` cuenta solicitudes enviadas: la API nativa no confirma la ejecución
mediante un valor de retorno; no equivale a una respuesta del modelo.
Un destino inexistente puede devolver texto de error con código 0: inspecciona la salida.

Pruebas puras: `node --test integrations/omarchy-dr-doom/tests/model.test.cjs`
desde la raíz del proyecto. No sustituyen la prueba E2E del widget real con un
lanzador de prueba y un servidor loopback aislado; nunca uses el modelo para eso.

## Retirar

Elimina únicamente la entrada `local.dr-doom` de la barra y recarga la configuración.
Después retira su carpeta instalada y ejecuta `omarchy-shell shell rescanPlugins`.
Conserva el resto del escritorio y el proyecto Doom. No hay servicio que detener.

MIT se aplica solo a este plugin local; Omarchy y Doom conservan sus licencias.
