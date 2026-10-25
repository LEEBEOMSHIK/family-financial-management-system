"""Development-only atomic role journal. Not a production database adapter."""

import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock

from .domain import FAMILY, Membership, Repository, RoleAssignment
from .models import RoleChange, RoleEvent, RoleMember, RolesResponse, Transaction


class RoleError(Exception):
    def __init__(self, status: int, message: str):
        self.status, self.message = status, message


class RoleRepository:
    def __init__(self, base: Repository, path: Path | None):
        self.base, self.path = base, path
        self.lock = RLock()
        self.memory: list[RoleEvent] = []

    def transactions(self, family_id: str) -> tuple[Transaction, ...]:
        return self.base.transactions(family_id)

    def memberships(self) -> tuple[Membership, ...]:
        return self.base.memberships()

    def history(self) -> list[RoleEvent]:
        if self.path is None:
            return list(self.memory)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if data["schema"] != 1:
                raise ValueError("Unsupported role journal")
            events = [RoleEvent.model_validate(row) for row in data["events"]]
            for event in events:
                stamp = datetime.fromisoformat(event.occurred_at)
                if stamp.utcoffset() is None:
                    raise ValueError("Role event requires timezone")
            return events
        except FileNotFoundError:
            return []
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise RoleError(
                503, "권한 저장소를 확인해 주세요. 변경을 중단했습니다."
            ) from exc

    def assignments(self, history: list[RoleEvent]) -> tuple[RoleAssignment, ...]:
        assignments = {r.user_id: r for r in self.base.roles()}
        for event in history:
            assignments[event.user_id] = RoleAssignment(
                event.user_id,
                FAMILY,
                event.after,
                datetime.fromisoformat(event.occurred_at),
                datetime(2027, 1, 1, tzinfo=UTC),
            )
        return tuple(assignments.values())

    def roles(self) -> tuple[RoleAssignment, ...]:
        return self.assignments(self.history())

    def snapshot(self, now: datetime) -> RolesResponse:
        history = self.history()
        roles = {
            r.user_id: r.role
            for r in self.assignments(history)
            if r.valid_from <= now < r.valid_to
        }
        return RolesResponse(
            version=len(history),
            members=[
                RoleMember(user_id=m.user_id, role=roles.get(m.user_id, "member"))
                for m in self.memberships()
                if m.family_id == FAMILY and m.active
            ],
            history=history,
        )

    def change(self, actor: str, body: RoleChange, now: datetime) -> RolesResponse:
        with self.lock:
            lock_path = self.path.with_suffix(".lock") if self.path else None
            if lock_path:
                lock_path.parent.mkdir(parents=True, exist_ok=True)
                try:
                    fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                    os.close(fd)
                except FileExistsError as exc:
                    raise RoleError(
                        409, "다른 권한 변경이 진행 중입니다. 목록을 새로고침해 주세요."
                    ) from exc
            try:
                state = self.snapshot(now)
                roles = {m.user_id: m.role for m in state.members}
                if roles.get(actor) != "super_admin":
                    raise RoleError(403, "총괄관리자만 권한을 변경할 수 있습니다.")
                if body.user_id not in roles:
                    raise RoleError(404, "구성원을 찾을 수 없습니다.")
                if body.expected_version != state.version:
                    raise RoleError(
                        409, "권한 목록이 변경되었습니다. 새로고침 후 확인해 주세요."
                    )
                if roles[body.user_id] == body.role:
                    raise RoleError(409, "현재 역할과 같습니다.")
                if (
                    roles[body.user_id] == "super_admin"
                    and body.role != "super_admin"
                    and list(roles.values()).count("super_admin") == 1
                ):
                    raise RoleError(
                        409, "마지막 총괄관리자의 권한은 해제할 수 없습니다."
                    )
                history = [
                    *state.history,
                    RoleEvent(
                        user_id=body.user_id,
                        before=roles[body.user_id],
                        after=body.role,
                        actor_id=actor,
                        occurred_at=now.isoformat(),
                        reason=body.reason.strip(),
                    ),
                ]
                if self.path:
                    fd, name = tempfile.mkstemp(
                        dir=self.path.parent, prefix="roles-", suffix=".tmp"
                    )
                    try:
                        with os.fdopen(fd, "w", encoding="utf-8") as stream:
                            json.dump(
                                {
                                    "schema": 1,
                                    "events": [e.model_dump() for e in history],
                                },
                                stream,
                                ensure_ascii=False,
                            )
                            stream.flush()
                            os.fsync(stream.fileno())
                        os.replace(name, self.path)
                    finally:
                        if os.path.exists(name):
                            os.unlink(name)
                else:
                    self.memory = history
                return self.snapshot(now)
            finally:
                if lock_path:
                    lock_path.unlink()
