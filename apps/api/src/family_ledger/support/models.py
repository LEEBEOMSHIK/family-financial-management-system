from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Status = Literal["received", "investigating", "needs_info", "resolved"]


class PinRegion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    left: int = Field(ge=0, le=10000, strict=True)
    top: int = Field(ge=0, le=10000, strict=True)
    width: int = Field(ge=1, le=10000, strict=True)
    height: int = Field(ge=1, le=10000, strict=True)

    @model_validator(mode="after")
    def inside_viewport(self):
        if self.left + self.width > 10000 or self.top + self.height > 10000:
            raise ValueError("선택 영역이 화면 범위를 벗어났습니다.")
        return self


class PinContext(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    schema_version: Literal[1] = 1
    component_id: str = Field(
        min_length=1, max_length=120, pattern=r"^[a-zA-Z0-9_.:-]+$"
    )
    element_id: str = Field(min_length=1, max_length=120, pattern=r"^[a-zA-Z0-9_.:-]+$")
    locator: str = Field(min_length=1, max_length=1000)
    source_file: str = Field(
        max_length=200,
        pattern=r"^apps/web/src/(?:[a-zA-Z0-9_()-]+/)*[a-zA-Z0-9_-]+\.(?:tsx|ts)$",
    )
    hierarchy: list[str] = Field(min_length=1, max_length=6)
    tag: str = Field(max_length=24, pattern=r"^[a-z][a-z0-9-]*$")

    @model_validator(mode="after")
    def bounded_labels(self):
        if any(len(label) > 120 for label in self.hierarchy):
            raise ValueError("대상 경로 이름이 너무 깁니다.")
        return self


class Pin(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    x: int = Field(ge=0, le=10000, strict=True)
    y: int = Field(ge=0, le=10000, strict=True)
    note: str = Field(min_length=1, max_length=500)
    label: str = Field(default="", max_length=120)
    region: PinRegion | None = None
    context: PinContext | None = None
    target: str = Field(default="", max_length=80, pattern=r"^[a-zA-Z0-9_ .:-]*$")


class IssueCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    operation_id: UUID
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=3000)
    path: str = Field(max_length=200, pattern=r"^/[a-zA-Z0-9/_-]*$")
    screen_name: str = Field(min_length=1, max_length=80)
    viewport_width: int = Field(ge=1, le=10000)
    viewport_height: int = Field(ge=1, le=10000)
    pins: list[Pin] = Field(default_factory=list, max_length=5)
    image_base64: str | None = Field(default=None, max_length=4194304)


class IssueEventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    operation_id: UUID
    expected_version: int = Field(ge=0)
    comment: str = Field(default="", max_length=3000)
    status: Status | None = None

    @model_validator(mode="after")
    def not_empty(self):
        if not self.comment and self.status is None:
            raise ValueError("답변 또는 상태 변경이 필요합니다.")
        return self


class IssueEvent(BaseModel):
    version: int
    actor_name: str
    comment: str
    status: Status | None
    created_at: datetime


class IssueItem(BaseModel):
    id: str
    title: str
    description: str
    path: str
    screen_name: str
    viewport_width: int
    viewport_height: int
    pins: list[Pin]
    has_image: bool
    author_name: str
    created_at: datetime
    status: Status
    version: int
    events: list[IssueEvent] = Field(default_factory=list)


class IssueList(BaseModel):
    items: list[IssueItem]
    total: int
    can_manage: bool
