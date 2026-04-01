from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    backend_root = Path(__file__).resolve().parent.parent
    load_dotenv(backend_root / ".env")
    load_dotenv(backend_root / ".env.local")

    return Settings(
        allowed_origins=_split_csv(
            os.getenv("VP26_ALLOWED_ORIGINS"),
            (
                "http://127.0.0.1:5173",
                "http://localhost:5173",
                "tauri://localhost",
                "http://tauri.localhost",
                "https://tauri.localhost",
                "https://center2055.github.io",
            ),
        ),
        default_school_id=_optional_int(os.getenv("VP26_DEFAULT_SCHOOL_ID")),
        default_username=os.getenv("VP26_DEFAULT_USERNAME") or None,
        default_password=os.getenv("VP26_DEFAULT_PASSWORD") or None,
        default_server_domain=os.getenv("VP26_DEFAULT_SERVER_DOMAIN", "stundenplan24.de"),
        default_port=_optional_int(os.getenv("VP26_DEFAULT_PORT")),
    )
