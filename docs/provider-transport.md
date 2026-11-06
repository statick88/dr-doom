# Host-only native HTTP transport

This library forwards one validated API request to the frozen profile origin.
**It is not wired into Doom**, a socket listener, CLI, or a subscription login.
The existing `Relay(path).start()/close()` interface is unchanged.

## Public interface

Import `forward_request` and `TransportError` from
`harness.providers.transport`; select an `APIProfile` with the existing
[`get_profile`](provider-profiles.md) function. Host callers supply a key string;
the core reuses `resolve_api_key` with a selected-name-only synthetic mapping.
Provider credentials are never looked up in environment variables or files;
the library never mutates the environment. Standard TLS may consult certificate
trust configuration, but ambient `SSLKEYLOGFILE` logging is not enabled.

Illustrative host-side usage, **not an executable cloud example**:

```python
profile = get_profile("openai", "selected")
with forward_request(profile, "synthetic-host-secret", "POST", "/v1/responses",
                     {"Content-Type": "application/json"},
                     b'{"model":"selected"}',
                     connection_factory=fake_https_factory) as response:
    status, headers = response.status, response.headers
    for native_bytes in response:
        consume_on_host(native_bytes)
```

The response is a single-use byte iterator with idempotent `close()`; always use
`with` or close explicitly on abandonment. Never serialize this host-side object
or its private attributes into the container. `TransportError.status` is an
HTTP status; its only message is `Provider request failed.` No raw vendor reasons,
error bodies, cookies, auth headers or debug metadata are returned.
Cancellation propagates unchanged after owned-resource cleanup; close attempts
both resources even if one fails, and preserves an active cancellation.

## Fixed boundaries

- POST only: OpenAI `/v1/responses`, Anthropic `/v1/messages`, Qwen
  `/v1/chat/completions` (translated only to `/compatible-mode/v1/chat/completions`
  at the selected regional host). Body model must equal the selected model.
- Gemini binds the selected model in
  `/v1beta/models/<model>:streamGenerateContent?alt=sse`; an optional `key` query
  is discarded. Other queries, destinations, paths and methods fail closed.
- JSON requests: at most 8 MiB, object root, no duplicate keys or nonfinite
  constants. Native bytes, tools, thinking and signatures are otherwise unchanged.
- Fresh headers allow Content-Type, Accept, and Anthropic version/beta only;
  version defaults to `2023-06-01`. Values are printable ASCII, at most 8192
  characters. Length is computed; only the selected host authentication is added.
- HTTPSConnection receives an explicit client SSLContext with default CA trust,
  required certificate/hostname validation and no keylog path/callback. Test
  factories accept `(host, timeout=30, context=secure_context)` and supply
  connect, sock.settimeout, request, getresponse and close; responses supply
  status, getheaders, read1 and close. No proxies; socket inactivity timeout
  1800s. No redirects, retries or fallback.
- Response reads are at most 64 KiB, total at most 32 MiB. Exact host-key bytes
  are redacted across reads; only sanitized Content-Type response metadata passes.
  This is not a general detector for transformed/encoded credentials or other
  secrets. Streaming can fail after earlier bytes have been consumed.

## Acceptance and next unit

Mocked verification: `node tests/harness/provider-transport.test.mjs` and
`node tests/harness/provider-profiles.test.mjs`. No live SDK/provider acceptance,
quota, billing, token-capacity or cloud-readiness claim follows. Caller SDK
32768/2048 generation configuration remains a later integration responsibility.
The intent is the same Gentle harness with native protocols, not yet proof of it.
Socket ownership, runtime wiring, scoped networking and official subscription
routes remain T25 work. No model-content filter or token rewriting is added.
