import secrets
from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response

from ..auth import AuthError
from ..expenses.routes import RequestSession
from .models import IssueCreate, IssueEventCreate, IssueItem, IssueList, Status
from .repository import SupportRepository


def support_router(
    dsn: str,
    authenticated: Callable[[Request], RequestSession],
    origin_check: Callable[[Request], None],
    clock: Callable[[], datetime],
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/families/{family_id}/issues", tags=["support"])
    repository = SupportRepository(dsn)

    def actor(request: Request, family: str, write: bool = False) -> str:
        if write:
            origin_check(request)
        session = authenticated(request)
        if session.family_id != family:
            raise AuthError(404, "NOT_FOUND", "문의를 찾을 수 없습니다.")
        if write and not secrets.compare_digest(
            request.headers.get("x-csrf-token", "").encode(),
            session.csrf_token.encode(),
        ):
            raise AuthError(403, "CSRF_REJECTED", "화면을 새로고침해 주세요.")
        return session.user_id

    @router.get("", response_model=IssueList)
    def listing(
        family_id: str,
        request: Request,
        q: str = Query(default="", max_length=120),
        status: Status | None = None,
        offset: int = Query(default=0, ge=0, le=100000),
    ) -> IssueList:
        return repository.listing(
            family_id, actor(request, family_id), clock(), q, status, offset
        )

    @router.post("", response_model=IssueItem)
    def create(family_id: str, request: Request, body: IssueCreate) -> IssueItem:
        return repository.create(
            family_id, actor(request, family_id, True), body, clock()
        )

    @router.get("/{issue_id}", response_model=IssueItem)
    def detail(family_id: str, issue_id: UUID, request: Request) -> IssueItem:
        return repository.detail(
            family_id, actor(request, family_id), str(issue_id), clock()
        )

    @router.get("/{issue_id}/image")
    def image(family_id: str, issue_id: UUID, request: Request) -> Response:
        data = repository.image(
            family_id, actor(request, family_id), str(issue_id), clock()
        )
        return Response(
            data,
            media_type="image/png",
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; sandbox",
            },
        )

    @router.post("/{issue_id}/events", response_model=IssueItem)
    def event(
        family_id: str, issue_id: UUID, request: Request, body: IssueEventCreate
    ) -> IssueItem:
        return repository.event(
            family_id, actor(request, family_id, True), str(issue_id), body, clock()
        )

    return router
