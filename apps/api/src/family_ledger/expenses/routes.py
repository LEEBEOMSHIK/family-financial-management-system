import secrets
from collections.abc import Callable
from datetime import datetime
from typing import Protocol

from fastapi import APIRouter, Request

from ..auth import AuthError
from ..banking.models import AccountReveal
from ..evidence.models import EvidenceAttach
from .models import (
    ExpenseCreate,
    ExpenseDecisionInput,
    ExpenseItem,
    ExpenseList,
    PaymentInput,
)
from .payments import record_payment
from .repository import ExpenseRepository


class RequestSession(Protocol):
    user_id: str
    family_id: str
    csrf_token: str


def expense_router(
    dsn: str,
    authenticated: Callable[[Request], RequestSession],
    origin_check: Callable[[Request], None],
    clock: Callable[[], datetime],
) -> APIRouter:
    router = APIRouter(
        prefix="/api/v1/families/{family_id}/expenses", tags=["expenses"]
    )
    repository = ExpenseRepository(dsn)

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

    @router.get("", response_model=ExpenseList)
    def listing(family_id: str, request: Request) -> ExpenseList:
        return repository.list(family_id, actor(request, family_id), clock())

    @router.get("/{request_id}", response_model=ExpenseItem)
    def detail(family_id: str, request_id: str, request: Request) -> ExpenseItem:
        return repository.detail(
            family_id, actor(request, family_id), request_id, clock()
        )

    @router.post("", response_model=ExpenseItem)
    def submit(family_id: str, body: ExpenseCreate, request: Request) -> ExpenseItem:
        return repository.create(
            family_id, actor(request, family_id, True), body, clock()
        )

    @router.post("/{request_id}/decisions", response_model=ExpenseItem)
    def decide(
        family_id: str, request_id: str, body: ExpenseDecisionInput, request: Request
    ) -> ExpenseItem:
        return repository.decide(
            family_id, actor(request, family_id, True), request_id, body, clock()
        )

    @router.post("/{request_id}/payment", response_model=ExpenseItem)
    def payment(
        family_id: str, request_id: str, body: PaymentInput, request: Request
    ) -> ExpenseItem:
        return record_payment(
            dsn, family_id, actor(request, family_id, True), request_id, body, clock()
        )

    @router.post("/{request_id}/evidence", response_model=ExpenseItem)
    def attach(
        family_id: str, request_id: str, body: EvidenceAttach, request: Request
    ) -> ExpenseItem:
        return repository.attach_evidence(
            family_id,
            actor(request, family_id, True),
            request_id,
            body.evidence_ids,
            clock(),
        )

    @router.post("/{request_id}/payee-account", response_model=AccountReveal)
    def reveal(family_id: str, request_id: str, request: Request) -> AccountReveal:
        return repository.reveal_account(
            family_id, actor(request, family_id, True), request_id, clock()
        )

    return router
