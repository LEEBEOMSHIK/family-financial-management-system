"""Participant profiles and initial fees saved atomically with append-only history."""

from datetime import date, datetime
from uuid import uuid4

from psycopg.types.json import Jsonb

from ..auth import AuthError
from ..documents.statement import KST
from .matching import reconcile
from .models import (
    DuesCommand,
    DuesResult,
    ParticipantCreate,
    ParticipantUpdate,
    first_fee_month,
)
from .repository import DuesRepository


def save_participant(
    repository: DuesRepository,
    family: str,
    actor: str,
    body: ParticipantCreate | ParticipantUpdate,
    now: datetime,
    participant_id: str | None = None,
) -> DuesResult:
    payload = body.model_dump(mode="json")
    with repository.connect() as conn:
        repository.lock(conn, family)
        admin = repository.manager(conn, family, actor, now)
        if body.birthday is not None:
            birthday = body.birthday
            today = now.astimezone(KST).date()
            if birthday.year is None:
                raise AuthError(
                    422,
                    "BIRTH_YEAR_REQUIRED",
                    "생일 달력에서 출생연도까지 선택해 주세요.",
                )
            if birthday.year > today.year or (
                birthday.calendar == "solar"
                and date(birthday.year, birthday.month, birthday.day) > today
            ):
                raise AuthError(
                    422, "INVALID_BIRTHDAY", "미래의 생년월일은 등록할 수 없습니다."
                )

        if body.amount_krw is not None and not admin:
            raise AuthError(403, "FORBIDDEN", "회비는 총괄관리자만 설정할 수 있습니다.")
        previous = conn.execute(
            "SELECT participant_id,payload FROM participant_profile_event WHERE family_id=%s AND actor_id=%s AND operation_id=%s",
            (family, actor, str(body.operation_id)),
        ).fetchone()
        if previous:
            if ("expected_version" in previous["payload"]) != isinstance(
                body, ParticipantUpdate
            ):
                raise AuthError(
                    409, "IDEMPOTENCY_CONFLICT", "다른 작업에 사용한 요청 번호입니다."
                )
            if type(body).model_validate(previous["payload"]).model_dump(
                mode="json"
            ) != payload or (
                participant_id is not None
                and previous["participant_id"] != participant_id
            ):
                raise AuthError(
                    409, "IDEMPOTENCY_CONFLICT", "다른 작업에 사용한 요청 번호입니다."
                )
            return DuesResult(
                id=previous["participant_id"], message="이미 저장한 요청입니다."
            )
        if participant_id is None:
            old = conn.execute(
                "SELECT id FROM family_participant WHERE family_id=%s AND created_by=%s AND operation_id=%s",
                (family, actor, str(body.operation_id)),
            ).fetchone()
            if old:
                raise AuthError(
                    409,
                    "IDEMPOTENCY_CONFLICT",
                    "이전에 사용한 등록 요청입니다. 목록을 확인해 주세요.",
                )
            participant_id = str(uuid4())
            conn.execute(
                "INSERT INTO family_participant(family_id,id,display_name,created_at,created_by,operation_id) VALUES (%s,%s,%s,%s,%s,%s)",
                (family, participant_id, body.name, now, actor, str(body.operation_id)),
            )
            version = 1
        else:
            if not conn.execute(
                "SELECT 1 FROM family_participant WHERE family_id=%s AND id=%s",
                (family, participant_id),
            ).fetchone():
                raise AuthError(404, "NOT_FOUND", "구성원을 찾을 수 없습니다.")
            current = conn.execute(
                "SELECT COALESCE(MAX(version),0) AS version FROM participant_profile_event WHERE family_id=%s AND participant_id=%s",
                (family, participant_id),
            ).fetchone()["version"]
            if (
                not isinstance(body, ParticipantUpdate)
                or body.expected_version != current
            ):
                raise AuthError(
                    409,
                    "VERSION_CONFLICT",
                    "다른 관리자가 정보를 변경했습니다. 새로고침 후 다시 확인해 주세요.",
                )
            if isinstance(body, ParticipantUpdate) and body.replaces_fee_id is not None:
                view = repository.project(
                    conn, family, now.astimezone(KST).strftime("%Y-%m"), now, admin
                )
                member = next(m for m in view.members if m.id == participant_id)
                if member.next_fee_id != str(body.replaces_fee_id):
                    raise AuthError(
                        409,
                        "FEE_CHANGED",
                        "예정 회비가 변경되었거나 이미 적용되었습니다. 새로고침 후 확인해 주세요.",
                    )
            version = current + 1
        conn.execute(
            "INSERT INTO participant_profile_event(family_id,participant_id,version,display_name,birthday,actor_id,operation_id,payload,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                family,
                participant_id,
                version,
                body.name,
                Jsonb(body.birthday.model_dump()) if body.birthday else None,
                actor,
                str(body.operation_id),
                Jsonb(payload),
                now,
            ),
        )
        if body.amount_krw is not None:
            fee_result = repository.command_in_transaction(
                conn,
                family,
                actor,
                DuesCommand(
                    kind="fee",
                    operation_id=body.operation_id,
                    month=first_fee_month(body.fee_start_on)
                    if body.fee_start_on
                    else body.fee_month,
                    starts_on=body.fee_start_on,
                    member_id=participant_id,
                    amount_krw=body.amount_krw,
                ),
                now,
                reconcile_after=False,
            )
            if isinstance(body, ParticipantUpdate) and body.replaces_fee_id is not None:
                conn.execute(
                    "INSERT INTO dues_fee_replacement(family_id,previous_id,replacement_id,created_at) VALUES (%s,%s,%s,%s)",
                    (family, str(body.replaces_fee_id), fee_result.id, now),
                )
        reconcile(conn, family, actor, now)
        return DuesResult(id=participant_id, message="구성원 정보를 저장했습니다.")
