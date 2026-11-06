import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const scratch = await mkdtemp(join(tmpdir(), "doom-profiles-"));
const env = { PATH: process.env.PATH, PYTHONPATH: root, HOME: scratch,
  OPENAI_API_KEY: "synthetic-openai", ANTHROPIC_API_KEY: "synthetic-anthropic",
  GEMINI_API_KEY: "synthetic-gemini", DASHSCOPE_API_KEY: "synthetic-qwen" };
const run = (args) => {
  const result = spawnSync("python3", ["-B", ...args], { cwd: scratch, env, encoding: "utf8", timeout: 10000 });
  assert.ifError(result.error);
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};
const cli = (...args) => run(["-m", "harness.providers.profiles", ...args]);
const api = (source) => run(["-c", `from harness.providers.profiles import APIProfile, get_profile, resolve_api_key, sdk_descriptor\n${source}`]);
const expected = [
  ["openai", null, "openai-responses", "https://api.openai.com/v1", "/v1", "OPENAI_API_KEY"],
  ["anthropic", null, "anthropic-messages", "https://api.anthropic.com", "/", "ANTHROPIC_API_KEY"],
  ["gemini", null, "google-generative-ai", "https://generativelanguage.googleapis.com/v1beta", "/v1beta", "GEMINI_API_KEY"],
  ["qwen", "cn", "openai-completions", "https://dashscope.aliyuncs.com/compatible-mode/v1", "/v1", "DASHSCOPE_API_KEY"],
  ["qwen", "intl", "openai-completions", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "/v1", "DASHSCOPE_API_KEY"],
];
let failures = 0;
const check = (name, test) => {
  try { test(); console.log(`ok - ${name}`); }
  catch (error) { failures++; console.error(`not ok - ${name}: ${error.message}`); }
};
try {
  check("stable public list and scoped help without credential resolution", () => {
    assert.deepEqual(cli("list"), { code: 0, stdout: '["openai","anthropic","gemini","qwen"]\n', stderr: "" });
    const help = cli("--help");
    assert.equal(help.code, 0); assert.equal(help.stderr, "");
    assert.match(help.stdout, /API profiles only/); assert.match(help.stdout, /plans/);
    assert.deepEqual(api(`import harness.providers.profiles as profiles
from contextlib import redirect_stdout
from io import StringIO
profiles.resolve_api_key = lambda *args: (_ for _ in ()).throw(AssertionError('key read'))
for args in (['list'], ['describe', '--provider', 'openai', '--model', 'operator-model']):
    with redirect_stdout(StringIO()):
        assert profiles.main(args) == 0
print('ok')`), { code: 0, stdout: "ok\n", stderr: "" });
  });
  for (const [provider, region, protocol, upstream, path, keyEnv] of expected) {
    check(`${provider}/${region}: immutable selection and exact secret-free descriptor`, () => {
      const result = cli("describe", "--provider", provider, "--model", "operator-model", ...(region ? ["--region", region] : []));
      const metadata = { provider, model: "operator-model", region, api: protocol, upstream, keyEnv,
        billing: "unknown; vendor API separate from plans", sdk: { providers: { [`${provider}-cloud-api`]: {
          name: `${provider} cloud API`, baseUrl: `http://127.0.0.1:18080${path}`, api: protocol,
          apiKey: "doom-relay-placeholder", models: [{ id: "operator-model", contextWindow: 32768, maxTokens: 2048 }],
        } } } };
      assert.deepEqual(result, { code: 0, stdout: `${JSON.stringify(metadata)}\n`, stderr: "" });
      assert.deepEqual(api(`from dataclasses import FrozenInstanceError
p = get_profile(${JSON.stringify(provider)}, 'operator-model', region=${region ? JSON.stringify(region) : "None"})
assert isinstance(p, APIProfile)
try:
    p.model = 'changed'
    raise AssertionError('mutable')
except FrozenInstanceError:
    pass
assert 'synthetic' not in repr(p)
import json
assert sdk_descriptor(p) == json.loads(${JSON.stringify(JSON.stringify(metadata.sdk))})
d = sdk_descriptor(p)
d['providers'].clear()
assert sdk_descriptor(p)['providers']
print('ok')`), { code: 0, stdout: "ok\n", stderr: "" });
    });
  }
  check("provider, explicit region and sanitized model validation", () => {
    assert.deepEqual(api(`cases = [('unknown', 'model', None), ('qwen', 'model', None), ('qwen', 'model', 'us')]
cases += [(p, 'model', 'cn') for p in ('openai', 'anthropic', 'gemini')]
cases += [('openai', m, None) for m in ('', 'https://secret.invalid/a', '../x', 'a/b', 'a?key=secret', 'a#secret', 'x\\n', 'x\\x7f', 'x\\u0085', '$SECRET', '!command')]
for provider, model, region in cases:
    try:
        get_profile(provider, model, region=region)
        raise AssertionError('accepted')
    except ValueError as e:
        assert str(e) in ('Invalid provider.', 'Invalid region.', 'Invalid model identifier.')
    try:
        APIProfile(provider, model, region)
        raise AssertionError('direct construction bypass')
    except ValueError:
        pass
for provider, model in [('openai', 'ft:gpt-4o:org:custom:123'), ('anthropic', 'claude-operator-1'), ('gemini', 'gemini-operator-preview'), ('qwen', 'qwen-operator')]:
    assert get_profile(provider, model, region='cn' if provider == 'qwen' else None).model == model
print('ok')`), { code: 0, stdout: "ok\n", stderr: "" });
    for (const args of [["--provider", "secret-provider", "--model", "model"], ["--provider", "openai", "--model", "https://secret.invalid"], ["--provider", "qwen", "--model", "model"], ["--provider", "openai"], ["--secret-option", "secret-value"]]) {
      assert.deepEqual(cli("describe", ...args), { code: 2, stdout: "", stderr: "Invalid profile arguments.\n" });
    }
  });
  check("host-only selected key resolution, sanitized rejects and unchanged mappings", () => {
    assert.deepEqual(api(`class Selected(dict):
    def get(self, name, default=None):
        assert name == self.selected
        return super().get(name, default)
    def __iter__(self):
        raise AssertionError('enumerated environment')
for provider, name in [('openai', 'OPENAI_API_KEY'), ('anthropic', 'ANTHROPIC_API_KEY'), ('gemini', 'GEMINI_API_KEY'), ('qwen', 'DASHSCOPE_API_KEY')]:
    p = get_profile(provider, 'operator-model', region='intl' if provider == 'qwen' else None)
    values = Selected({name: 'synthetic-key', 'UNRELATED': 'never-read'})
    values.selected = name
    before = values.copy()
    assert resolve_api_key(p, values) == 'synthetic-key'
    assert values == before
    for key in (None, '', ' ', 'x\\nsecret', 'x\\x7f', 'x\\u0085', 'sk-ant-oat-synthetic'):
        values[name] = key
        before = values.copy()
        try:
            resolve_api_key(p, values)
            raise AssertionError('accepted invalid key')
        except ValueError as e:
            assert str(e) == 'Invalid API key.'
        assert values == before
    del values[name]
    try:
        resolve_api_key(p, values)
        raise AssertionError('accepted missing key')
    except ValueError as e:
        assert str(e) == 'Invalid API key.'
print('ok')`), { code: 0, stdout: "ok\n", stderr: "" });
  });
  assert.deepEqual(await readdir(scratch), [], "no files, stored state or counters created");
  assert.equal(env.OPENAI_API_KEY, "synthetic-openai");
  if (failures) process.exitCode = 1;
} finally {
  await rm(scratch, { recursive: true, force: true });
}
