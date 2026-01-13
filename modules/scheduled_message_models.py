"""Pydantic models for scheduled messages API."""
from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class RecipientType(str, Enum):
    """Target recipient types for scheduled messages."""
    ALL_SUBSCRIBERS = "all_subscribers"
    ALL_CHATS = "all_chats"
    COLLECTION = "collection"
    TEST_USER = "test_user"  # For testing with a single user


class MessageStatus(str, Enum):
    """Execution status of a scheduled message."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class ApprovalStatus(str, Enum):
    """Approval workflow status."""
    PENDING = "pending"
    APPROVED = "approved"


# =============================================================================
# Request Models
# =============================================================================

class CreateScheduledMessageRequest(BaseModel):
    """Request body for creating a scheduled message."""
    account_id: str = Field(..., alias="accountId", description="OnlyFans model/account ID")
    message_content: str = Field(..., alias="messageContent", description="Message template with {name}/{username} placeholders")
    media_ids: Optional[List[str]] = Field(default=None, alias="mediaIds", description="Vault media IDs to attach")
    price: float = Field(default=0, ge=0, le=200, description="PPV price (0 for free, 3-200 for paid)")
    recipient_type: RecipientType = Field(..., alias="recipientType", description="Target recipients")
    collection_id: Optional[str] = Field(default=None, alias="collectionId", description="Collection ID if recipient_type is collection")
    collection_name: Optional[str] = Field(default=None, alias="collectionName", description="Collection name for display")
    test_user_id: Optional[str] = Field(default=None, alias="testUserId", description="User ID for test_user recipient type (e.g. u528621767)")
    scheduled_at: datetime = Field(..., alias="scheduledAt", description="When to send (ISO timestamp)")
    auto_unsend_previous: bool = Field(default=True, alias="autoUnsendPrevious", description="Unsend previous message when this one sends")
    auto_unsend_after_minutes: Optional[int] = Field(default=None, alias="autoUnsendAfterMinutes", ge=1, description="Auto-unsend this message after X minutes (e.g., 60 for 1 hour)")

    class Config:
        populate_by_name = True


class UpdateScheduledMessageRequest(BaseModel):
    """Request body for updating a scheduled message."""
    message_content: Optional[str] = Field(default=None, alias="messageContent")
    media_ids: Optional[List[str]] = Field(default=None, alias="mediaIds")
    price: Optional[float] = Field(default=None, ge=0, le=200)
    recipient_type: Optional[RecipientType] = Field(default=None, alias="recipientType")
    collection_id: Optional[str] = Field(default=None, alias="collectionId")
    collection_name: Optional[str] = Field(default=None, alias="collectionName")
    test_user_id: Optional[str] = Field(default=None, alias="testUserId")
    scheduled_at: Optional[datetime] = Field(default=None, alias="scheduledAt")
    auto_unsend_previous: Optional[bool] = Field(default=None, alias="autoUnsendPrevious")
    auto_unsend_after_minutes: Optional[int] = Field(default=None, alias="autoUnsendAfterMinutes", ge=1)

    class Config:
        populate_by_name = True


class TestExecuteRequest(BaseModel):
    """Request body for test execution of scheduled messages."""
    account_id: str = Field(..., alias="accountId", description="OnlyFans model/account ID")
    message_content: str = Field(..., alias="messageContent", description="Message template")
    media_ids: Optional[List[str]] = Field(default=None, alias="mediaIds", description="Vault media IDs")
    price: float = Field(default=0, ge=0, le=200)
    test_user_id: str = Field(..., alias="testUserId", description="User ID to send to (e.g. u528621767 or 528621767)")
    auto_unsend_previous: bool = Field(default=True, alias="autoUnsendPrevious")
    auto_unsend_after_minutes: Optional[int] = Field(default=None, alias="autoUnsendAfterMinutes", ge=1, description="Auto-unsend after X minutes")
    dry_run: bool = Field(default=False, alias="dryRun", description="If true, simulates sending without actual API calls")
    # Rotation mode settings
    enable_rotation: bool = Field(default=False, alias="enableRotation", description="Enable caption/GIF rotation mode")
    rotation_captions: Optional[List[str]] = Field(default=None, alias="rotationCaptions", description="Captions to rotate (if enableRotation is true)")
    rotation_cycles: int = Field(default=1, alias="rotationCycles", ge=1, description="Number of rotation cycles")

    class Config:
        populate_by_name = True


class TestExecuteResponse(BaseModel):
    """Response from test execution."""
    success: bool
    message: str
    test_user_id: str = Field(..., alias="testUserId")
    message_id: Optional[str] = Field(default=None, alias="messageId", description="OF message ID if sent")
    unsent_previous: bool = Field(default=False, alias="unsentPrevious")
    previous_message_ids: Optional[List[str]] = Field(default=None, alias="previousMessageIds")
    auto_unsend_at: Optional[str] = Field(default=None, alias="autoUnsendAt", description="When message will be auto-unsent (ISO timestamp)")
    error: Optional[str] = None
    log_file: Optional[str] = Field(default=None, alias="logFile", description="Path to JSON log file")
    # Rotation mode info
    rotation_enabled: bool = Field(default=False, alias="rotationEnabled", description="Whether rotation mode was enabled")
    total_rotation_messages: Optional[int] = Field(default=None, alias="totalRotationMessages", description="Total messages in rotation")

    class Config:
        populate_by_name = True
        by_alias = True


# =============================================================================
# Response Models
# =============================================================================

class ScheduledMessageResponse(BaseModel):
    """Response model for a scheduled message."""
    id: str
    account_id: str = Field(..., alias="accountId")
    account_username: str = Field(..., alias="accountUsername")
    message_content: str = Field(..., alias="messageContent")
    media_ids: Optional[List[str]] = Field(default=None, alias="mediaIds")
    price: float
    recipient_type: RecipientType = Field(..., alias="recipientType")
    recipient_count: int = Field(..., alias="recipientCount")
    collection_id: Optional[str] = Field(default=None, alias="collectionId")
    collection_name: Optional[str] = Field(default=None, alias="collectionName")
    scheduled_at: str = Field(..., alias="scheduledAt", description="ISO timestamp string")
    status: MessageStatus
    approval_status: ApprovalStatus = Field(..., alias="approvalStatus")
    auto_unsend_previous: Optional[bool] = Field(default=None, alias="autoUnsendPrevious")
    auto_unsend_after_minutes: Optional[int] = Field(default=None, alias="autoUnsendAfterMinutes")
    auto_unsend_at: Optional[str] = Field(default=None, alias="autoUnsendAt", description="When message will be auto-unsent")
    success_count: Optional[int] = Field(default=None, alias="successCount")
    failed_count: Optional[int] = Field(default=None, alias="failedCount")
    error_message: Optional[str] = Field(default=None, alias="errorMessage")
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")

    class Config:
        populate_by_name = True
        by_alias = True


class SendResultResponse(BaseModel):
    """Response model for individual send results."""
    id: str
    user_id: int = Field(..., alias="userId")
    username: str
    success: bool
    error_message: Optional[str] = Field(default=None, alias="errorMessage")
    message_id: Optional[str] = Field(default=None, alias="messageId", description="OF message ID for unsend")
    sent_at: str = Field(..., alias="sentAt")

    class Config:
        populate_by_name = True
        by_alias = True


class ActiveMessageResponse(BaseModel):
    """Response model for the currently active message."""
    id: str
    account_id: str = Field(..., alias="accountId")
    account_username: str = Field(..., alias="accountUsername")
    message_content: str = Field(..., alias="messageContent")
    price: float
    recipient_count: int = Field(..., alias="recipientCount")
    sent_at: str = Field(..., alias="sentAt")

    class Config:
        populate_by_name = True
        by_alias = True


class ScheduleStatsResponse(BaseModel):
    """Response model for scheduled message statistics."""
    total_scheduled: int = Field(..., alias="totalScheduled")
    pending_approval: int = Field(..., alias="pendingApproval")
    queued: int
    processing: int
    completed_today: int = Field(..., alias="completedToday")
    failed_today: int = Field(..., alias="failedToday")

    class Config:
        populate_by_name = True
        by_alias = True


# =============================================================================
# Batch Operation Models
# =============================================================================

class BatchIdsRequest(BaseModel):
    """Request body for batch operations."""
    ids: List[str] = Field(..., min_length=1, description="List of message IDs")


class BatchResultResponse(BaseModel):
    """Response model for batch operations."""
    success: bool
    processed: int
    failed: int
    errors: Optional[List[str]] = None
