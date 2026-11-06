const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const model = {};
vm.createContext(model);
vm.runInContext(readFileSync(`${__dirname}/../Model.js`, 'utf8'), model);
const plain = value => JSON.parse(JSON.stringify(value));
const config = { launcherPath: '/opt/Doom full/doom "local"', healthPort: 18080 };

test('health: ready, loading, offline, invalid JSON and other HTTP', () => {
  for (const [code, text, expected] of [
    [0, '{"status":"ok"}\n200', 'ready'],
    [0, '{"error":{"message":"Loading model"}}\n503', 'loading'],
    [7, '\n000', 'unavailable'],
    [0, 'invalid\n200', 'unavailable'],
    [0, '{"status":"ok"}\n500', 'unavailable'],
    [0, '{"status":"other"}\n200', 'unavailable'],
    [0, '{}\n503', 'unavailable'],
    [124, '{"status":"ok"}\n200', 'unavailable']
  ]) assert.equal(model.health(code, text), expected, text);
});

test('configuration: portable default and strict loopback port/path', () => {
  assert.deepEqual(plain(model.configuration({})), { launcherPath: '', healthPort: 18080, valid: false });
  for (const port of [1, 18080, 65535])
    assert.equal(model.configuration({ ...config, healthPort: port }).valid, true);
  for (const port of [0, 65536, 1.5, '18080', null])
    assert.equal(model.configuration({ ...config, healthPort: port }).valid, false);
  for (const path of ['', 'doom', '/bad\npath', '/bad\0path', 42])
    assert.equal(model.configuration({ ...config, launcherPath: path }).valid, false);
});

test('launch: only ready, valid, executable and idle; literal argv unchanged', () => {
  const cfg = model.configuration(config);
  const expected = ['omarchy-launch-terminal', config.launcherPath];
  assert.deepEqual(plain(model.launchArgv('ready', cfg, true, false)), expected);
  for (const state of ['loading', 'unavailable'])
    assert.deepEqual(plain(model.launchArgv(state, cfg, true, false)), []);
  assert.deepEqual(plain(model.launchArgv('ready', model.configuration({}), true, false)), []);
  assert.deepEqual(plain(model.launchArgv('ready', cfg, false, false)), []);
  assert.deepEqual(plain(model.launchArgv('ready', cfg, true, true)), []);
  assert.deepEqual(plain(model.launchArgv('ready', cfg, true, false)), expected);
});

test('wiring: visible dimmed button, left-click guard, typed executable check and explicit IPC', () => {
  const qml = readFileSync(`${__dirname}/../BarWidget.qml`, 'utf8');
  assert.match(qml, /pressable: root\.canLaunch/);
  assert.match(qml, /dimmed: !root\.canLaunch/);
  assert.match(qml, /if \(mouseButton === Qt\.LeftButton\) root\.launch\(\)/);
  assert.match(qml, /if \(!canLaunch \|\| check\.running\)/);
  assert.match(qml, /\["\/usr\/bin\/test", "-x", check\.path\]/);
  assert.match(qml, /if \(query\.running \|\| check\.running\) return/);
  assert.match(qml, /function launch\(\): void \{ root\.launch\(\) \}/);
  assert.equal((qml.match(/execDetached\(/g) || []).length, 1);
  assert.doesNotMatch(qml, /interactive: false|bar\.run|bash|terminal-e|visible:|broadcast\("launch"\)/);
});

test('busy settings changes coalesce until both exits and reject stale results', () => {
  const qml = readFileSync(`${__dirname}/../BarWidget.qml`, 'utf8');
  const jobs = [];
  const ctx = { Model: model, Qt: { callLater: fn => jobs.push(fn) },
    check: { running: true }, query: { running: true }, config: model.configuration(config),
    apiState: 'ready', executable: true, refreshVersion: 0, refreshQueued: false, queryCount: 1 };
  ctx.root = ctx;
  vm.createContext(ctx);
  for (const match of qml.matchAll(/^    function (\w+)\((.*?)\) \{([\s\S]*?)^    \}/gm))
    vm.runInContext(`function ${match[1]}(${match[2]}) {${match[3]}}`, ctx);
  const exits = [...qml.matchAll(/onExited: function\(exitCode\) \{([\s\S]*?)^        \}/gm)];
  const flush = () => { while (jobs.length) jobs.shift()(); };
  ctx.check.version = ctx.query.version = 0;
  ctx.check.path = config.launcherPath;
  ctx.query.port = 18080;
  ctx.refresh();
  assert.equal(ctx.apiState, 'unavailable');
  ctx.config = model.configuration({ launcherPath: '/latest "doom"', healthPort: 34003 });
  ctx.refresh(); flush();
  assert.equal(ctx.queryCount, 1);
  ctx.check.running = false;
  vm.runInContext(`(function(exitCode) {${exits[0][1]}})(0)`, ctx); flush();
  assert.equal(ctx.executable, false);
  assert.equal(ctx.queryCount, 1);
  ctx.response = { text: '{"status":"ok"}\n200' };
  ctx.query.running = false;
  vm.runInContext(`(function(exitCode) {${exits[1][1]}})(0)`, ctx);
  assert.equal(ctx.apiState, 'unavailable');
  flush();
  assert.equal(ctx.queryCount, 2);
  assert.equal(ctx.check.command[2], '/latest "doom"');
  assert.equal(ctx.query.command.at(-1), 'http://127.0.0.1:34003/health');
  assert.equal(ctx.check.running && ctx.query.running, true);
});

test('detached launch records dispatch when the native API returns void', () => {
  const qml = readFileSync(`${__dirname}/../BarWidget.qml`, 'utf8');
  const body = [...qml.matchAll(/onExited: function\(exitCode\) \{([\s\S]*?)^        \}/gm)][0][1];
  const calls = [];
  const ctx = { Model: model, Qt: { callLater() {} }, drainRefresh() {},
    config: model.configuration(config), refreshVersion: 1, apiState: 'ready',
    pending: true, launchCount: 0,
    check: { path: config.launcherPath, version: 1, forLaunch: true },
    Quickshell: { execDetached(argv) { calls.push(plain(argv)); } } };
  ctx.root = ctx;
  vm.createContext(ctx);
  vm.runInContext(`(function(exitCode) {${body}})(0)`, ctx);
  assert.deepEqual(calls, [['omarchy-launch-terminal', config.launcherPath]]);
  assert.equal(ctx.pending, false);
  assert.equal(ctx.launchCount, 1);
  assert.equal(ctx.launchResult, 'enviado');
});

test('query: bounded metadata-only loopback argv, no shell/server/model commands', () => {
  assert.deepEqual(plain(model.queryArgv(18080)), [
    'timeout', '--kill-after=1s', '3s', 'curl', '-q', '--noproxy', '*',
    '--connect-timeout', '1', '--max-time', '2', '--silent', '--show-error',
    '--write-out', '\n%{http_code}', 'http://127.0.0.1:18080/health'
  ]);
  assert.equal(model.queryArgv(1).at(-1), 'http://127.0.0.1:1/health');
  assert.equal(model.queryArgv(65535).at(-1), 'http://127.0.0.1:65535/health');
  assert.deepEqual(plain(model.queryArgv('remote')), []);
});
