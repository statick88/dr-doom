import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModelProxy } from "../../harness/disposable/model-proxy.mjs";

const signal = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const within = async (promise, ms = 250) => {
  let timer;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise((done) => { timer = setTimeout(() => done(false), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const scratch = await mkdtemp(join(tmpdir(), "doom-boundary-"));
const sockets = new Set();
const clients = new Set();
const track = (server) => server.on("connection", (socket) => {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
});
let active;
let upstreamClosed;
const model = track(http.createServer((_request, response) => {
  active = response;
  upstreamClosed = signal();
  response.once("close", upstreamClosed.resolve);
  response.writeHead(200, { "content-type": "text/event-stream", "x-model": "fake" });
  response.write("data: partial\n\n");
}));
const proxy = createModelProxy(join(scratch, "m.sock"), { port: 0, upstreamTimeoutMs: 1000 });
track(proxy.server);
const closeServer = (server) => new Promise((done) => server.close(done));
const get = () => new Promise((resolve, reject) => {
  const request = http.get({ host: "127.0.0.1", port: proxy.server.address().port, agent: false }, (response) => {
    const first = signal();
    const closed = signal();
    const state = { response, first, closed, body: "", ended: false, aborted: false };
    response.on("data", (chunk) => { state.body += chunk; first.resolve(); });
    response.once("end", () => { state.ended = true; });
    response.once("aborted", () => { state.aborted = true; });
    response.on("error", () => {});
    response.once("close", closed.resolve);
    resolve(state);
  });
  clients.add(request);
  request.once("close", () => clients.delete(request));
  request.on("error", reject);
});

try {
  await new Promise((done) => model.listen(join(scratch, "m.sock"), done));
  proxy.listen();
  await new Promise((done) => proxy.server.once("listening", done));

  const cancelled = await get();
  assert.equal(await within(cancelled.first.promise), true, "client receives partial stream");
  cancelled.response.destroy();
  assert.equal(await within(upstreamClosed.promise), true, "client abort closes upstream");
  assert.equal(await within(cancelled.closed.promise), true);
  console.log("ok - client abort closes upstream");

  // Both failures happen only after the partial bytes have reached the client.
  for (const cause of ["disconnect", "timeout"]) {
    const state = await get();
    assert.equal(await within(state.first.promise), true, "partial bytes arrive before failure");
    const ownedUpstreamClosed = upstreamClosed.promise;
    if (cause === "disconnect") active.socket.destroy();
    else active.socket.setTimeout(0); // Keep the fake model idle; the proxy owns its timeout.
    const downstreamClosed = await within(state.closed.promise, cause === "disconnect" ? 250 : 1500);
    const upstreamDidClose = await within(ownedUpstreamClosed);
    console.log(JSON.stringify({ cause, upstreamClosed: upstreamDidClose, downstreamClosed }));
    assert.equal(downstreamClosed, true, "interrupted upstream must terminate downstream promptly");
    assert.equal(upstreamDidClose, true, "owned upstream closes");
    assert.equal(state.response.statusCode, 200);
    assert.equal(state.response.headers["content-type"], "text/event-stream");
    assert.equal(state.response.headers["x-model"], "fake");
    assert.equal(state.body, "data: partial\n\n", "no fabricated error or completion bytes");
    assert.equal(state.ended, false, "partial stream must not end successfully");
    assert.equal(state.aborted, true);
    assert.equal(state.response.complete, false);
    console.log(`ok - ${cause} preserves partial stream and terminates downstream`);
  }
} finally {
  for (const client of clients) client.destroy();
  const closed = [...sockets].map((socket) => new Promise((done) => socket.once("close", done)));
  for (const socket of sockets) socket.destroy();
  await Promise.all([closeServer(proxy.server), closeServer(model), ...closed]);
  await rm(scratch, { recursive: true, force: true });
  assert.equal(sockets.size, 0, "no owned sockets remain");
  assert.equal(clients.size, 0, "no owned client requests remain");
  assert.equal(proxy.server.listening, false);
  assert.equal(model.listening, false);
}
