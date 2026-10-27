"""Loopback development API. Production startup is intentionally unsupported."""

import os
import secrets
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit

import psycopg
from fastapi import FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .auth import AuthError, LocalAuth
from .auth_models import InvitationResponse, PasswordLogin, RegisterRequest
from .cash_flow import FlowResponse, FlowUnit, bank_flow, synthetic_flow
from .dashboard_layout import LayoutRepository, LayoutResponse, LayoutWrite
from .domain import AS_OF, FAMILY, ReadService, Repository, SyntheticRepository
from .models import (
    DashboardResponse,
    Direction,
    ErrorResponse,
    LoginRequest,
    ManagementResponse,
    Period,
    RoleChange,
    RolesResponse,
    SessionResponse,
    TransactionsResponse,
    User,
)
from .roles import RoleError, RoleRepository

COOKIE = "family_session"


def configured_origins() -> tuple[str, ...]:
    origin = os.getenv("WEB_ORIGIN")
    if not origin:
        return ("http://127.0.0.1:3000", "http://localhost:3000")
    parsed = urlsplit(origin)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in ("localhost", "127.0.0.1")
        or parsed.username
        or parsed.password
        or parsed.path
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError("WEB_ORIGIN must be a loopback HTTP origin")
    # Both names refer to this local service; preserve the configured port.
    port = f":{parsed.port}" if parsed.port is not None else ""
    return (f"http://127.0.0.1{port}", f"http://localhost{port}")


@dataclass(frozen=True)
class Config:
    app_env: str
    auth_provider: str
    role_path: Path | None = None
    allowed_origins: tuple[str, ...] = (
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    )
    database_url: str | None = None


@dataclass
class Session:
    user_id: str
    family_id: str
    csrf_token: str
    expires_at: datetime


class AccessError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def create_app(
    config: Config | None = None, repository: Repository | None = None
) -> FastAPI:
    config = config or Config(
        os.getenv("APP_ENV", ""),
        os.getenv("AUTH_PROVIDER", ""),
        Path(os.environ["ROLE_STORE_PATH"]) if os.getenv("ROLE_STORE_PATH") else None,
        allowed_origins=configured_origins(),
        database_url=os.getenv("DATABASE_URL"),
    )
    if config.app_env != "development" or config.auth_provider not in (
        "development",
        "local_password",
    ):
        raise RuntimeError(
            "This local service requires APP_ENV=development and an explicit development or local_password provider"
        )
    app = FastAPI(
        title="Family Ledger Development API",
        version="0.1.0",
        responses={
            401: {"model": ErrorResponse},
            403: {"model": ErrorResponse},
            404: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
        },
    )
    app.state.sessions = {}
    app.state.clock = lambda: datetime.now(UTC)
    auth = None
    if config.auth_provider == "local_password":
        if not config.database_url:
            raise RuntimeError(
                "Local password development provider requires a database configuration"
            )
        from .postgres import PostgresRepository

        role_repository = PostgresRepository(config.database_url)
        auth = LocalAuth(config.database_url)
    else:
        role_repository = RoleRepository(
            repository or SyntheticRepository(), config.role_path
        )
    service = ReadService(role_repository)

    @app.exception_handler(RoleError)
    async def role_error(request: Request, exc: RoleError):
        return JSONResponse(
            {"error": {"code": "ROLE_CHANGE_REJECTED", "message": exc.message}},
            status_code=exc.status,
        )

    @app.exception_handler(psycopg.Error)
    async def database_error(request: Request, exc: psycopg.Error):
        return JSONResponse(
            {
                "error": {
                    "code": "STORAGE_UNAVAILABLE",
                    "message": "저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
                }
            },
            status_code=503,
        )

    @app.middleware("http")
    async def private_response(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(AccessError)
    @app.exception_handler(AuthError)
    async def access_error(request: Request, exc: AccessError):
        return JSONResponse(
            {"error": {"code": exc.code, "message": exc.message}},
            status_code=exc.status,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse(
            {
                "error": {
                    "code": "INVALID_REQUEST",
                    "message": "요청 값을 확인해 주세요.",
                }
            },
            status_code=422,
        )

    def origin_check(request: Request) -> None:
        if request.headers.get("origin") not in config.allowed_origins:
            raise AccessError(
                403, "CSRF_REJECTED", "허용된 화면에서 다시 시도해 주세요."
            )

    def authenticated(request: Request) -> Session:
        session = (
            auth.session(request.cookies.get(COOKIE, ""), app.state.clock())
            if auth
            else app.state.sessions.get(request.cookies.get(COOKIE, ""))
        )
        if session is None or session.expires_at <= app.state.clock():
            raise AccessError(401, "AUTH_REQUIRED", "개발용 계정으로 로그인해 주세요.")
        capabilities = service.capabilities(
            session.user_id, session.family_id, app.state.clock()
        )
        if not capabilities:
            raise AccessError(
                403, "MEMBERSHIP_REQUIRED", "현재 가족 구성원 권한이 없습니다."
            )
        # Request-local only: never carry authorization across requests.
        request.state.capabilities = capabilities
        return session

    def family_access(request: Request, family_id: str, capability: str) -> Session:
        session = authenticated(request)
        if session.family_id != family_id:
            raise AccessError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.")
        if capability not in request.state.capabilities:
            raise AccessError(
                403, "FORBIDDEN", "현재 역할로는 이 화면에 접근할 수 없습니다."
            )
        return session

    def session_response(session: Session, capabilities: list[str] | None = None) -> SessionResponse:
        return SessionResponse(
            user=User(
                id=session.user_id,
                display_name=auth.display_name(session.user_id)
                if auth
                else (
                    "합성 총괄관리자"
                    if session.user_id.endswith("super_admin")
                    else "합성 총무"
                    if session.user_id.endswith("treasurer")
                    else "합성 구성원"
                ),
            ),
            family_id=session.family_id,
            csrf_token=session.csrf_token,
            capabilities=capabilities if capabilities is not None else service.capabilities(
                session.user_id, session.family_id, app.state.clock()
            ),
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    def login(
        body: LoginRequest, request: Request, response: Response
    ) -> SessionResponse:
        origin_check(request)
        now = app.state.clock()
        # Prune expired sessions and rotate any previous browser session.
        app.state.sessions = {
            key: value
            for key, value in app.state.sessions.items()
            if value.expires_at > now
        }
        app.state.sessions.pop(request.cookies.get(COOKIE, ""), None)
        key = secrets.token_urlsafe(32)
        session = Session(
            f"synthetic-{body.profile}",
            FAMILY,
            secrets.token_urlsafe(32),
            now + timedelta(hours=1),
        )
        app.state.sessions[key] = session
        response.set_cookie(
            COOKIE,
            key,
            max_age=3600,
            httponly=True,
            samesite="strict",
            secure=False,
            path="/",
        )
        return session_response(session)

    if config.auth_provider == "development":
        app.post("/api/v1/dev/session", response_model=SessionResponse)(login)

    if auth:

        def issue_session(
            user_id: str, request: Request, response: Response
        ) -> SessionResponse:
            capabilities = service.capabilities(user_id, FAMILY, app.state.clock())
            if not capabilities:
                raise AccessError(
                    403, "MEMBERSHIP_REQUIRED", "현재 가족 구성원 권한이 없습니다."
                )
            auth.revoke(request.cookies.get(COOKIE, ""), app.state.clock())
            key, session = auth.create_session(user_id, app.state.clock())
            response.set_cookie(
                COOKIE,
                key,
                max_age=8 * 3600,
                httponly=True,
                samesite="strict",
                secure=False,
                path="/",
            )
            return session_response(session, capabilities)

        @app.post("/api/v1/auth/login", response_model=SessionResponse)
        def password_login(
            body: PasswordLogin, request: Request, response: Response
        ) -> SessionResponse:
            origin_check(request)
            user_id = auth.login(
                body,
                request.client.host if request.client else "unknown",
                app.state.clock(),
            )
            return issue_session(user_id, request, response)

        @app.post("/api/v1/auth/register", response_model=SessionResponse)
        def register(
            body: RegisterRequest, request: Request, response: Response
        ) -> SessionResponse:
            origin_check(request)
            user_id = auth.register(
                body,
                request.client.host if request.client else "unknown",
                app.state.clock(),
            )
            return issue_session(user_id, request, response)

        @app.post(
            "/api/v1/families/{family_id}/invitations",
            response_model=InvitationResponse,
        )
        def invite(family_id: str, request: Request) -> InvitationResponse:
            origin_check(request)
            session = family_access(request, family_id, "manage_roles")
            if not secrets.compare_digest(
                request.headers.get("x-csrf-token", "").encode("utf-8"),
                session.csrf_token.encode("ascii"),
            ):
                raise AccessError(
                    403, "CSRF_REJECTED", "화면을 새로고침한 뒤 다시 시도해 주세요."
                )
            token, expires = auth.invite(session.user_id, family_id, app.state.clock())
            return InvitationResponse(invite_token=token, expires_at=expires)

    @app.get("/api/v1/session", response_model=SessionResponse)
    def get_session(request: Request) -> SessionResponse:
        session = authenticated(request)
        return session_response(session, request.state.capabilities)

    @app.delete("/api/v1/session", status_code=204)
    def logout(request: Request) -> Response:
        origin_check(request)
        session = (
            auth.session(
                request.cookies.get(COOKIE, ""), app.state.clock(), require_active=False
            )
            if auth
            else app.state.sessions.get(request.cookies.get(COOKIE, ""))
        )
        if session is not None and not secrets.compare_digest(
            request.headers.get("x-csrf-token", "").encode("utf-8"),
            session.csrf_token.encode("ascii"),
        ):
            raise AccessError(
                403, "CSRF_REJECTED", "화면을 새로고침한 뒤 다시 시도해 주세요."
            )
        if auth:
            auth.revoke(request.cookies.get(COOKIE, ""), app.state.clock())
        else:
            app.state.sessions.pop(request.cookies.get(COOKIE, ""), None)
        response = Response(status_code=204)
        response.delete_cookie(COOKIE, path="/", httponly=True, samesite="strict")
        return response

    @app.get(
        "/api/v1/families/{family_id}/dashboard-layout", response_model=LayoutResponse
    )
    def get_layout(family_id: str, request: Request) -> LayoutResponse:
        session = family_access(request, family_id, "view_dashboard")
        if not config.database_url:
            raise AccessError(
                503, "DB_REQUIRED", "개인 배치 저장에는 데이터베이스가 필요합니다."
            )
        return LayoutRepository(config.database_url).read(
            family_id, session.user_id, app.state.clock()
        )

    @app.post(
        "/api/v1/families/{family_id}/dashboard-layout", response_model=LayoutResponse
    )
    def save_layout(
        family_id: str, body: LayoutWrite, request: Request
    ) -> LayoutResponse:
        origin_check(request)
        session = family_access(request, family_id, "view_dashboard")
        if not secrets.compare_digest(
            request.headers.get("x-csrf-token", "").encode("utf-8"),
            session.csrf_token.encode("ascii"),
        ):
            raise AccessError(
                403, "CSRF_REJECTED", "화면을 새로고침한 뒤 다시 시도해 주세요."
            )
        if not config.database_url:
            raise AccessError(
                503, "DB_REQUIRED", "개인 배치 저장에는 데이터베이스가 필요합니다."
            )
        return LayoutRepository(config.database_url).save(
            family_id, session.user_id, app.state.clock(), body
        )

    @app.get('/api/v1/families/{family_id}/dashboard/flow', response_model=FlowResponse)
    def flow(family_id: str, request: Request, unit: FlowUnit = 'month') -> FlowResponse:
        session = family_access(request, family_id, 'view_dashboard')
        now = app.state.clock()
        if config.database_url:
            imported = bank_flow(config.database_url, family_id, session.user_id, now, unit)
            if imported is not None:
                return imported
        return synthetic_flow(service.repository, family_id, now, unit)

    @app.get("/api/v1/families/{family_id}/dashboard", response_model=DashboardResponse)
    def dashboard(
        family_id: str, request: Request, period: Period = "month"
    ) -> DashboardResponse:
        session = family_access(request, family_id, "view_dashboard")
        if config.database_url:
            from .documents.dashboard import imported_dashboard
            imported = imported_dashboard(config.database_url, family_id, session.user_id, app.state.clock(), period)
            if imported is not None:
                return imported
        return service.dashboard(family_id, period)

    @app.get(
        "/api/v1/families/{family_id}/transactions", response_model=TransactionsResponse
    )
    def transactions(
        family_id: str,
        request: Request,
        period: Period = "month",
        direction: Direction = "all",
        start_on: date | None = None,
        end_on: date | None = None,
        offset: int = Query(default=0, ge=0, le=100000),
        limit: int = Query(default=50, ge=1, le=100),
    ) -> TransactionsResponse:
        session = family_access(request, family_id, "view_transactions")
        if config.database_url:
            from .documents.transactions import imported_transactions
            imported = imported_transactions(config.database_url, family_id, session.user_id, app.state.clock(), direction, start_on, end_on, offset, limit)
            if imported is not None:
                return imported
        items = service.transactions(family_id, period, direction)
        income = sum(int(item.amount_krw) for item in items if int(item.amount_krw) > 0)
        expense = -sum(int(item.amount_krw) for item in items if int(item.amount_krw) < 0)
        return TransactionsResponse(
            items=items[offset:offset + limit], as_of=AS_OF,
            total=len(items), offset=offset, limit=limit,
            income_krw=str(income), expense_krw=str(expense), net_krw=str(income-expense),
        )

    @app.get(
        "/api/v1/families/{family_id}/management", response_model=ManagementResponse
    )
    def management(family_id: str, request: Request) -> ManagementResponse:
        family_access(request, family_id, "manage")
        return ManagementResponse(
            pending_approvals=2, missing_evidence=1, unreconciled_payments=1
        )

    @app.get("/api/v1/families/{family_id}/roles", response_model=RolesResponse)
    def roles(family_id: str, request: Request) -> RolesResponse:
        family_access(request, family_id, "manage_roles")
        return named_roles(role_repository.snapshot(app.state.clock()))

    def named_roles(snapshot: RolesResponse) -> RolesResponse:
        if not auth:
            return snapshot
        return snapshot.model_copy(
            update={
                "members": [
                    member.model_copy(
                        update={"display_name": auth.display_name(member.user_id)}
                    )
                    for member in snapshot.members
                ]
            }
        )

    @app.post("/api/v1/families/{family_id}/roles", response_model=RolesResponse)
    def change_roles(
        family_id: str, body: RoleChange, request: Request
    ) -> RolesResponse:
        origin_check(request)
        session = family_access(request, family_id, "manage_roles")
        if not secrets.compare_digest(
            request.headers.get("x-csrf-token", "").encode("utf-8"),
            session.csrf_token.encode("ascii"),
        ):
            raise AccessError(
                403, "CSRF_REJECTED", "화면을 새로고침한 뒤 다시 시도해 주세요."
            )
        return named_roles(
            role_repository.change(session.user_id, body, app.state.clock())
        )

    if config.database_url and auth:
        from .banking.routes import financial_router
        from .documents.routes import document_router
        from .dues.routes import dues_router
        from .support.routes import support_router

        app.include_router(support_router(config.database_url, authenticated, origin_check, lambda: app.state.clock()))
        from .expenses.routes import expense_router

        app.include_router(dues_router(config.database_url, authenticated, origin_check, lambda: app.state.clock()))
        app.include_router(
            document_router(config.database_url, authenticated, origin_check, lambda: app.state.clock())
        )
        app.include_router(
            financial_router(
                config.database_url,
                authenticated,
                origin_check,
                lambda: app.state.clock(),
            )
        )
        app.include_router(
            expense_router(
                config.database_url,
                authenticated,
                origin_check,
                lambda: app.state.clock(),
            )
        )
    return app
