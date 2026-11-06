"""Local-only HTTP capability probes; no external targets or tool execution."""
import json
import time
import urllib.request

BASE = "http://127.0.0.1:18080"
MODEL = "qwen3-8b-redteam"


def request(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        BASE + path, data=data, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=600) as response:
        assert response.status == 200, response.status
        return json.load(response)


def main():
    assert request("/health")["status"] == "ok"
    assert MODEL in {model["id"] for model in request("/v1/models")["data"]}
    start = time.monotonic()
    text = request("/v1/chat/completions", {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Reply with exactly LOCAL_OK"}],
        "max_tokens": 32,
        "temperature": 0,
        "chat_template_kwargs": {"enable_thinking": False},
    })
    assert text["choices"][0]["message"]["content"].strip() == "LOCAL_OK", text
    print(json.dumps({"probe": "text", "elapsed_seconds": time.monotonic()-start,
                      "usage": text.get("usage"), "timings": text.get("timings")}),
          flush=True)
    tool = request("/v1/chat/completions", {
        "model": MODEL,
        "messages": [{"role": "user",
                      "content": "Call read with path lab-fixture.txt. Do not answer in prose."}],
        "tools": [{"type": "function", "function": {
            "name": "read", "description": "Read a local lab text fixture",
            "parameters": {"type": "object",
                           "properties": {"path": {"type": "string"}},
                           "required": ["path"]},
        }}],
        "tool_choice": {"type": "function", "function": {"name": "read"}},
        "max_tokens": 128,
        "temperature": 0,
        "chat_template_kwargs": {"enable_thinking": False},
    })
    call = tool["choices"][0]["message"]["tool_calls"][0]["function"]
    assert call["name"] == "read", tool
    assert json.loads(call["arguments"]) == {"path": "lab-fixture.txt"}, tool
    print(json.dumps({"probe": "tool_call", "function": call}), flush=True)
    print("PASS: health, model identity, exact text and synthetic tool arguments")


if __name__ == "__main__":
    main()
