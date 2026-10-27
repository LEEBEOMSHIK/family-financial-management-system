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
    "tasks", "dues", "support", "approval", "payment", "balance", "summary", "flow", "categories", "recent"
]
COMMON = ["balance", "summary", "flow", "categories", "recent"]


class Widget(Model):
    id: WidgetId
    width: Literal["half", "full"] = "full"
    height: Literal["compact", "regular", "tall"] = "regular"
    height_px: int | None = Field(default=None, ge=120, le=32768, strict=True)
    visible: bool = True


class Layout(Model):
    desktop: list[Widget] = Field(max_length=8)
    mobile: list[Widget] = Field(max_length=8)

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
    legacy = [item for item in items if item.id in ("approval", "payment")]
    if legacy and not any(item.id == "tasks" for item in items):
        merged = legacy[0].model_copy(update={"id": "tasks", "visible": any(item.visible for item in legacy)})
        items = [merged if item is legacy[0] else item for item in items]
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
            (["tasks", "dues"] if manager or treasury else [])
            + (["support"] if manager else [])
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
                    "다른 화면에서 배치가 변경되었습니다. 최신 배치를 불러온 뒤 다시 조정해 주세요.",
                )
            return LayoutResponse(
                **layout, revision=row["revision"], allowed_widgets=allowed
            )
