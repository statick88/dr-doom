import http from "node:http";

export function applyLocalPolicy(settings) {
  return { ...settings, httpIdleTimeoutMs: 3_600_000 };
}

export function createModelProxy(socketPath, {
  port = 18080,
  localPolicy = false,
  upstreamTimeoutMs = localPolicy === true ? 3_600_000 : 1_800_000,
  headersTimeoutMs = localPolicy === true ? 3_620_000 : 1_820_000,
  requestTimeoutMs = localPolicy === true ? 3_600_000 : 1_800_000,
} = {}) {
  const server = http.createServer((request, response) => {
    const upstream = http.request({ socketPath, method: request.method, path: request.url, headers: request.headers });
    const stop = () => upstream.destroy();
    request.once("aborted", stop); response.once("close", stop);
    upstream.setTimeout(upstreamTimeoutMs, () => upstream.destroy(new Error("model timeout")));
    upstream.once("error", () => {
      if (response.headersSent) { response.destroy(); return; }
      response.writeHead(502); response.end("model bridge unavailable");
    });
    upstream.once("response", (model) => {
      const interrupt = () => response.destroy();
      model.once("aborted", interrupt);
      model.once("error", interrupt);
      model.once("close", () => { if (!model.complete) interrupt(); });
      response.writeHead(model.statusCode ?? 502, model.headers);
      model.pipe(response);
    });
    request.pipe(upstream);
  });
  server.headersTimeout = headersTimeoutMs;
  server.requestTimeout = requestTimeoutMs;
  return { server, listen: () => server.listen(port, "127.0.0.1") };
}

const name = process.env.DOOM_MODEL_SOCKET;
if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (!name || name.includes("/")) throw new Error("invalid model bridge");
  createModelProxy(`/bridge/${name}`, { localPolicy: process.env.DOOM_LOCAL_CPU_POLICY === "1" }).listen();
}
