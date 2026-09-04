from __future__ import annotations

from typing import Any

import requests
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from vpmobil import ResourceNotFound, Stundenplan24Pfade, Unauthorized, Vertretungsplan

from app.config import get_settings
from app.database import (
    get_teacher_analytics,
    get_teacher_history,
    init_db,
    record_plan,
)
from app.demo_data import get_demo_plan
from app.schemas import (
    FetchPlanRequest,
    PlanResponse,
    SessionRequest,
    TeacherAnalyticsResponse,
    TeacherDayHistoryEntry,
)
from app.serializers import serialize_empty_plan, serialize_plan
from app.session import (
    SESSION_COOKIE_NAME,
    SESSION_HEADER_NAME,
    SESSION_MAX_AGE_SECONDS,
    SessionCredentials,
    issue_token,
    read_token,
)


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


@app.on_event("startup")
def startup_event():
    init_db()
    print("VP26 Backend started successfully and is ready to accept requests on port 8000.", flush=True)


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


def _session_from_request(request: Request) -> SessionCredentials | None:
    # Im Browser transportiert das HttpOnly-Cookie die Anmeldung, in der
    # Desktop-App der Header - dort liegt der Token in einer Datei im App-Ordner.
    return read_token(request.headers.get(SESSION_HEADER_NAME)) or read_token(
        request.cookies.get(SESSION_COOKIE_NAME)
    )


def _resolved_credentials(payload: FetchPlanRequest, session: SessionCredentials | None) -> dict[str, Any]:
    current_settings = _current_settings()
    school_id = _coalesce(payload.school_id, session.school_id if session else None)
    username = _coalesce(payload.username, session.username if session else None)
    password = _coalesce(payload.password, session.password if session else None)

    # Server-Defaults sind ausdruecklich nur ein Fallback fuer den Eigenbetrieb und
    # greifen nie, solange eine Anmeldung vorliegt.
    if not all((school_id, username, password)):
        school_id = _coalesce(school_id, current_settings.default_school_id)
        username = _coalesce(username, current_settings.default_username)
        password = _coalesce(password, current_settings.default_password)

    if not all((school_id, username, password)):
        raise HTTPException(
            status_code=401,
            detail="Bitte zuerst mit Schulnummer, Benutzername und Passwort anmelden.",
        )

    server_domain = _coalesce(
        payload.server_domain,
        (session.server_domain if session else None) or current_settings.default_server_domain,
    )
    port = _coalesce(payload.port, (session.port if session else None) or current_settings.default_port)

    return {
        "school_id": int(school_id),
        "username": str(username),
        "password": str(password),
        "server_domain": server_domain,
        "port": port,
    }


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "message": "VP26 API is running", "health": "/api/health"}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/bootstrap")
def bootstrap(request: Request) -> dict[str, object]:
    current_settings = _current_settings()
    session = _session_from_request(request)

    # Der Anmeldestand des Geraets zaehlt, nicht was auf dem Server hinterlegt ist:
    # jede Schule und jede Person meldet sich mit den eigenen Zugangsdaten an.
    return {
        "authenticated": session is not None,
        "session": session.public_view() if session else None,
        "has_backend_defaults": bool(
            current_settings.default_school_id
            and current_settings.default_username
            and current_settings.default_password
        ),
        "default_server_domain": current_settings.default_server_domain,
        "default_port": current_settings.default_port,
        "default_scope": "classes",
    }


LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]", "tauri.localhost"}


def _apply_session_cookie(response: Response, request: Request, token: str) -> None:
    # Alles ausser einem lokalen Aufruf gilt als oeffentlich: dort laeuft die Seite
    # auf einer anderen Domain als das Backend, das Cookie braucht SameSite=None
    # samt Secure. Bewusst nicht an x-forwarded-proto festgemacht - fehlt der
    # Header hinter einem Tunnel, verwirft der Browser das Cookie kommentarlos.
    # Lokal ueber http waere Secure umgekehrt genauso ein stiller Totalausfall.
    hostname = (request.url.hostname or "").lower()
    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").lower()

    # Beide Signale zusammen: schreibt ein Proxy den Host auf localhost um, verraet
    # der Forwarded-Header die oeffentliche Herkunft - und umgekehrt.
    is_local = hostname in LOCAL_HOSTS and forwarded_proto != "https"

    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=not is_local,
        samesite="lax" if is_local else "none",
        path="/",
    )


@app.post("/api/session")
def create_session(payload: SessionRequest, request: Request, response: Response) -> dict[str, object]:
    server_domain = payload.server_domain or _current_settings().default_server_domain

    client = Vertretungsplan(
        payload.school_id,
        payload.username,
        payload.password,
        serverdomain=server_domain,
        port=payload.port,
        dateipfadschema=Stundenplan24Pfade.PlanKl,
    )

    # Einmal wirklich abrufen: sonst merkt man einen Tippfehler erst beim Plan.
    try:
        client.fetch(payload.probe_date)
    except Unauthorized as exc:
        raise HTTPException(status_code=401, detail=exc.message) from exc
    except ResourceNotFound:
        # Kein Plan fuer diesen Tag heisst nur: der Zugang stimmt, die Datei fehlt.
        pass
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Upstream request failed: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"Ungültige Antwort vom VPlan-Server: {exc}") from exc

    credentials = SessionCredentials(
        school_id=payload.school_id,
        username=payload.username,
        password=payload.password,
        server_domain=server_domain,
        port=payload.port,
    )
    token = issue_token(credentials)
    _apply_session_cookie(response, request, token)

    return {
        "authenticated": True,
        "session": credentials.public_view(),
        # Die Desktop-App legt den Token in ihren eigenen Ordner statt in ein Cookie.
        "token": token,
    }


@app.get("/api/session")
def read_session(request: Request) -> dict[str, object]:
    session = _session_from_request(request)

    if session is None:
        raise HTTPException(status_code=401, detail="Keine gültige Anmeldung.")

    return {"authenticated": True, "session": session.public_view()}


@app.delete("/api/session")
def delete_session(response: Response) -> dict[str, object]:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"authenticated": False}


@app.post("/api/plans/fetch", response_model=PlanResponse)
def fetch_plan(payload: FetchPlanRequest, request: Request) -> PlanResponse:
    if payload.demo:
        return get_demo_plan(payload)

    credentials = _resolved_credentials(payload, _session_from_request(request))
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

    # Persist daily records into SQLite database for historical analytics
    try:
        record_plan(response, school_id=credentials["school_id"])
    except Exception as exc:
        print(f"Warning: Failed to record plan into database: {exc}", flush=True)

    return response


@app.get("/api/analytics/teachers", response_model=TeacherAnalyticsResponse)
def read_teacher_analytics(
    request: Request,
    days: int = 30,
    from_date: str | None = None,
    to_date: str | None = None,
) -> TeacherAnalyticsResponse:
    session = _session_from_request(request)
    school_id = session.school_id if session else 0
    return get_teacher_analytics(
        school_id=school_id,
        from_date=from_date,
        to_date=to_date,
        days=days,
    )


@app.get("/api/analytics/teachers/{teacher_id}", response_model=list[TeacherDayHistoryEntry])
def read_teacher_history(
    teacher_id: str,
    request: Request,
    limit: int = 60,
) -> list[TeacherDayHistoryEntry]:
    session = _session_from_request(request)
    school_id = session.school_id if session else 0
    return get_teacher_history(
        teacher_id=teacher_id,
        school_id=school_id,
        limit=limit,
    )

