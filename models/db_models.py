"""SQLAlchemy models for creator credentials database schema."""

from sqlalchemy import Text, Integer, TIMESTAMP, ForeignKey, Index, CheckConstraint
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import datetime
from typing import Optional


class Base(AsyncAttrs, DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


class CreatorCredential(Base):
    """Creator credentials table model - stores encrypted OnlyFans credentials."""
    __tablename__ = 'creator_credentials'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    account_name: Mapped[str] = mapped_column(Text, nullable=False)
    encrypted_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    encrypted_password: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    encrypted_auth_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gologin_profile_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    auth_status: Mapped[str] = mapped_column(Text, default='not_authenticated', nullable=False)
    status: Mapped[str] = mapped_column(Text, default='active', nullable=False)
    last_auth_attempt: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    last_successful_auth: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.now, onupdate=datetime.now, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('webapp_users.id'), nullable=True)

    __table_args__ = (
        Index('idx_creator_credentials_status', 'status'),
        Index('idx_creator_credentials_auth_status', 'auth_status'),
        CheckConstraint("auth_status IN ('not_authenticated', 'authenticated', 'failed')", name='ck_auth_status'),
        CheckConstraint("status IN ('active', 'inactive')", name='ck_status'),
    )
