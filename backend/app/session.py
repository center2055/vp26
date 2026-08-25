from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


SESSION_COOKIE_NAME = "vp26_session"
SESSION_HEADER_NAME = "X-VP26-Session"
# Ein Schuljahr: kurz genug, dass ein vergessenes Geraet nicht ewig Zugriff behaelt.
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365


@dataclass(frozen=True)
class SessionCredentials:
    school_id: int
    username: str
    password: str
    server_domain: str
    port: int | None

    def public_view(self) -> dict[str, object]:
        # Alles ausser dem Passwort darf zurueck an die Oberflaeche.
        return {
            "school_id": self.school_id,
            "username": self.username,
            "server_domain": self.server_domain,
            "port": self.port,
        }


def _key_file() -> Path:
    return Path(__file__).resolve().parent.parent / ".vp26-session-key"


def _load_or_create_key() -> bytes:
    configured = os.environ.get("VP26_SESSION_SECRET")
    if configured:
        return configured.encode("utf-8")

    key_file = _key_file()

    if key_file.exists():
        stored = key_file.read_text(encoding="utf-8").strip()
        if stored:
            return stored.encode("utf-8")

    # Ohne persistenten Schluessel waeren nach jedem Neustart des Dienstes alle
    # Anmeldungen ungueltig - gerade beim lokalen Sidecar waere das taeglich.
    generated = Fernet.generate_key()
    key_file.write_text(generated.decode("utf-8"), encoding="utf-8")

    try:
        key_file.chmod(0o600)
    except OSError:
        # Auf Windows ohne Wirkung, der Ordner selbst ist bereits nutzerprivat.
        pass

    return generated


_fernet: Fernet | None = None


def _cipher() -> Fernet:
    global _fernet

    if _fernet is None:
        _fernet = Fernet(_load_or_create_key())

    return _fernet


def issue_token(credentials: SessionCredentials) -> str:
    payload = json.dumps(
        {
            "school_id": credentials.school_id,
            "username": credentials.username,
            "password": credentials.password,
            "server_domain": credentials.server_domain,
            "port": credentials.port,
            # Gegen Wiederverwendung eines abgefangenen Tokens hilft es nicht, aber
            # es macht jeden Token einzigartig statt bei gleichem Login identisch.
            "nonce": secrets.token_urlsafe(8),
        },
        separators=(",", ":"),
    )

    return _cipher().encrypt(payload.encode("utf-8")).decode("utf-8")


def read_token(token: str | None) -> SessionCredentials | None:
    if not token:
        return None

    try:
        raw = _cipher().decrypt(token.encode("utf-8"), ttl=SESSION_MAX_AGE_SECONDS)
    except (InvalidToken, ValueError):
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None

    school_id = data.get("school_id")
    username = data.get("username")
    password = data.get("password")

    if not isinstance(school_id, int) or not isinstance(username, str) or not isinstance(password, str):
        return None

    port = data.get("port")
    server_domain = data.get("server_domain")

    return SessionCredentials(
        school_id=school_id,
        username=username,
        password=password,
        server_domain=server_domain if isinstance(server_domain, str) and server_domain else "stundenplan24.de",
        port=port if isinstance(port, int) else None,
    )
