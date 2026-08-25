from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values


def _split_csv(raw: str | None, fallback: tuple[str, ...]) -> tuple[str, ...]:
    if not raw:
        return fallback
    values = tuple(part.strip() for part in raw.split(",") if part.strip())
    return values or fallback


def _optional_int(raw: str | None) -> int | None:
    if raw is None or raw == "":
        return None
    return int(raw)


@dataclass(frozen=True)
class Settings:
    allowed_origins: tuple[str, ...]
    default_school_id: int | None
    default_username: str | None
    default_password: str | None
    default_server_domain: str
    default_port: int | None


def _file_values() -> dict[str, str]:
    backend_root = Path(__file__).resolve().parent.parent
    merged: dict[str, str] = {}

    for name in (".env", ".env.local"):
        for key, value in dotenv_values(backend_root / name).items():
            if value is not None:
                merged[key] = value

    return merged


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    # Bewusst ohne load_dotenv: das schreibt die Werte einmalig nach os.environ
    # und ignoriert danach jede Aenderung an der Datei - ein geaendertes oder
    # geloeschtes Passwort wirkte erst nach einem Neustart des Dienstes.
    values = _file_values()

    def read(key: str) -> str | None:
        # Echte Umgebungsvariablen haben Vorrang, sonst zaehlt die Datei.
        return os.environ.get(key) or values.get(key)

    return Settings(
        allowed_origins=_split_csv(
            read("VP26_ALLOWED_ORIGINS"),
            (
                "http://127.0.0.1:5173",
                "http://localhost:5173",
                "tauri://localhost",
                "http://tauri.localhost",
                "https://tauri.localhost",
                "https://center2055.github.io",
            ),
        ),
        default_school_id=_optional_int(read("VP26_DEFAULT_SCHOOL_ID")),
        default_username=read("VP26_DEFAULT_USERNAME") or None,
        default_password=read("VP26_DEFAULT_PASSWORD") or None,
        default_server_domain=read("VP26_DEFAULT_SERVER_DOMAIN") or "stundenplan24.de",
        default_port=_optional_int(read("VP26_DEFAULT_PORT")),
    )
