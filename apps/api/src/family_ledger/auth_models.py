"""Invite-only local account API inputs."""

from datetime import datetime

from pydantic import Field, field_validator

from .models import Model


class PasswordLogin(Model):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=12, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.casefold()


class RegisterRequest(PasswordLogin):
    invite_token: str = Field(min_length=32, max_length=128)
    display_name: str = Field(min_length=1, max_length=60, pattern=r"\S")


class InvitationResponse(Model):
    invite_token: str
    expires_at: datetime
