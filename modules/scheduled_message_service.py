"""Scheduled message service - core business logic for CRUD and execution."""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from google.cloud.firestore_v1 import AsyncClient, FieldFilter

from modules.firebase_client import get_firestore_client
from modules.scheduled_message_models import (
    CreateScheduledMessageRequest,
    UpdateScheduledMessageRequest,
    ScheduledMessageResponse,
    SendResultResponse,
    ActiveMessageResponse,
    TestExecuteRequest,
    TestExecuteResponse,
    MessageStatus,
    ApprovalStatus,
    RecipientType,
)
from modules.mass_message import MassMessenger, Recipient
from modules.collections import CollectionsManager
from modules.auth import authenticate_from_db, close_session

# Directory for test logs
TEST_LOGS_DIR = Path("test_logs")

logger = logging.getLogger(__name__)

# Firestore collection names
COLLECTION_SCHEDULED = "scheduled_messages"
COLLECTION_ACTIVE = "active_messages"
SUBCOLLECTION_RESULTS = "results"


class ScheduledMessageService:
    """Service for managing scheduled mass messages."""

    def __init__(self):
        self.db: AsyncClient = get_firestore_client()

    # =========================================================================
    # CRUD Operations
    # =========================================================================

    async def create_scheduled_message(
        self,
        request: CreateScheduledMessageRequest,
    ) -> ScheduledMessageResponse:
        """Create a new scheduled message.

        Args:
            request: The create request with message details

        Returns:
            The created scheduled message response

        Raises:
            ValueError: If authentication fails
        """
        # Authenticate to get account info
        auth_results = await authenticate_from_db(model_id=request.account_id)
        if not auth_results or not auth_results[0].get("success"):
            raise ValueError(f"Cannot authenticate account {request.account_id}")

        account_data = auth_results[0]
        account_username = account_data.get("account_name", "Unknown")
        auth = account_data["authed"]

        try:
            # Get recipient count
            recipient_count = await self._get_recipient_count(
                auth,
                request.recipient_type,
                request.collection_id,
            )
        finally:
            await close_session(auth)

        # Create document
        doc_id = str(uuid4())
        now = datetime.now(timezone.utc)

        doc_data = {
            "id": doc_id,
            "account_id": request.account_id,
            "account_username": account_username,
            "message_content": request.message_content,
            "media_ids": request.media_ids or [],
            "price": request.price,
            "recipient_type": request.recipient_type.value,
            "recipient_count": recipient_count,
            "collection_id": request.collection_id,
            "collection_name": request.collection_name,
            "test_user_id": request.test_user_id,  # For TEST_USER recipient type
            "scheduled_at": request.scheduled_at,
            "status": MessageStatus.QUEUED.value,
            "approval_status": ApprovalStatus.PENDING.value,
            "auto_unsend_previous": request.auto_unsend_previous,
            "auto_unsend_after_minutes": request.auto_unsend_after_minutes,
            "success_count": 0,
            "failed_count": 0,
            "error_message": None,
            "created_at": now,
            "updated_at": now,
        }

        await self.db.collection(COLLECTION_SCHEDULED).document(doc_id).set(doc_data)
        logger.info(f"Created scheduled message {doc_id} for account {account_username}")

        return self._to_response(doc_data)

    async def get_scheduled_message(self, message_id: str) -> Optional[ScheduledMessageResponse]:
        """Get a single scheduled message by ID.

        Args:
            message_id: The message document ID

        Returns:
            The scheduled message or None if not found
        """
        doc = await self.db.collection(COLLECTION_SCHEDULED).document(message_id).get()
        if not doc.exists:
            return None
        return self._to_response(doc.to_dict())

    async def list_scheduled_messages(
        self,
        account_id: Optional[str] = None,
        status: Optional[MessageStatus] = None,
        approval_status: Optional[ApprovalStatus] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[ScheduledMessageResponse]:
        """List scheduled messages with filters.

        Args:
            account_id: Filter by account ID
            status: Filter by execution status
            approval_status: Filter by approval status
            from_date: Filter scheduled_at >= from_date
            to_date: Filter scheduled_at <= to_date
            limit: Maximum number of results

        Returns:
            List of scheduled messages matching filters
        """
        query = self.db.collection(COLLECTION_SCHEDULED)

        if account_id:
            query = query.where(filter=FieldFilter("account_id", "==", account_id))
        if status:
            query = query.where(filter=FieldFilter("status", "==", status.value))
        if approval_status:
            query = query.where(filter=FieldFilter("approval_status", "==", approval_status.value))
        if from_date:
            query = query.where(filter=FieldFilter("scheduled_at", ">=", from_date))
        if to_date:
            query = query.where(filter=FieldFilter("scheduled_at", "<=", to_date))

        query = query.order_by("scheduled_at").limit(limit)

        docs = await query.get()
        return [self._to_response(doc.to_dict()) for doc in docs]

    async def update_scheduled_message(
        self,
        message_id: str,
        request: UpdateScheduledMessageRequest,
    ) -> Optional[ScheduledMessageResponse]:
        """Update a scheduled message (only if queued and pending).

        Args:
            message_id: The message document ID
            request: The update request with fields to change

        Returns:
            The updated message or None if not found

        Raises:
            ValueError: If message cannot be updated (not queued)
        """
        doc_ref = self.db.collection(COLLECTION_SCHEDULED).document(message_id)
        doc = await doc_ref.get()

        if not doc.exists:
            return None

        data = doc.to_dict()

        # Can only update queued messages
        if data["status"] != MessageStatus.QUEUED.value:
            raise ValueError("Can only update queued messages")

        updates = {"updated_at": datetime.now(timezone.utc)}

        if request.message_content is not None:
            updates["message_content"] = request.message_content
        if request.media_ids is not None:
            updates["media_ids"] = request.media_ids
        if request.price is not None:
            updates["price"] = request.price
        if request.recipient_type is not None:
            updates["recipient_type"] = request.recipient_type.value
        if request.collection_id is not None:
            updates["collection_id"] = request.collection_id
        if request.collection_name is not None:
            updates["collection_name"] = request.collection_name
        if request.scheduled_at is not None:
            updates["scheduled_at"] = request.scheduled_at
        if request.auto_unsend_previous is not None:
            updates["auto_unsend_previous"] = request.auto_unsend_previous

        await doc_ref.update(updates)
        logger.info(f"Updated scheduled message {message_id}")

        updated_doc = await doc_ref.get()
        return self._to_response(updated_doc.to_dict())

    async def delete_scheduled_message(self, message_id: str) -> bool:
        """Delete a scheduled message.

        Regular messages can only be deleted if queued or cancelled.
        Rotation messages can be deleted in any non-completed state.

        Args:
            message_id: The message document ID

        Returns:
            True if deleted, False if not found

        Raises:
            ValueError: If message cannot be deleted (processing/completed for non-rotations)
        """
        doc_ref = self.db.collection(COLLECTION_SCHEDULED).document(message_id)
        doc = await doc_ref.get()

        if not doc.exists:
            return False

        data = doc.to_dict()
        is_rotation = data.get("is_rotation", False)

        # Rotations can be deleted in any state except completed
        # Regular messages can only be deleted if queued or cancelled
        if is_rotation:
            if data["status"] == MessageStatus.COMPLETED.value:
                raise ValueError("Cannot delete completed rotations")
        else:
            if data["status"] not in [MessageStatus.QUEUED.value, MessageStatus.CANCELLED.value]:
                raise ValueError("Can only delete queued or cancelled messages")

        # Delete subcollection results first
        results_ref = doc_ref.collection(SUBCOLLECTION_RESULTS)
        async for result_doc in results_ref.stream():
            await result_doc.reference.delete()

        await doc_ref.delete()
        logger.info(f"Deleted scheduled message {message_id}")
        return True

    # =========================================================================
    # Workflow Actions
    # =========================================================================

    async def approve_message(self, message_id: str) -> Optional[ScheduledMessageResponse]:
        """Approve a pending message.

        Args:
            message_id: The message document ID

        Returns:
            The approved message or None if not found

        Raises:
            ValueError: If message is not pending
        """
        doc_ref = self.db.collection(COLLECTION_SCHEDULED).document(message_id)
        doc = await doc_ref.get()

        if not doc.exists:
            return None

        data = doc.to_dict()
        if data["approval_status"] != ApprovalStatus.PENDING.value:
            raise ValueError("Message is not pending approval")

        await doc_ref.update({
            "approval_status": ApprovalStatus.APPROVED.value,
            "updated_at": datetime.now(timezone.utc),
        })
        logger.info(f"Approved scheduled message {message_id}")

        updated_doc = await doc_ref.get()
        return self._to_response(updated_doc.to_dict())

    async def cancel_message(self, message_id: str) -> Optional[ScheduledMessageResponse]:
        """Cancel a scheduled message.

        Args:
            message_id: The message document ID

        Returns:
            The cancelled message or None if not found

        Raises:
            ValueError: If message cannot be cancelled
        """
        doc_ref = self.db.collection(COLLECTION_SCHEDULED).document(message_id)
        doc = await doc_ref.get()

        if not doc.exists:
            return None

        data = doc.to_dict()
        if data["status"] not in [MessageStatus.QUEUED.value]:
            raise ValueError("Can only cancel queued messages")

        await doc_ref.update({
            "status": MessageStatus.CANCELLED.value,
            "updated_at": datetime.now(timezone.utc),
        })
        logger.info(f"Cancelled scheduled message {message_id}")

        updated_doc = await doc_ref.get()
        return self._to_response(updated_doc.to_dict())

    # =========================================================================
    # Execution
    # =========================================================================

    # Parallel sending configuration
    CONCURRENT_SENDS = 10      # Number of messages to send in parallel
    BATCH_DELAY = 3.0          # Seconds between batches
    REAUTH_INTERVAL = 100      # Re-authenticate every N fans

    async def execute_scheduled_message(self, message_id: str) -> None:
        """Execute a scheduled message with parallel sending and re-auth.

        Uses parallel batch sending (10 at a time) with re-authentication
        every 100 fans for reliability.

        Args:
            message_id: The message document ID to execute
        """
        doc_ref = self.db.collection(COLLECTION_SCHEDULED).document(message_id)
        doc = await doc_ref.get()

        if not doc.exists:
            logger.error(f"Scheduled message {message_id} not found")
            return

        data = doc.to_dict()

        # Validation checks
        if data["status"] != MessageStatus.QUEUED.value:
            logger.warning(f"Message {message_id} is not queued (status: {data['status']})")
            return

        if data["approval_status"] != ApprovalStatus.APPROVED.value:
            logger.warning(f"Message {message_id} is not approved")
            return

        # Update status to processing
        await doc_ref.update({
            "status": MessageStatus.PROCESSING.value,
            "started_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })

        account_id = data["account_id"]
        all_results: List[Any] = []
        all_message_ids: List[str] = []

        try:
            # Initial authentication
            auth_results = await authenticate_from_db(model_id=account_id)
            if not auth_results or not auth_results[0].get("success"):
                raise Exception(f"Authentication failed for account {account_id}")

            account_data = auth_results[0]
            auth = account_data["authed"]
            account_username = account_data.get("account_name", "Unknown")

            try:
                # Handle auto-unsend if enabled
                if data.get("auto_unsend_previous", False):
                    await self._unsend_active_message(account_id, auth)

                # Get all recipients
                recipients = await self._get_recipients(
                    auth,
                    RecipientType(data["recipient_type"]),
                    data.get("collection_id"),
                    data.get("test_user_id"),
                )

                if not recipients:
                    logger.warning(f"No recipients found for message {message_id}")
                    await doc_ref.update({
                        "status": MessageStatus.COMPLETED.value,
                        "success_count": 0,
                        "failed_count": 0,
                        "completed_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                    })
                    return

                total_recipients = len(recipients)
                logger.info(f"Starting parallel send to {total_recipients} recipients")
                logger.info(f"Config: {self.CONCURRENT_SENDS} parallel, {self.BATCH_DELAY}s delay, re-auth every {self.REAUTH_INTERVAL}")

                # Convert media_ids to int if present
                media_ids = None
                if data.get("media_ids"):
                    media_ids = [int(m) for m in data["media_ids"]]

                # Process in chunks of REAUTH_INTERVAL (100 fans)
                # Re-authenticate after each chunk for session freshness
                for chunk_start in range(0, total_recipients, self.REAUTH_INTERVAL):
                    chunk_end = min(chunk_start + self.REAUTH_INTERVAL, total_recipients)
                    chunk = recipients[chunk_start:chunk_end]
                    chunk_num = (chunk_start // self.REAUTH_INTERVAL) + 1
                    total_chunks = (total_recipients + self.REAUTH_INTERVAL - 1) // self.REAUTH_INTERVAL

                    logger.info(f"=" * 50)
                    logger.info(f"CHUNK {chunk_num}/{total_chunks}: Recipients {chunk_start + 1}-{chunk_end}")
                    logger.info(f"=" * 50)

                    # Re-authenticate for each chunk (except first which is already authed)
                    if chunk_start > 0:
                        logger.info(f"Re-authenticating for chunk {chunk_num}...")
                        await close_session(auth)

                        auth_results = await authenticate_from_db(model_id=account_id)
                        if not auth_results or not auth_results[0].get("success"):
                            raise Exception(f"Re-authentication failed at chunk {chunk_num}")

                        auth = auth_results[0]["authed"]
                        logger.info(f"Re-authenticated successfully for chunk {chunk_num}")

                    # Send to this chunk using parallel batching
                    messenger = MassMessenger(auth)
                    chunk_results = await messenger.send_mass_message_parallel(
                        recipients=chunk,
                        message_template=data["message_content"],
                        media_ids=media_ids,
                        price=data.get("price", 0),
                        concurrent_sends=self.CONCURRENT_SENDS,
                        batch_delay=self.BATCH_DELAY,
                    )

                    # Collect results
                    all_results.extend(chunk_results)

                    # Store results for this chunk
                    for result in chunk_results:
                        result_doc = {
                            "user_id": result.user_id,
                            "username": result.username,
                            "success": result.success,
                            "error_message": result.error,
                            "message_id": getattr(result, 'message_id', None),
                            "sent_at": datetime.now(timezone.utc),
                        }
                        await doc_ref.collection(SUBCOLLECTION_RESULTS).add(result_doc)

                        if result.success and hasattr(result, 'message_id') and result.message_id:
                            all_message_ids.append(str(result.message_id))

                    # Update progress in Firestore
                    current_success = sum(1 for r in all_results if r.success)
                    current_failed = len(all_results) - current_success
                    await doc_ref.update({
                        "success_count": current_success,
                        "failed_count": current_failed,
                        "updated_at": datetime.now(timezone.utc),
                    })

                    logger.info(f"Chunk {chunk_num} complete: {sum(1 for r in chunk_results if r.success)}/{len(chunk_results)} successful")

            finally:
                await close_session(auth)

            # Final counts
            success_count = sum(1 for r in all_results if r.success)
            failed_count = len(all_results) - success_count

            # Update active message tracking
            await self._set_active_message(
                account_id=account_id,
                scheduled_message_id=message_id,
                account_username=account_username,
                message_content=data["message_content"],
                price=data.get("price", 0),
                recipient_count=success_count,
                message_ids=all_message_ids,
            )

            # Schedule auto-unsend if configured
            auto_unsend_minutes = data.get("auto_unsend_after_minutes")
            if auto_unsend_minutes and auto_unsend_minutes > 0:
                from modules.scheduler import schedule_auto_unsend_job
                unsend_at = datetime.now(timezone.utc) + timedelta(minutes=auto_unsend_minutes)
                await schedule_auto_unsend_job(account_id, unsend_at)
                logger.info(f"Scheduled auto-unsend for {account_id} at {unsend_at.isoformat()}")

            # Update completion status
            await doc_ref.update({
                "status": MessageStatus.COMPLETED.value,
                "success_count": success_count,
                "failed_count": failed_count,
                "completed_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            })

            logger.info(f"=" * 50)
            logger.info(f"COMPLETED message {message_id}: {success_count}/{len(all_results)} successful")
            logger.info(f"=" * 50)

        except Exception as e:
            logger.error(f"Failed to execute message {message_id}: {e}")
            await doc_ref.update({
                "status": MessageStatus.FAILED.value,
                "error_message": str(e),
                "updated_at": datetime.now(timezone.utc),
            })

    # =========================================================================
    # Active Message Management
    # =========================================================================

    async def get_active_message(self, account_id: str) -> Optional[ActiveMessageResponse]:
        """Get the currently active message for an account.

        Args:
            account_id: The OnlyFans account ID

        Returns:
            The active message or None
        """
        doc = await self.db.collection(COLLECTION_ACTIVE).document(account_id).get()
        if not doc.exists:
            return None

        data = doc.to_dict()
        sent_at = data.get("sent_at")
        if hasattr(sent_at, 'isoformat'):
            sent_at_str = sent_at.isoformat()
        else:
            sent_at_str = str(sent_at) if sent_at else ""

        return ActiveMessageResponse(
            id=data["scheduled_message_id"],
            account_id=data["account_id"],
            account_username=data["account_username"],
            message_content=data["message_content"],
            price=data["price"],
            recipient_count=data["recipient_count"],
            sent_at=sent_at_str,
        )

    async def unsend_active_message(self, account_id: str) -> bool:
        """Manually unsend the active message for an account.

        Args:
            account_id: The OnlyFans account ID

        Returns:
            True if unsent, False if no active message

        Raises:
            ValueError: If authentication fails
        """
        auth_results = await authenticate_from_db(model_id=account_id)
        if not auth_results or not auth_results[0].get("success"):
            raise ValueError(f"Cannot authenticate account {account_id}")

        auth = auth_results[0]["authed"]
        try:
            return await self._unsend_active_message(account_id, auth)
        finally:
            await close_session(auth)

    async def _unsend_active_message(self, account_id: str, auth) -> bool:
        """Internal method to unsend active message.

        Args:
            account_id: The OnlyFans account ID
            auth: The authenticated OnlyFansAuthModel

        Returns:
            True if unsent/cleared, False if no active message
        """
        doc_ref = self.db.collection(COLLECTION_ACTIVE).document(account_id)
        doc = await doc_ref.get()

        if not doc.exists:
            return False

        data = doc.to_dict()
        message_ids = data.get("message_ids", [])

        # Unsend each message via OF API
        messenger = MassMessenger(auth)
        for msg_id in message_ids:
            try:
                await messenger.unsend_message(int(msg_id))
                logger.info(f"Unsent message {msg_id} for account {account_id}")
            except Exception as e:
                logger.warning(f"Failed to unsend message {msg_id}: {e}")

        # Clear the active message tracking
        await doc_ref.delete()
        logger.info(f"Cleared active message for account {account_id}")
        return True

    async def _set_active_message(
        self,
        account_id: str,
        scheduled_message_id: str,
        account_username: str,
        message_content: str,
        price: float,
        recipient_count: int,
        message_ids: List[str],
    ) -> None:
        """Set the active message for an account.

        Args:
            account_id: The OnlyFans account ID
            scheduled_message_id: Reference to the scheduled message
            account_username: Account username for display
            message_content: The message content
            price: PPV price
            recipient_count: Number of successful sends
            message_ids: List of OF message IDs for unsend
        """
        await self.db.collection(COLLECTION_ACTIVE).document(account_id).set({
            "account_id": account_id,
            "scheduled_message_id": scheduled_message_id,
            "account_username": account_username,
            "message_content": message_content,
            "price": price,
            "recipient_count": recipient_count,
            "message_ids": message_ids,
            "sent_at": datetime.now(timezone.utc),
        })

    # =========================================================================
    # Results
    # =========================================================================

    async def get_message_results(
        self,
        message_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> List[SendResultResponse]:
        """Get send results for a scheduled message.

        Args:
            message_id: The scheduled message ID
            limit: Maximum results to return
            offset: Number of results to skip

        Returns:
            List of send results
        """
        results_ref = (
            self.db
            .collection(COLLECTION_SCHEDULED)
            .document(message_id)
            .collection(SUBCOLLECTION_RESULTS)
            .order_by("sent_at")
            .offset(offset)
            .limit(limit)
        )

        docs = await results_ref.get()
        results = []

        for doc in docs:
            data = doc.to_dict()
            sent_at = data.get("sent_at")
            if hasattr(sent_at, 'isoformat'):
                sent_at_str = sent_at.isoformat()
            else:
                sent_at_str = str(sent_at) if sent_at else ""

            results.append(SendResultResponse(
                id=doc.id,
                user_id=data["user_id"],
                username=data["username"],
                success=data["success"],
                error_message=data.get("error_message"),
                message_id=data.get("message_id"),
                sent_at=sent_at_str,
            ))

        return results

    # =========================================================================
    # Helpers
    # =========================================================================

    async def _get_recipient_count(
        self,
        auth,
        recipient_type: RecipientType,
        collection_id: Optional[str],
    ) -> int:
        """Get estimated recipient count.

        Args:
            auth: Authenticated OnlyFansAuthModel
            recipient_type: The type of recipients
            collection_id: Collection ID if recipient_type is collection

        Returns:
            Number of recipients
        """
        messenger = MassMessenger(auth)

        if recipient_type == RecipientType.ALL_SUBSCRIBERS:
            recipients = await messenger.get_subscribers()
            return len(recipients)
        elif recipient_type == RecipientType.ALL_CHATS:
            recipients = await messenger.get_recipients_from_chats()
            return len(recipients)
        elif recipient_type == RecipientType.COLLECTION:
            if not collection_id:
                return 0
            collections_mgr = CollectionsManager(auth)
            collection = await collections_mgr.get_collection_by_id(collection_id)
            return collection.get("usersCount", 0) if collection else 0
        elif recipient_type == RecipientType.TEST_USER:
            return 1  # Always 1 recipient for test user

        return 0

    async def _get_recipients(
        self,
        auth,
        recipient_type: RecipientType,
        collection_id: Optional[str],
        test_user_id: Optional[str] = None,
    ) -> List[Recipient]:
        """Get actual recipient list.

        Args:
            auth: Authenticated OnlyFansAuthModel
            recipient_type: The type of recipients
            collection_id: Collection ID if recipient_type is collection
            test_user_id: User ID if recipient_type is test_user (e.g., "u528621767")

        Returns:
            List of Recipient objects
        """
        messenger = MassMessenger(auth)

        if recipient_type == RecipientType.ALL_SUBSCRIBERS:
            return await messenger.get_subscribers()
        elif recipient_type == RecipientType.ALL_CHATS:
            return await messenger.get_recipients_from_chats()
        elif recipient_type == RecipientType.COLLECTION:
            if not collection_id:
                return []
            collections_mgr = CollectionsManager(auth)
            users = await collections_mgr.get_collection_users(collection_id, fetch_all=True)
            return [
                Recipient(
                    user_id=u["id"],
                    username=u.get("username", "Unknown"),
                    name=u.get("name") or u.get("username", "Unknown"),
                )
                for u in users
            ]
        elif recipient_type == RecipientType.TEST_USER:
            if not test_user_id:
                logger.warning("TEST_USER recipient type but no test_user_id provided")
                return []
            # Parse user ID (strip 'u' prefix if present)
            user_id_str = test_user_id
            if user_id_str.startswith('u'):
                user_id_str = user_id_str[1:]
            try:
                user_id = int(user_id_str)
            except ValueError:
                logger.error(f"Invalid test_user_id format: {test_user_id}")
                return []
            # Get user info for personalization
            user = await auth.get_user(user_id)
            if not user:
                logger.error(f"Test user {user_id} not found")
                return []
            return [
                Recipient(
                    user_id=user_id,
                    username=user.username or f"user_{user_id}",
                    name=user.name or user.username or "Fan",
                )
            ]

        return []

    def _to_response(self, data: Dict[str, Any]) -> ScheduledMessageResponse:
        """Convert Firestore document to response model.

        Args:
            data: Firestore document data

        Returns:
            ScheduledMessageResponse model
        """
        # Handle timestamp conversion
        def to_iso(val):
            if val is None:
                return None
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            return str(val)

        # Calculate auto_unsend_at if auto_unsend_after_minutes is set
        auto_unsend_at = None
        auto_unsend_minutes = data.get("auto_unsend_after_minutes")
        completed_at = data.get("completed_at")
        if auto_unsend_minutes and completed_at:
            if hasattr(completed_at, 'timestamp'):
                completed_dt = datetime.fromtimestamp(completed_at.timestamp(), tz=timezone.utc)
            elif isinstance(completed_at, datetime):
                completed_dt = completed_at if completed_at.tzinfo else completed_at.replace(tzinfo=timezone.utc)
            else:
                completed_dt = None
            if completed_dt:
                auto_unsend_at = (completed_dt + timedelta(minutes=auto_unsend_minutes)).isoformat()

        return ScheduledMessageResponse(
            id=data["id"],
            account_id=data["account_id"],
            account_username=data["account_username"],
            message_content=data["message_content"],
            media_ids=data.get("media_ids"),
            price=data.get("price", 0),
            recipient_type=RecipientType(data["recipient_type"]),
            recipient_count=data.get("recipient_count", 0),
            collection_id=data.get("collection_id"),
            collection_name=data.get("collection_name"),
            scheduled_at=to_iso(data.get("scheduled_at")),
            status=MessageStatus(data["status"]),
            approval_status=ApprovalStatus(data["approval_status"]),
            auto_unsend_previous=data.get("auto_unsend_previous"),
            auto_unsend_after_minutes=data.get("auto_unsend_after_minutes"),
            auto_unsend_at=auto_unsend_at,
            success_count=data.get("success_count"),
            failed_count=data.get("failed_count"),
            error_message=data.get("error_message"),
            created_at=to_iso(data.get("created_at")),
            updated_at=to_iso(data.get("updated_at")),
        )

    # =========================================================================
    # Test Execution (for testing send/unsend flow with a single user)
    # =========================================================================

    async def test_execute(self, request: TestExecuteRequest) -> TestExecuteResponse:
        """Execute a test message to a single user.

        This is for testing the send/unsend flow without sending to many users.
        Results are logged to a JSON file.

        Args:
            request: Test execution parameters

        Returns:
            TestExecuteResponse with results
        """
        # Create test logs directory if needed
        TEST_LOGS_DIR.mkdir(exist_ok=True)

        # Prepare log entry
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "account_id": request.account_id,
            "test_user_id": request.test_user_id,
            "message_content": request.message_content,
            "media_ids": request.media_ids,
            "price": request.price,
            "auto_unsend_previous": request.auto_unsend_previous,
            "auto_unsend_after_minutes": request.auto_unsend_after_minutes,
            "dry_run": request.dry_run,
            "steps": [],
        }

        # Parse user ID (strip 'u' prefix if present)
        user_id_str = request.test_user_id
        if user_id_str.startswith('u'):
            user_id_str = user_id_str[1:]
        try:
            user_id = int(user_id_str)
        except ValueError:
            return TestExecuteResponse(
                success=False,
                message="Invalid user ID format",
                test_user_id=request.test_user_id,
                error=f"Cannot parse user ID: {request.test_user_id}",
            )

        log_entry["steps"].append({"action": "parsed_user_id", "user_id": user_id})

        try:
            # Authenticate
            auth_results = await authenticate_from_db(model_id=request.account_id)
            if not auth_results or not auth_results[0].get("success"):
                log_entry["steps"].append({"action": "auth_failed"})
                log_entry["error"] = "Authentication failed"
                self._save_test_log(log_entry)
                return TestExecuteResponse(
                    success=False,
                    message="Authentication failed",
                    test_user_id=request.test_user_id,
                    error=f"Cannot authenticate account {request.account_id}",
                )

            auth = auth_results[0]["authed"]
            account_username = auth_results[0].get("account_name", "Unknown")
            log_entry["account_username"] = account_username
            log_entry["steps"].append({"action": "authenticated", "username": account_username})

            try:
                # Handle auto-unsend if enabled
                unsent_previous = False
                previous_message_ids = []

                if request.auto_unsend_previous:
                    log_entry["steps"].append({"action": "checking_active_message"})
                    active_doc = await self.db.collection(COLLECTION_ACTIVE).document(request.account_id).get()

                    if active_doc.exists:
                        active_data = active_doc.to_dict()
                        previous_message_ids = active_data.get("message_ids", [])
                        log_entry["steps"].append({
                            "action": "found_active_message",
                            "previous_message_ids": previous_message_ids,
                            "previous_content": active_data.get("message_content", "")[:50],
                        })

                        if not request.dry_run and previous_message_ids:
                            messenger = MassMessenger(auth)
                            for msg_id in previous_message_ids:
                                try:
                                    await messenger.unsend_message(int(msg_id))
                                    logger.info(f"[TEST] Unsent message {msg_id}")
                                    log_entry["steps"].append({"action": "unsent_message", "message_id": msg_id})
                                except Exception as e:
                                    logger.warning(f"[TEST] Failed to unsend {msg_id}: {e}")
                                    log_entry["steps"].append({"action": "unsend_failed", "message_id": msg_id, "error": str(e)})

                            unsent_previous = True
                            # Clear active message tracking
                            await self.db.collection(COLLECTION_ACTIVE).document(request.account_id).delete()
                            log_entry["steps"].append({"action": "cleared_active_tracking"})
                        elif request.dry_run:
                            log_entry["steps"].append({"action": "dry_run_skip_unsend"})
                            unsent_previous = True  # Would have unsent
                    else:
                        log_entry["steps"].append({"action": "no_active_message_found"})

                # Get actual user info for personalization
                user = await auth.get_user(user_id)
                if not user:
                    log_entry["steps"].append({"action": "user_not_found", "user_id": user_id})
                    log_entry["error"] = f"User {user_id} not found"
                    log_file = self._save_test_log(log_entry)
                    return TestExecuteResponse(
                        success=False,
                        message="User not found",
                        test_user_id=request.test_user_id,
                        error=f"Cannot find user {user_id}",
                        log_file=str(log_file),
                    )

                # Use actual fan name from user profile
                fan_name = user.name or user.username or "Fan"
                fan_username = user.username or f"user_{user_id}"

                # Prepare recipient with actual name
                recipient = Recipient(
                    user_id=user_id,
                    username=fan_username,
                    name=fan_name,
                )
                log_entry["steps"].append({
                    "action": "prepared_recipient",
                    "user_id": user_id,
                    "username": fan_username,
                    "name": fan_name,
                })

                # Send message
                sent_message_id = None
                auto_unsend_at_iso = None
                if request.dry_run:
                    log_entry["steps"].append({
                        "action": "dry_run_skip_send",
                        "would_send_to": user_id,
                        "message_preview": request.message_content[:50],
                    })
                    sent_message_id = "dry_run_fake_id"
                else:
                    log_entry["steps"].append({"action": "sending_message"})
                    messenger = MassMessenger(auth)

                    # Convert media_ids to int if present
                    media_ids = None
                    if request.media_ids:
                        media_ids = [int(m) for m in request.media_ids]

                    results = await messenger.send_mass_message(
                        recipients=[recipient],
                        message_template=request.message_content,
                        media_ids=media_ids,
                        price=request.price,
                    )

                    if results and results[0].success:
                        sent_message_id = str(getattr(results[0], 'message_id', None))
                        log_entry["steps"].append({
                            "action": "message_sent",
                            "success": True,
                            "message_id": sent_message_id,
                        })

                        # Update active message tracking
                        await self._set_active_message(
                            account_id=request.account_id,
                            scheduled_message_id=f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                            account_username=account_username,
                            message_content=request.message_content,
                            price=request.price,
                            recipient_count=1,
                            message_ids=[sent_message_id] if sent_message_id else [],
                        )
                        log_entry["steps"].append({"action": "updated_active_tracking", "message_id": sent_message_id})

                        # Handle rotation mode OR simple auto-unsend
                        rotation_enabled = False
                        total_rotation_messages = None

                        if request.enable_rotation and request.rotation_captions:
                            # Enable rotation mode
                            from modules.scheduler import start_rotation, schedule_auto_unsend_job

                            captions = request.rotation_captions
                            total_rotation_messages = len(captions) * request.rotation_cycles

                            # Start rotation state (will be used after first unsend)
                            await start_rotation(
                                account_id=request.account_id,
                                test_user_id=request.test_user_id,
                                captions=captions,
                                auto_unsend_after_minutes=request.auto_unsend_after_minutes or 1,
                                total_cycles=request.rotation_cycles,
                            )

                            # Mark that we've already sent the first message (current one)
                            # Update the rotation state to reflect first message sent
                            from modules.firebase_client import get_firestore_client
                            rotation_db = get_firestore_client()
                            await rotation_db.collection("rotation_state").document(request.account_id).update({
                                "current_index": 1 % len(captions),  # Next caption index
                                "messages_sent": 1,
                                "last_sent_at": datetime.now(timezone.utc),
                            })

                            rotation_enabled = True
                            log_entry["steps"].append({
                                "action": "enabled_rotation_mode",
                                "captions": captions,
                                "cycles": request.rotation_cycles,
                                "total_messages": total_rotation_messages,
                            })
                            logger.info(f"[TEST] Enabled rotation mode: {len(captions)} captions, {request.rotation_cycles} cycle(s)")

                            # Schedule auto-unsend (which will trigger the next rotation)
                            if request.auto_unsend_after_minutes and request.auto_unsend_after_minutes > 0:
                                unsend_at = datetime.now(timezone.utc) + timedelta(minutes=request.auto_unsend_after_minutes)
                                auto_unsend_at_iso = unsend_at.isoformat()
                                await schedule_auto_unsend_job(request.account_id, unsend_at)
                                log_entry["steps"].append({
                                    "action": "scheduled_auto_unsend",
                                    "unsend_at": unsend_at.isoformat(),
                                    "minutes": request.auto_unsend_after_minutes,
                                })
                                logger.info(f"[TEST] Scheduled auto-unsend for {request.account_id} at {unsend_at.isoformat()}")

                        elif request.auto_unsend_after_minutes and request.auto_unsend_after_minutes > 0:
                            # Simple auto-unsend (no rotation)
                            from modules.scheduler import schedule_auto_unsend_job
                            unsend_at = datetime.now(timezone.utc) + timedelta(minutes=request.auto_unsend_after_minutes)
                            auto_unsend_at_iso = unsend_at.isoformat()
                            await schedule_auto_unsend_job(request.account_id, unsend_at)
                            log_entry["steps"].append({
                                "action": "scheduled_auto_unsend",
                                "unsend_at": unsend_at.isoformat(),
                                "minutes": request.auto_unsend_after_minutes,
                            })
                            logger.info(f"[TEST] Scheduled auto-unsend for {request.account_id} at {unsend_at.isoformat()}")
                    else:
                        error_msg = results[0].error if results else "Unknown error"
                        log_entry["steps"].append({
                            "action": "message_send_failed",
                            "error": error_msg,
                        })
                        log_entry["error"] = error_msg
                        log_file = self._save_test_log(log_entry)
                        return TestExecuteResponse(
                            success=False,
                            message="Failed to send message",
                            test_user_id=request.test_user_id,
                            error=error_msg,
                            unsent_previous=unsent_previous,
                            previous_message_ids=previous_message_ids if previous_message_ids else None,
                            log_file=str(log_file),
                        )

                log_entry["success"] = True
                log_entry["rotation_enabled"] = rotation_enabled
                log_entry["total_rotation_messages"] = total_rotation_messages
                log_file = self._save_test_log(log_entry)

                message_text = "Test message sent successfully"
                if request.dry_run:
                    message_text = "Dry run completed"
                elif rotation_enabled:
                    message_text = f"Rotation started: {total_rotation_messages} messages total"

                return TestExecuteResponse(
                    success=True,
                    message=message_text,
                    test_user_id=request.test_user_id,
                    message_id=sent_message_id,
                    unsent_previous=unsent_previous,
                    previous_message_ids=previous_message_ids if previous_message_ids else None,
                    auto_unsend_at=auto_unsend_at_iso,
                    log_file=str(log_file),
                    rotation_enabled=rotation_enabled,
                    total_rotation_messages=total_rotation_messages,
                )

            finally:
                await close_session(auth)

        except Exception as e:
            logger.error(f"[TEST] Error during test execution: {e}")
            log_entry["steps"].append({"action": "error", "error": str(e)})
            log_entry["error"] = str(e)
            log_file = self._save_test_log(log_entry)
            return TestExecuteResponse(
                success=False,
                message="Test execution failed",
                test_user_id=request.test_user_id,
                error=str(e),
                log_file=str(log_file),
            )

    def _save_test_log(self, log_entry: dict) -> Path:
        """Save test execution log to JSON file.

        Args:
            log_entry: Log data to save

        Returns:
            Path to the saved log file
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = TEST_LOGS_DIR / f"test_execution_{timestamp}.json"

        with open(log_file, "w") as f:
            json.dump(log_entry, f, indent=2, default=str)

        logger.info(f"[TEST] Saved log to {log_file}")
        return log_file
