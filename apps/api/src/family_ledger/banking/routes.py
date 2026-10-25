import secrets
from collections.abc import Callable
from datetime import datetime

from fastapi import APIRouter, Request, Response
from starlette.concurrency import run_in_threadpool

from ..auth import AuthError
from ..evidence.images import MAX_BYTES
from ..evidence.models import EvidenceItem
from ..evidence.repository import EvidenceRepository
from ..expenses.routes import RequestSession
from .models import AccountReveal, BankAccount, BankAccountCreate, BankAccountList
from .repository import BankRepository


def financial_router(
    dsn: str,
    authenticated: Callable[[Request], RequestSession],
    origin_check: Callable[[Request], None],
    clock: Callable[[], datetime],
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/families/{family_id}", tags=["financial-data"])
    banks = BankRepository(dsn)
    evidence = EvidenceRepository(dsn)

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

    @router.get("/bank-accounts", response_model=BankAccountList)
    def listing(family_id: str, request: Request) -> BankAccountList:
        return banks.listing(family_id, actor(request, family_id), clock())

    @router.post("/bank-accounts", response_model=BankAccount)
    def create(
        family_id: str, body: BankAccountCreate, request: Request
    ) -> BankAccount:
        return banks.create(family_id, actor(request, family_id, True), body, clock())

    @router.post("/bank-accounts/{account_id}/default", response_model=BankAccountList)
    def set_default(
        family_id: str, account_id: str, request: Request
    ) -> BankAccountList:
        return banks.set_default(
            family_id, actor(request, family_id, True), account_id, clock()
        )

    @router.post("/bank-accounts/{account_id}/reveal", response_model=AccountReveal)
    def reveal(family_id: str, account_id: str, request: Request) -> AccountReveal:
        return banks.reveal(
            family_id, actor(request, family_id, True), account_id, clock()
        )

    @router.post(
        "/evidence",
        response_model=EvidenceItem,
        openapi_extra={
            "requestBody": {
                "required": True,
                "content": {
                    mime: {"schema": {"type": "string", "format": "binary"}}
                    for mime in ("image/png", "image/jpeg", "image/webp")
                },
            }
        },
    )
    async def upload(family_id: str, request: Request) -> EvidenceItem:
        user = actor(request, family_id, True)
        if request.headers.get("content-type", "").split(";")[0].lower() not in (
            "image/png",
            "image/jpeg",
            "image/webp",
        ):
            raise AuthError(
                422, "INVALID_EVIDENCE", "JPG, PNG, WebP 이미지를 올려 주세요."
            )
        data = bytearray()
        async for chunk in request.stream():
            if len(data) + len(chunk) > MAX_BYTES:
                raise AuthError(
                    413, "EVIDENCE_TOO_LARGE", "이미지는 6MiB 이하로 올려 주세요."
                )
            data.extend(chunk)
        return await run_in_threadpool(
            evidence.upload, family_id, user, bytes(data), clock()
        )

    @router.get(
        "/evidence/{evidence_id}/preview",
        response_class=Response,
        responses={200: {"content": {"image/png": {}}}},
    )
    def preview(family_id: str, evidence_id: str, request: Request) -> Response:
        return Response(
            evidence.preview(
                family_id, actor(request, family_id), evidence_id, clock()
            ),
            media_type="image/png",
            headers={"Content-Disposition": 'inline; filename="receipt.png"'},
        )

    return router
