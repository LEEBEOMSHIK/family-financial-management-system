"""Personal presentation preferences, never financial or approval authority."""

from datetime import datetime
from typing import Literal

import psycopg
from psycopg.types.json import Jsonb
from pydantic import Field, model_validator

from .auth import AuthError
from .expenses.repository import ExpenseRepository
from .models import Model

WidgetId = Literal[
    "approval", "payment", "balance", "summary", "flow", "categories", "recent"
]
COMMON = ["balance", "summary", "flow", "categories", "recent"]


class Widget(Model):
    id: WidgetId
    width: Literal["half", "full"] = "full"
    height: Literal["compact", "regular", "tall"] = "regular"
    visible: bool = True


class Layout(Model):
    desktop: list[Widget] = Field(max_length=7)
    mobile: list[Widget] = Field(max_length=7)

    @model_validator(mode="after")
    def unique(self):
        for items in (self.desktop, self.mobile):
            if len({item.id for item in items}) != len(items):
                raise ValueError("Duplicate widget")
        return self


class LayoutWrite(Layout):
    revision: int = Field(ge=0, le=2147483646)


class LayoutResponse(Layout):
    revision: int
    allowed_widgets: list[WidgetId]


def defaults(allowed: list[str]) -> list[Widget]:
    return [
        Widget(
            id=key,
            height="compact"
            if key in ("balance", "summary", "approval", "payment")
            else "regular",
            width="half" if key in ("balance", "summary", "categories") else "full",
        )
        for key in allowed
    ]


def normalize(items: list[Widget], allowed: list[str]) -> list[Widget]:
    kept = [item for item in items if item.id in allowed]
    return kept + [
        item for item in defaults(allowed) if item.id not in {x.id for x in kept}
    ]


class LayoutRepository:
    def __init__(self, dsn: str):
        self.dsn = dsn

    @staticmethod
    def allowed(conn, family: str, user: str, now: datetime) -> list[str]:
        manager = ExpenseRepository.authority(conn, family, user, now)
        treasury = ExpenseRepository.has_role(conn, family, user, "treasurer", now)
        return (
            (["approval"] if manager else [])
            + (["payment"] if treasury else [])
            + COMMON
        )

    def read(self, family: str, user: str, now: datetime) -> LayoutResponse:
        with psycopg.connect(self.dsn) as conn:
            # authority uses named rows.
            from psycopg.rows import dict_row

            conn.row_factory = dict_row
            allowed = self.allowed(conn, family, user, now)
            row = conn.execute(
                "SELECT revision,layout FROM dashboard_layout WHERE family_id=%s AND user_id=%s",
                (family, user),
            ).fetchone()
            layout = (
                Layout.model_validate(row["layout"])
                if row
                else Layout(desktop=defaults(allowed), mobile=defaults(allowed))
            )
            return LayoutResponse(
                desktop=normalize(layout.desktop, allowed),
                mobile=normalize(layout.mobile, allowed),
                revision=row["revision"] if row else 0,
                allowed_widgets=allowed,
            )

    def save(
        self, family: str, user: str, now: datetime, body: LayoutWrite
    ) -> LayoutResponse:
        with psycopg.connect(self.dsn) as conn:
            from psycopg.rows import dict_row

            conn.row_factory = dict_row
            allowed = self.allowed(conn, family, user, now)
            for items in (body.desktop, body.mobile):
                if any(item.id not in allowed for item in items):
                    raise AuthError(
                        403,
                        "FORBIDDEN_WIDGET",
                        "현재 권한으로 사용할 수 없는 위젯입니다. 새로고침해 주세요.",
                    )
                if {item.id for item in items} != set(allowed):
                    raise AuthError(
                        422,
                        "INVALID_LAYOUT",
                        "위젯 구성이 변경되었습니다. 새로고침해 주세요.",
                    )
            layout = body.model_dump(exclude={"revision"})
            if body.revision == 0:
                row = conn.execute(
                    "INSERT INTO dashboard_layout (family_id,user_id,revision,layout) VALUES (%s,%s,1,%s) ON CONFLICT DO NOTHING RETURNING revision",
                    (family, user, Jsonb(layout)),
                ).fetchone()
            else:
                row = conn.execute(
                    "UPDATE dashboard_layout SET layout=%s,revision=revision+1,updated_at=now() WHERE family_id=%s AND user_id=%s AND revision=%s RETURNING revision",
                    (Jsonb(layout), family, user, body.revision),
                ).fetchone()
            if not row:
                raise AuthError(
                    409,
                    "LAYOUT_CONFLICT",
                    "다른 화면에서 배치가 변경되었습니다. 편집을 취소하고 최신 배치를 불러와 주세요.",
                )
            return LayoutResponse(
                **layout, revision=row["revision"], allowed_widgets=allowed
            )
