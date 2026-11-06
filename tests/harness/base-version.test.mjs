import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(read('harness/disposable/package.json'));
const lock = JSON.parse(read('harness/disposable/package-lock.json'));

assert.equal(manifest.version, '4.6.0');
assert.deepEqual(manifest.dependencies, {
  '@earendil-works/pi-coding-agent': '1.5.0',
  'gentle-pi': '4.6.0',
});
assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
assert.equal(lock.version, manifest.version);
for (const [name, version] of Object.entries(manifest.dependencies)) {
  const entry = lock.packages[`node_modules/${name}`];
  assert.equal(entry.version, version);
  assert.ok(entry.integrity?.startsWith('sha512-'), `missing integrity: ${name}`);
  assert.ok(entry.resolved.startsWith('https://registry.npmjs.org/'));
}

const dockerfile = read('harness/disposable/Dockerfile');
assert.match(dockerfile, /npm ci --ignore-scripts --omit=dev/);
// Debian retrieval must use HTTPS before package indexes are downloaded.
const httpsRewrite = dockerfile.indexOf('replaceAll("http://deb.debian.org", "https://deb.debian.org")');
assert.ok(httpsRewrite >= 0, 'missing Debian HTTPS source rewrite');
assert.ok(httpsRewrite < dockerfile.indexOf('apt-get update'), 'HTTPS rewrite must precede apt update');
const publicRoots = dockerfile.indexOf('require("node:tls").rootCertificates');
assert.ok(publicRoots >= 0 && publicRoots < dockerfile.indexOf('apt-get update'), 'bootstrap trusted public roots before apt HTTPS');
assert.ok(dockerfile.includes('/etc/ssl/certs/ca-certificates.crt'));
assert.match(dockerfile, /apt-get install -y --no-install-recommends ca-certificates git/);
assert.ok(!/Verify-Peer=false|Verify-Host=false|--allow-unauthenticated/.test(dockerfile));
assert.match(dockerfile, /await installGentleAi\(\)/);
for (const [mode, path] of [
  ['0755', '.gentle-ai/v4.3.1'],
  ['0555', '.gentle-ai/v4.3.1/gentle-ai'],
  ['0444', '.gentle-ai/v4.3.1/integrity.json'],
]) assert.ok(dockerfile.split('\n').some((line) => line.includes(`chmod ${mode}`) && line.includes(path)));
assert.match(read('harness/disposable/runtime.py'), /IMAGE = "dr-doom-gentle:4\.6\.0"/);
const nativeCheck = read('tests/harness/native-image.integration.mjs');
assert.ok(nativeCheck.includes("assert.equal(GENTLE_AI_VERSION, '4.3.1')"));
assert.ok(nativeCheck.includes('/.gentle-ai/v4.3.1/gentle-ai'));
assert.ok(nativeCheck.includes('4\\.3\\.1'));

// Public help remains offline and points at the same selected image as the runner.
const help = spawnSync(new URL('doom', root).pathname, ['--help'], {
  encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 3000,
});
assert.ifError(help.error);
assert.equal(help.status, 0);
assert.equal(help.stderr, '');
assert.ok(help.stdout.includes('docker build -t dr-doom-gentle:4.6.0'));
console.log('ok - pinned Gentle 4.6.0 / Pi 1.5.0 / native 4.3.1 base and offline help');
