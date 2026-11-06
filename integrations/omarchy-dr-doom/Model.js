function validPort(port) {
    return typeof port === 'number' && isFinite(port)
        && Math.floor(port) === port && port >= 1 && port <= 65535
}

function configuration(settings) {
    var path = settings.launcherPath === undefined ? '' : settings.launcherPath
    var port = settings.healthPort === undefined ? 18080 : settings.healthPort
    var validPath = typeof path === 'string' && path.charAt(0) === '/'
        && !/[\x00-\x1f\x7f]/.test(path)
    return { launcherPath: path, healthPort: port, valid: validPath && validPort(port) }
}

function health(exitCode, output) {
    if (exitCode !== 0) return 'unavailable'
    var split = output.lastIndexOf('\n')
    try {
        var body = JSON.parse(output.slice(0, split))
        var code = output.slice(split + 1).trim()
        if (code === '200' && body.status === 'ok') return 'ready'
        if (code === '503' && body.error && body.error.message === 'Loading model') return 'loading'
    } catch (error) {}
    return 'unavailable'
}

function launchArgv(state, config, executable, pending) {
    return state === 'ready' && config.valid && executable && !pending
        ? ['omarchy-launch-terminal', config.launcherPath] : []
}

function queryArgv(port) {
    if (!validPort(port)) return []
    return ['timeout', '--kill-after=1s', '3s', 'curl', '-q', '--noproxy', '*',
        '--connect-timeout', '1', '--max-time', '2', '--silent', '--show-error',
        '--write-out', '\n%{http_code}', 'http://127.0.0.1:' + port + '/health']
}
