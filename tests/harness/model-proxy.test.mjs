import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const scratch = await mkdtemp(join(tmpdir(), "doom-proxy-"));
const upstreamSocket = join(scratch, "model.sock");
const seen = {};
const model = http.createServer((req, res) => {
  seen.method = req.method; seen.path = req.url; seen.headers = req.headers; let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => { seen.body = body; res.writeHead(201, { "x-model": "fake", "content-type": "text/plain" }); res.write("uno-"); res.end("dos"); });
});
await new Promise((resolveRun) => model.listen(upstreamSocket, resolveRun));
const { createModelProxy } = await import(resolve("harness/disposable/model-proxy.mjs"));
const proxy = createModelProxy(upstreamSocket, { port: 0 });
proxy.listen();
await new Promise((resolveRun) => proxy.server.once("listening", resolveRun));
const port = proxy.server.address().port;
try {
  const result = await new Promise((resolveRun, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/v1/chat?stream=1", headers: { "x-test": "yes" } }, (res) => {
      let body = ""; res.on("data", (chunk) => { body += chunk; }); res.on("end", () => resolveRun({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject); req.end("entrada");
  });
  assert.equal(seen.method, "POST"); assert.equal(seen.path, "/v1/chat?stream=1");
  assert.equal(seen.headers["x-test"], "yes"); assert.equal(seen.body, "entrada");
  assert.equal(result.status, 201); assert.equal(result.headers["x-model"], "fake"); assert.equal(result.body, "uno-dos");

  const stalledSocket = join(scratch, "stalled.sock");
  let stalledConnections = 0;
  const stalled = http.createServer((_req, _res) => { stalledConnections++; });
  await new Promise((resolveRun) => stalled.listen(stalledSocket, resolveRun));
  const bounded = createModelProxy(stalledSocket, { port: 0, upstreamTimeoutMs: 20, headersTimeoutMs: 40, requestTimeoutMs: 40 });
  bounded.listen();
  await new Promise((resolveRun) => bounded.server.once("listening", resolveRun));
  const timeoutResult = await new Promise((resolveRun, reject) => {
    const req = http.request({ host: "127.0.0.1", port: bounded.server.address().port, path: "/v1/chat" }, (res) => {
      let body = ""; res.on("data", (chunk) => { body += chunk; }); res.on("end", () => resolveRun({ status: res.statusCode, body }));
    });
    req.setTimeout(500, () => req.destroy(new Error("test client timeout")));
    req.once("error", reject); req.end();
  });
  assert.equal(stalledConnections, 1);
  assert.deepEqual(timeoutResult, { status: 502, body: "model bridge unavailable" });
  await new Promise((resolveRun) => bounded.server.close(resolveRun));
  await new Promise((resolveRun) => stalled.close(resolveRun));
  console.log("ok - HTTP Unix proxy preserves streaming and bounds stalled upstreams");
} finally {
  await new Promise((resolveRun) => proxy.server.close(resolveRun));
  await new Promise((resolveRun) => model.close(resolveRun));
  await rm(scratch, { recursive: true, force: true });
}
