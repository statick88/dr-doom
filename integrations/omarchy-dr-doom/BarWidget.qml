import QtQuick
import Quickshell
import Quickshell.Io
import qs.Ui as Ui
import "Model.js" as Model

Ui.BarWidget {
    id: root
    moduleName: "local.dr-doom"
    readonly property var config: Model.configuration(settings)
    property string apiState: "unavailable"
    property bool executable: false
    property bool pending: false
    property string launchResult: "sin solicitud"
    property int launchCount: 0
    property int queryCount: 0
    property int refreshVersion: 0
    property bool refreshQueued: false
    readonly property bool canLaunch: Model.launchArgv(apiState, config, executable, pending).length > 0

    function checkExecutable(forLaunch) {
        if (check.running || !config.valid) return false
        check.version = refreshVersion
        check.path = config.launcherPath
        check.forLaunch = forLaunch
        check.command = ["/usr/bin/test", "-x", check.path]
        check.running = true
        return true
    }

    function refresh() {
        refreshVersion++
        refreshQueued = true
        apiState = "unavailable"
        executable = false
        Qt.callLater(root.drainRefresh)
    }

    function drainRefresh() {
        if (query.running || check.running) return
        if (!refreshQueued) return
        refreshQueued = false
        checkExecutable(false)
        var argv = Model.queryArgv(config.healthPort)
        if (argv.length === 0) return
        query.version = refreshVersion
        query.port = config.healthPort
        query.command = argv
        queryCount++
        query.running = true
    }

    function launch() {
        if (!canLaunch || check.running) {
            launchResult = "bloqueado"
            return
        }
        pending = true
        launchResult = "verificando"
        if (!checkExecutable(true)) {
            pending = false
            launchResult = "bloqueado"
        }
    }

    onConfigChanged: refresh()
    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    Process {
        id: check
        property string path: ""
        property int version: -1
        property bool forLaunch: false
        onExited: function(exitCode) {
            Qt.callLater(root.drainRefresh)
            root.executable = exitCode === 0 && check.version === root.refreshVersion
                && check.path === root.config.launcherPath && root.config.valid
            if (!check.forLaunch) return
            root.pending = false
            var argv = Model.launchArgv(root.apiState, root.config, root.executable, false)
            root.launchResult = "bloqueado"
            if (argv.length > 0) {
                Quickshell.execDetached(argv)
                root.launchResult = "enviado"
                root.launchCount++
            }
        }
        stdout: StdioCollector {}
        stderr: StdioCollector {}
    }

    Process {
        id: query
        property int port: 0
        property int version: -1
        stdout: StdioCollector { id: response; waitForEnd: true }
        stderr: StdioCollector {}
        onExited: function(exitCode) {
            root.apiState = query.version === root.refreshVersion && query.port === root.config.healthPort
                ? Model.health(exitCode, response.text) : "unavailable"
            Qt.callLater(root.drainRefresh)
        }
    }

    Timer {
        interval: 15000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.refresh()
    }

    IpcHandler {
        target: "local.dr-doom"
        function status(): string {
            return JSON.stringify({ state: root.apiState, configured: root.config.valid,
                executable: root.executable, pending: root.pending, querying: query.running,
                queryCount: root.queryCount, launchCount: root.launchCount,
                launchResult: root.launchResult, healthPort: root.config.healthPort })
        }
        function refresh(): void { root.broadcast("refresh") }
        function launch(): void { root.launch() }
    }

    Ui.WidgetButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: root.apiState === "ready" ? "Doom · listo"
            : root.apiState === "loading" ? "Doom · cargando" : "Doom · sin conexión"
        dimmed: !root.canLaunch
        pressable: root.canLaunch
        tooltipText: !root.config.valid ? "Configura launcherPath absoluto y healthPort válido."
            : root.apiState !== "ready" ? "API local no lista. Inicia manualmente ./server.sh en el proyecto."
            : !root.executable ? "El lanzador configurado no es ejecutable."
            : "API lista; clic izquierdo abre Doom completo. No verifica rendimiento ni contexto 32K."
        onPressed: function(mouseButton) { if (mouseButton === Qt.LeftButton) root.launch() }
    }
}
