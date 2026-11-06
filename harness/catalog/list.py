#!/usr/bin/env python3
"""Muestra el snapshot local de proveedores sin contactar ningún servicio."""

import json
import sys
from pathlib import Path

SNAPSHOT = Path(__file__).with_name("snapshot.json")
REQUIRED = (
    "name", "baseUrl", "keyUrl", "requirements", "upstreamFreeModels",
    "upstreamMaxContext", "upstreamCategory",
)


def unavailable() -> None:
    print("doom: catálogo local no disponible", file=sys.stderr)
    raise SystemExit(1)


def nonempty_string(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip()) and "\x00" not in value


def https_url_or_none(value: object) -> bool:
    if value is None:
        return True
    if not isinstance(value, str) or not value.startswith("https://") or any(char.isspace() for char in value):
        return False
    host = value[8:].split("/", 1)[0]
    return bool(host) and "." in host


def load_snapshot() -> dict:
    try:
        data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data["providers"], list):
            raise ValueError
        if not all(nonempty_string(data[field]) for field in ("source", "revision", "snapshotDate", "notice")):
            raise ValueError
        for provider in data["providers"]:
            if not isinstance(provider, dict) or any(key not in provider for key in REQUIRED):
                raise ValueError
            if not nonempty_string(provider["name"]):
                raise ValueError
            if not all(https_url_or_none(provider[field]) for field in ("baseUrl", "keyUrl")):
                raise ValueError
            if not all(nonempty_string(provider[field]) for field in ("requirements", "upstreamCategory")):
                raise ValueError
            if provider["upstreamFreeModels"] is not None and (not isinstance(provider["upstreamFreeModels"], int) or isinstance(provider["upstreamFreeModels"], bool) or provider["upstreamFreeModels"] < 0):
                raise ValueError
            if provider["upstreamMaxContext"] is not None and not nonempty_string(provider["upstreamMaxContext"]):
                raise ValueError
        return data
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        unavailable()


def shown(value: object) -> str:
    return "no publicado" if value is None else str(value)


def main(arguments: list[str]) -> None:
    if len(arguments) > 1:
        print("doom: catalogo acepta como máximo un filtro de nombre", file=sys.stderr)
        raise SystemExit(2)

    data = load_snapshot()
    providers = data["providers"]
    selected = providers
    if arguments:
        needle = arguments[0].casefold()
        selected = [provider for provider in providers if needle in provider["name"].casefold()]
        if not selected:
            print(f"doom: no hay proveedores que coincidan con: {arguments[0]}", file=sys.stderr)
            raise SystemExit(2)

    total = len(providers)
    count = len(selected)
    title = f"Catálogo offline de proveedores ({count} de {total})." if arguments else f"Catálogo offline de proveedores ({total})."
    print(title)
    print(f"Fuente: {data['source']}")
    print(f"Revisión: {data['revision']}")
    print(f"Fecha del snapshot: {data['snapshotDate']}")
    print("Aviso: datos declarados por upstream; límites, disponibilidad, costos y privacidad no están verificados. El catálogo no contacta servicios.")
    print("Proveedor | URL base | URL de clave | Requisitos | Modelos gratis declarados | Contexto máximo declarado | Categoría upstream")
    for provider in selected:
        print(" | ".join(shown(provider[key]) for key in REQUIRED))


if __name__ == "__main__":
    main(sys.argv[1:])
