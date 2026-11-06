// Explicit opt-in integration check; never included in the ordinary *.test.mjs suite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const image = process.argv[2];
if (process.argv.length !== 3 || !/^sha256:[a-f0-9]{64}$/.test(image ?? '')) {
  console.error('Usage: node tests/harness/native-image.integration.mjs <sha256:image-id>');
  process.exit(2);
}

const probe = String.raw`
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  GENTLE_AI_VERSION, resolveGentleAiBinary,
} from '/opt/doom/node_modules/gentle-pi/runtime/gentle-ai-binary.mjs';
assert.equal(process.getuid(), 1000);
assert.equal(process.getgid(), 1000);
assert.equal(GENTLE_AI_VERSION, '4.3.1');
const binary = resolveGentleAiBinary();
assert.equal(binary, '/opt/doom/node_modules/gentle-pi/.gentle-ai/v4.3.1/gentle-ai');
// The package installer uses the positional "version" command, not --version.
const result = spawnSync(binary, ['version'], {
  encoding: 'utf8', timeout: 3000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
  env: { PATH: '/usr/bin:/bin', HOME: '/tmp', TMPDIR: '/tmp',
    GENTLE_AI_NO_SELF_UPDATE: '1' },
});
console.log(JSON.stringify({ uid: process.getuid(), binary, status: result.status,
  signal: result.signal, stdout: result.stdout, stderr: result.stderr,
  error: result.error?.message }));
assert.ifError(result.error);
assert.equal(result.signal, null);
assert.equal(result.status, 0);
assert.match(result.stdout, /^gentle-ai 4\.3\.1\r?\n?$/);
assert.equal(result.stderr, '');
`;

// Host scratch is owned, empty, never mounted, and removed in finally.
const scratchRoot = fileURLToPath(new URL('../../logs/v/', import.meta.url));
await mkdir(scratchRoot, { recursive: true });
const scratch = await mkdtemp(`${scratchRoot}native-image-`);
const name = `doom-native-check-${randomUUID()}`;
const env = {
  PATH: '/usr/bin:/bin', HOME: scratch, DOCKER_CONFIG: scratch,
  DOCKER_HOST: 'unix:///var/run/docker.sock',
};
const docker = (args, options = {}) => spawnSync('/usr/bin/docker', args, {
  env, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 3000,
  killSignal: 'SIGKILL', ...options,
});
let failed = false;
try {
  const result = docker([
    'run', '--pull=never', '--name', name, '--rm', '--interactive',
    '--user=1000:1000', '--network=none', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--memory=2g', '--cpus=2', '--pids-limit=128',
    '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777',
    '--env=HOME=/tmp', '--env=TMPDIR=/tmp', '--entrypoint=node',
    image, '--input-type=module',
  ], { input: probe, timeout: 12000 });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  console.log(JSON.stringify({ dockerStatus: result.status, signal: result.signal,
    error: result.error?.message }));
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, 'Native image integration failed');
} catch (error) {
  failed = true;
  console.error(error.message);
} finally {
  // A killed Docker client can leave a container behind; remove only our random name.
  const cleanup = docker(['container', 'rm', '--force', name]);
  const absent = cleanup.status === 1 && /No such container:/.test(cleanup.stderr ?? '');
  const cleaned = !cleanup.error && (cleanup.status === 0 || absent);
  console.log(JSON.stringify({ cleanupStatus: cleanup.status, absent, cleaned,
    error: cleanup.error?.message }));
  if (!cleaned) {
    failed = true;
    console.error(`Owned container cleanup failed: ${name}\n${cleanup.stderr ?? ''}`);
  }
  await rm(scratch, { recursive: true });
}
process.exitCode = failed ? 1 : 0;
