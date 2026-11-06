#!/usr/bin/env python3
"""Launch Dr. Doom only inside an offline, disposable Docker boundary."""
import argparse
import json
import os
import re
import time
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import uuid
from pathlib import Path

IMAGE = "dr-doom-gentle:4.6.0"
DOCKER = "/usr/bin/docker"
MODEL_HOST, MODEL_PORT = "127.0.0.1", 18080
DOCKER_TIMEOUT = 10
RELAY_INACTIVITY_TIMEOUT = 3600
CLEANUP_TIMEOUT = 20


def selected_local_image():
    value = os.environ.get("DOOM_LOCAL_IMAGE_ID")
    if value is None:
        return IMAGE
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", value):
        fail("DOOM_LOCAL_IMAGE_ID requiere sha256: y 64 caracteres hexadecimales minúsculos")
    return value


def fail(message):
    print(f"doom: {message}", file=sys.stderr)
    raise SystemExit(2)


def safe_bind(value):
    if any(c in value for c in ",\n\r\0"):
        fail("espacio de trabajo inválido")


def confined_workspace(root, requested=None, create=False):
    root = root.resolve()
    harness = root / "harness"
    base_path = harness / "doom-workspace"
    for path in (root, harness, base_path):
        if path.is_symlink(): fail("espacio de trabajo inválido: enlaces simbólicos no permitidos")
    base = base_path.resolve()
    if not base.is_relative_to(harness.resolve()): fail("espacio de trabajo inválido")
    raw = Path(requested) if requested else base_path
    if raw.is_symlink(): fail("espacio de trabajo inválido: enlaces simbólicos no permitidos")
    candidate = raw.resolve()
    if not candidate.is_relative_to(base): fail("espacio de trabajo inválido: debe estar dentro de harness/doom-workspace")
    safe_bind(str(candidate))
    if create: candidate.mkdir(parents=True, exist_ok=True)
    return candidate


def build_docker_argv(workspace, relay_socket, pi_args, uid, gid, name=None, tty=False, *, local_policy=False, image=IMAGE):
    bridge = str(Path(relay_socket).parent); safe_bind(str(workspace)); safe_bind(bridge)
    container = name or f"doom-{uuid.uuid4().hex[:12]}"
    argv = [DOCKER, "run", "--pull=never", "--rm", "--name", container, "--interactive"]
    if tty: argv.append("--tty")
    overlays = ["--env", "DOOM_LOCAL_CPU_POLICY=1"] if local_policy else []
    return argv + ["--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
        "--pids-limit=128", "--memory=2g", "--cpus=2", f"--user={uid}:{gid}", "--tmpfs", "/tmp:rw,nosuid,nodev,size=256m",
        "--mount", f"type=bind,src={workspace},dst=/workspace", "--mount", f"type=bind,src={bridge},dst=/bridge,readonly",
        "--env", f"DOOM_MODEL_SOCKET={Path(relay_socket).name}", *overlays, image, *pi_args]


class Relay:
    def __init__(self, path):
        self.path, self.stop = path, threading.Event(); self.clients = set(); self.lock = threading.Lock()
        self.server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); self.server.bind(path); self.server.listen(4); self.server.settimeout(.2)
        self.thread = threading.Thread(target=self.serve, daemon=True)
    def start(self): self.thread.start()
    def serve(self):
        while not self.stop.is_set():
            try: client, _ = self.server.accept()
            except (socket.timeout, OSError): continue
            with self.lock:
                if len(self.clients) >= 4: client.close(); continue
                self.clients.add(client)
            threading.Thread(target=self.pipe, args=(client,), daemon=True).start()
    def pipe(self, client):
        upstream = None
        try:
            upstream = socket.create_connection((MODEL_HOST, MODEL_PORT), timeout=30); client.settimeout(RELAY_INACTIVITY_TIMEOUT); upstream.settimeout(RELAY_INACTIVITY_TIMEOUT)
            def copy(source, target):
                try:
                    while data := source.recv(65536): target.sendall(data)
                except OSError: pass
                finally:
                    try: target.shutdown(socket.SHUT_WR)
                    except OSError: pass
            a = threading.Thread(target=copy, args=(client, upstream), daemon=True); a.start(); copy(upstream, client); a.join(1)
        except OSError: pass
        finally:
            for peer in (client, upstream):
                if peer:
                    try: peer.close()
                    except OSError: pass
            with self.lock: self.clients.discard(client)
    def close(self):
        self.stop.set()
        try: self.server.close()
        except OSError: pass
        self.thread.join(1)
        with self.lock:
            for client in self.clients:
                try: client.close()
                except OSError: pass
        try: os.unlink(self.path)
        except FileNotFoundError: pass


def docker_env(config): return {"PATH": "/usr/bin:/bin", "DOCKER_HOST": "unix:///var/run/docker.sock", "HOME": config, "DOCKER_CONFIG": config}
def cleanup_clock():
    # Linux BOOTTIME includes suspension; no per-operation deadline refresh.
    return time.clock_gettime(time.CLOCK_BOOTTIME) if hasattr(time, "CLOCK_BOOTTIME") else time.monotonic()


def cleanup(name, env):
    deadline = cleanup_clock() + CLEANUP_TIMEOUT
    diagnostics = []

    def command(phase, argv):
        remaining = deadline - cleanup_clock()
        if remaining <= 0:
            return None
        record = {"phase": phase}
        try:
            result = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, env=env, check=False, timeout=min(DOCKER_TIMEOUT, remaining))
            record["exit"] = result.returncode
            detail = (result.stderr or b"").decode("utf-8", "replace")[:256]
            record["stderr"] = "".join(c if c.isprintable() else " " for c in detail)
        except subprocess.TimeoutExpired:
            record["timeout"] = True
            result = None
        except OSError as error:
            record["error"] = type(error).__name__
            result = None
        diagnostics.append(record)
        return result

    command("rm", [DOCKER, "rm", "-f", name])
    # A successful exact-name listing is positive absence evidence, irrespective
    # of rm/--rm races or localized daemon diagnostics. Never list other names.
    while cleanup_clock() < deadline:
        result = command("list", [DOCKER, "container", "ls", "-a", "--filter",
            f"name=^/{re.escape(name)}$", "--format", "{{.Names}}"])
        if result is None or result.returncode:
            break
        output = result.stdout.decode("utf-8", "replace").strip()
        if not output:
            return True
        if output != name:
            diagnostics[-1]["unexpected_name"] = True
            break
        time.sleep(min(.1, max(0, deadline - cleanup_clock())))
    print(f"doom: posible contenedor huérfano: {name}", file=sys.stderr)
    print("doom: limpieza no verificada: " + json.dumps(diagnostics, ensure_ascii=True), file=sys.stderr)
    return False


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    parser = argparse.ArgumentParser(add_help=False); parser.add_argument("--root"); parser.add_argument("--flow", choices=("ctf", "pentest", "redteam")); parser.add_argument("--workspace"); parser.add_argument("pi_args", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv); root = Path(args.root or Path(__file__).resolve().parents[2]).resolve(); workspace = confined_workspace(root, args.workspace)
    image_id = selected_local_image()
    if not Path(DOCKER).is_file(): fail(f"no existe {DOCKER}; instala Docker o ajusta el host")
    with tempfile.TemporaryDirectory(prefix="doom-docker-") as config:
        env = docker_env(config)
        try:
            image = subprocess.run([DOCKER, "image", "inspect", image_id], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env, timeout=DOCKER_TIMEOUT)
        except subprocess.TimeoutExpired:
            fail(f"no se pudo verificar la imagen local: {image_id}")
        if image.returncode: fail(f"imagen local ausente: {image_id}. Construye: docker build -t {IMAGE} -f harness/disposable/Dockerfile .")
        workspace = confined_workspace(root, args.workspace, True)
        bridge_root = root / "logs" / "doom-bridge"
        if bridge_root.is_symlink(): fail("puente inválido")
        bridge_root.mkdir(parents=True, exist_ok=True); bridge = Path(tempfile.mkdtemp(prefix="bridge-", dir=bridge_root)); os.chmod(bridge, 0o700)
        relay = Relay(str(bridge / "model.sock")); relay.start(); name = f"doom-{uuid.uuid4().hex[:12]}"
        pi_args = args.pi_args[1:] if args.pi_args[:1] == ["--"] else args.pi_args
        if args.flow: pi_args = ["--flow", args.flow, *pi_args]
        command = build_docker_argv(str(workspace), str(bridge / "model.sock"), pi_args, os.getuid(), os.getgid(), name, sys.stdin.isatty() and sys.stdout.isatty(), local_policy=True, image=image_id)
        previous_term = signal.getsignal(signal.SIGTERM)
        def terminate(_signum, _frame): raise SystemExit(143)
        signal.signal(signal.SIGTERM, terminate)
        try:
            code = subprocess.run(command, env=env).returncode
            return 128 + abs(code) if code < 0 else code
        except KeyboardInterrupt: return 130
        finally:
            signal.signal(signal.SIGTERM, previous_term)
            relay.close()
            try: bridge.rmdir()
            except OSError: pass
            cleanup(name, env)
if __name__ == "__main__": raise SystemExit(main())
