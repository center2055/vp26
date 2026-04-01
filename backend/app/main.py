from __future__ import annotations

from typing import Any

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from vpmobil import ResourceNotFound, Stundenplan24Pfade, Unauthorized, Vertretungsplan

from app.config import get_settings
from app.demo_data import get_demo_plan
from app.schemas import FetchPlanRequest, PlanResponse
from app.serializers import serialize_empty_plan, serialize_plan


settings = get_settings()
UPSTREAM_TIMEOUT_SECONDS = 20
_original_requests_get = requests.get


def _requests_get_with_timeout(*args, **kwargs):
    kwargs.setdefault("timeout", UPSTREAM_TIMEOUT_SECONDS)
    return _original_requests_get(*args, **kwargs)


requests.get = _requests_get_with_timeout
app = FastAPI(
    title="VP26 API",
    version="0.1.0",
    summary="JSON adapter for Indiware / VpMobil24 plans",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


SCOPE_TO_PATH = {
    "classes": Stundenplan24Pfade.PlanKl,
    "teachers": Stundenplan24Pfade.PlanLe,
    "rooms": Stundenplan24Pfade.PlanRa,
}


def _current_settings():
    get_settings.cache_clear()
    return get_settings()


def _coalesce(value, fallback):
    if value in (None, ""):
        return fallback
    return value


def _resolved_credentials(payload: FetchPlanRequest) -> dict[str, Any]:
    current_settings = _current_settings()
    school_id = _coalesce(payload.school_id, current_settings.default_school_id)
    username = _coalesce(payload.username, current_settings.default_username)
    password = _coalesce(payload.password, current_settings.default_password)

    if not all((school_id, username, password)):
        raise HTTPException(
            status_code=400,
            detail="Für Live-Daten werden Schulnummer, Benutzername und Passwort benötigt.",
        )

    return {
        "school_id": int(school_id),
        "username": str(username),
        "password": str(password),
        "server_domain": _coalesce(payload.server_domain, current_settings.default_server_domain),
        "port": _coalesce(payload.port, current_settings.default_port),
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/bootstrap")
def bootstrap() -> dict[str, object]:
    current_settings = _current_settings()
    return {
        "has_backend_defaults": bool(
            current_settings.default_school_id
            and current_settings.default_username
            and current_settings.default_password
        ),
        "default_school_id": current_settings.default_school_id,
        "default_username": current_settings.default_username,
        "default_server_domain": current_settings.default_server_domain,
        "default_port": current_settings.default_port,
        "default_scope": "classes",
    }


@app.post("/api/plans/fetch", response_model=PlanResponse)
def fetch_plan(payload: FetchPlanRequest) -> PlanResponse:
    if payload.demo:
        return get_demo_plan(payload)

    credentials = _resolved_credentials(payload)
    client = Vertretungsplan(
        credentials["school_id"],
        credentials["username"],
        credentials["password"],
        serverdomain=credentials["server_domain"],
        port=credentials["port"],
        dateipfadschema=SCOPE_TO_PATH[payload.scope],
    )

    try:
        plan_tag = client.fetch(payload.date)
    except Unauthorized as exc:
        raise HTTPException(status_code=401, detail=exc.message) from exc
    except ResourceNotFound as exc:
        return serialize_empty_plan(
            payload,
            source="vpmobil",
            additional_info=(
                "Für dieses Datum liegt kein veröffentlichter Plan vor. "
                "Das ist häufig ein freier Tag, Ferien oder ein noch nicht bereitgestellter Stand."
            ),
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Upstream request failed: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"Ungültige Antwort vom VPlan-Server: {exc}") from exc

    response = serialize_plan(plan_tag, payload, source="vpmobil")

    if payload.entity_id and not response.entities:
        raise HTTPException(
            status_code=404,
            detail=f"Kein Eintrag '{payload.entity_id}' im angefragten Plan gefunden.",
        )

    return response
