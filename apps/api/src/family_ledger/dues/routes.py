import secrets
from collections.abc import Callable
from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Request

from ..auth import AuthError, LocalAuth
from ..auth_models import InvitationResponse
from ..documents.statement import KST
from ..expenses.routes import RequestSession
from .matching import reconcile
from .models import (
    DuesCommand,
    DuesOverview,
    DuesResult,
    ParticipantCreate,
    ParticipantUpdate,
    ReconcileResult,
)
from .participants import save_participant
from .repository import DuesRepository


def dues_router(
    dsn: str,
    authenticated: Callable[[Request], RequestSession],
    origin_check: Callable[[Request], None],
    clock: Callable[[], datetime],
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/families/{family_id}", tags=["dues"])
    repository = DuesRepository(dsn)

    def actor(request: Request, family: str, write: bool = False) -> str:
        if write:
            origin_check(request)
        session = authenticated(request)
        if session.family_id != family:
            raise AuthError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.")
        if write and not secrets.compare_digest(
            request.headers.get("x-csrf-token", "").encode(),
            session.csrf_token.encode(),
        ):
            raise AuthError(403, "CSRF_REJECTED", "화면을 새로고침해 주세요.")
        return session.user_id

    @router.get("/dues", response_model=DuesOverview)
    def listing(
        family_id: str, request: Request, month: str | None = None
    ) -> DuesOverview:
        user = actor(request, family_id)
        selected = (
            month if month is not None else clock().astimezone(KST).strftime("%Y-%m")
        )
        try:
            if len(selected) != 7:
                raise ValueError()
            date.fromisoformat(selected + "-01")
        except ValueError:
            raise AuthError(422, "INVALID_MONTH", "조회 월을 확인해 주세요.") from None
        return repository.overview(family_id, user, selected, clock())

    @router.post("/dues", response_model=DuesResult)
    def change(family_id: str, body: DuesCommand, request: Request) -> DuesResult:
        return repository.command(
            family_id, actor(request, family_id, True), body, clock()
        )

    @router.post("/dues/reconcile", response_model=ReconcileResult)
    def reconcile_deposits(family_id: str, request: Request) -> ReconcileResult:
        user = actor(request, family_id, True)
        now = clock()
        with repository.connect() as conn:
            repository.lock(conn, family_id)
            repository.manager(conn, family_id, user, now)
            count = reconcile(conn, family_id, user, now)
            return ReconcileResult(matched_count=count, message=f"입금 {count}건을 회비에 자동 연결했습니다.")

    @router.post("/participants", response_model=DuesResult)
    def create_participant(
        family_id: str, body: ParticipantCreate, request: Request
    ) -> DuesResult:
        return save_participant(
            repository, family_id, actor(request, family_id, True), body, clock()
        )

    @router.post("/participants/{participant_id}/profile", response_model=DuesResult)
    def update_participant(
        family_id: str, participant_id: UUID, body: ParticipantUpdate, request: Request
    ) -> DuesResult:
        return save_participant(
            repository,
            family_id,
            actor(request, family_id, True),
            body,
            clock(),
            str(participant_id),
        )

    @router.post(
        "/participants/{participant_id}/invite", response_model=InvitationResponse
    )
    def invite_participant(
        family_id: str, participant_id: UUID, request: Request
    ) -> InvitationResponse:
        user = actor(request, family_id, True)
        token, expires = LocalAuth(dsn).invite(
            user, family_id, clock(), str(participant_id)
        )
        return InvitationResponse(invite_token=token, expires_at=expires)

    return router
