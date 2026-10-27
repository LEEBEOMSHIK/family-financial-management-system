import secrets
from collections.abc import Callable
from datetime import datetime
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response
from starlette.concurrency import run_in_threadpool

from ..auth import AuthError
from ..expenses.routes import RequestSession
from .files import MAX_BYTES
from .models import (
    DocumentItem,
    DocumentKind,
    DocumentList,
    DocumentUpload,
    ManagedEvidenceList,
)
from .repository import DocumentRepository


def document_router(
    dsn: str,
    authenticated: Callable[[Request], RequestSession],
    origin_check: Callable[[Request], None],
    clock: Callable[[], datetime],
) -> APIRouter:
    router = APIRouter(
        prefix="/api/v1/families/{family_id}/documents", tags=["documents"]
    )
    repository = DocumentRepository(dsn)

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

    def attachment(result: tuple[bytes, str, str]) -> Response:
        data, mime, name = result
        return Response(
            data,
            media_type=mime,
            headers={
                "Content-Disposition": "attachment; filename=\"document\"; filename*=UTF-8''"
                + quote(name, safe=""),
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "sandbox; default-src 'none'",
            },
        )

    @router.get("", response_model=DocumentList)
    def listing(
        family_id: str,
        request: Request,
        kind: DocumentKind | None = None,
        q: str = Query(default="", max_length=120),
        offset: int = Query(default=0, ge=0, le=100000),
    ) -> DocumentList:
        return repository.listing(
            family_id, actor(request, family_id), clock(), kind, q, offset
        )

    @router.post(
        "",
        response_model=DocumentItem,
        openapi_extra={
            "requestBody": {
                "required": True,
                "content": {
                    "application/octet-stream": {
                        "schema": {"type": "string", "format": "binary"}
                    }
                },
            }
        },
    )
    async def upload(
        family_id: str, request: Request, metadata: Annotated[DocumentUpload, Query()]
    ) -> DocumentItem:
        user = actor(request, family_id, True)
        await run_in_threadpool(repository.authorize, family_id, user, clock())
        data = bytearray()
        async for chunk in request.stream():
            if len(data) + len(chunk) > MAX_BYTES:
                raise AuthError(
                    413, "FILE_TOO_LARGE", "파일은 6MiB 이하로 올려 주세요."
                )
            data.extend(chunk)
        return await run_in_threadpool(
            repository.create, family_id, user, metadata, bytes(data), clock()
        )

    @router.get("/evidence", response_model=ManagedEvidenceList)
    def evidence(
        family_id: str,
        request: Request,
        q: str = Query(default="", max_length=120),
        offset: int = Query(default=0, ge=0, le=100000),
    ) -> ManagedEvidenceList:
        return repository.evidence(
            family_id, actor(request, family_id), clock(), q, offset
        )

    @router.get(
        "/evidence/{evidence_id}/download",
        response_class=Response,
        responses={200: {"content": {"application/octet-stream": {}}}},
    )
    def evidence_download(
        family_id: str, evidence_id: UUID, request: Request
    ) -> Response:
        return attachment(
            repository.evidence_download(
                family_id, actor(request, family_id), str(evidence_id), clock()
            )
        )

    @router.post('/{document_id}/sync', response_model=DocumentItem)
    def synchronize(family_id: str, document_id: UUID, request: Request) -> DocumentItem:
        return repository.sync_document(family_id, actor(request, family_id, True), str(document_id), clock())

    @router.get("/{document_id}/versions", response_model=DocumentList)
    def versions(family_id: str, document_id: UUID, request: Request) -> DocumentList:
        return repository.versions(
            family_id, actor(request, family_id), str(document_id), clock()
        )

    @router.get(
        "/{document_id}/download",
        response_class=Response,
        responses={200: {"content": {"application/octet-stream": {}}}},
    )
    def download(family_id: str, document_id: UUID, request: Request) -> Response:
        return attachment(
            repository.download(
                family_id, actor(request, family_id), str(document_id), clock()
            )
        )

    return router
