# Private provider bridge (Linux host library only)

`ProviderRelay(path, profile, host_key, *, connection_factory=...)` exposes
`start()` and idempotent `close()`. It is one-shot: start after close is a no-op.
The caller supplies a canonical absolute, absent Unix socket path (at most 107
encoded bytes) inside an existing, owner-controlled 0700 directory. No parent
directories are created. The socket is 0600; cleanup checks its device/inode.

## Synthetic quick path

Synthetic injection example, **not a live-provider example**:

```python
import tempfile
from harness.providers.profiles import get_profile
from harness.providers.relay import ProviderRelay

# fake_https is a caller-supplied test factory, never a real provider connection.
with tempfile.TemporaryDirectory(prefix="pr-") as private:
    bridge = ProviderRelay(private + "/s", get_profile("openai", "selected"),
                           "synthetic-private-key", connection_factory=fake_https)
    try:
        bridge.start()  # A local AF_UNIX HTTP client may now POST native JSON.
    finally:
        bridge.close()
```

## HTTP and resource limits

The committed transport owns native routing, model validation, fixed origin,
host authentication, TLS verification, filtering and streaming secret redaction.
The bridge adds no body censorship or protocol conversion. Requests require one
bounded Content-Length, no Transfer-Encoding, HTTP/1.0 or HTTP/1.1 POST, and at
most 16 KiB of request line/headers. Bodies use the core's 8 MiB limit. Responses
are close-delimited bytes, with only core-approved Content-Type; stream failures
close the connection without fabricated completion. Errors are constant JSON.

Capacity is four active clients/daemon handlers and backlog four. Client reads
have a 30-second inactivity timeout; streaming retains 1800 seconds. Shutdown
stops admission, shuts down owned client/captured upstream sockets, then joins
with a shared 1.5-second budget. Only the worker closes its ForwardResponse.
DNS or a blocking injected factory cannot necessarily be interrupted: a daemon
handler may outlive close until it returns. Guarded explicit/implicit connects
recheck stop before any API request and abort late sockets. Already transmitted
provider work and its cost cannot be recalled; shutdown is not vendor cancellation.
The private directory is a trust boundary, not isolation from other same-UID code.

## Next integration boundary

This is **not wired into Doom**, Docker, a CLI, or an SDK. Local Qwen/32K/tools,
image, widget and source selection remain unchanged. A later integration must
select cloud explicitly and mount only a secret-free descriptor/private bridge,
never host credentials, workspace or Docker sockets. Subscription entitlement,
actual SDK compatibility, provider acceptance and billing remain unverified.

## Verification

Focused offline verification: `node tests/harness/provider-relay.test.mjs`.
It uses short auto-removed system temporary directories, real local Unix clients,
the actual transport core and injected fake HTTPS; outbound connects/TCP binds
are forbidden. It does not rerun the transport unit's matrix or contact providers.
