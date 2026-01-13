"""APScheduler setup for scheduled message execution."""
import asyncio
import logging
import random
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from apscheduler.jobstores.memory import MemoryJobStore
from google.cloud.firestore_v1 import FieldFilter

from modules.firebase_client import get_firestore_client
from modules.scheduled_message_models import MessageStatus, ApprovalStatus

logger = logging.getLogger(__name__)

_scheduler: Optional[AsyncIOScheduler] = None

# Collection names
COLLECTION_SCHEDULED = "scheduled_messages"
COLLECTION_ROTATION = "rotation_state"  # For tracking caption rotation


def get_scheduler() -> AsyncIOScheduler:
    """Get the global scheduler instance.

    Returns:
        AsyncIOScheduler: The scheduler instance
    """
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(
            jobstores={"default": MemoryJobStore()},
            job_defaults={
                "coalesce": True,  # Combine missed runs into one
                "max_instances": 1,  # Only one instance of each job
                "misfire_grace_time": 300,  # 5 minutes grace for missed jobs
            },
        )
    return _scheduler


async def start_scheduler() -> None:
    """Start the scheduler and load pending jobs."""
    scheduler = get_scheduler()

    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started")

    # Load pending jobs from Firestore
    await _load_pending_jobs()

    # Schedule periodic job to check for new/missed jobs (every minute)
    scheduler.add_job(
        _check_pending_jobs,
        "interval",
        minutes=1,
        id="check_pending_jobs",
        replace_existing=True,
    )
    logger.info("Scheduled periodic job checker (every 1 minute)")


async def stop_scheduler() -> None:
    """Stop the scheduler gracefully."""
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.shutdown(wait=True)
        logger.info("APScheduler stopped")


async def schedule_message_job(message_id: str, scheduled_at: datetime) -> None:
    """Schedule a job for a specific message.

    Args:
        message_id: The scheduled message document ID
        scheduled_at: When to execute the message
    """
    scheduler = get_scheduler()

    job_id = f"scheduled_message_{message_id}"

    # Remove existing job if present
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.debug(f"Removed existing job {job_id}")

    # Ensure scheduled_at is timezone-aware
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

    # If scheduled time is in the past, execute immediately
    if scheduled_at <= datetime.now(timezone.utc):
        logger.warning(f"Message {message_id} scheduled time is in the past, executing immediately")
        asyncio.create_task(_execute_message(message_id))
        return

    # Schedule for future execution
    scheduler.add_job(
        _execute_message,
        DateTrigger(run_date=scheduled_at),
        args=[message_id],
        id=job_id,
        replace_existing=True,
    )

    logger.info(f"Scheduled job {job_id} for {scheduled_at.isoformat()}")


async def cancel_message_job(message_id: str) -> None:
    """Cancel a scheduled job.

    Args:
        message_id: The scheduled message document ID
    """
    scheduler = get_scheduler()
    job_id = f"scheduled_message_{message_id}"

    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"Cancelled job {job_id}")


async def schedule_auto_unsend_job(account_id: str, unsend_at: datetime) -> None:
    """Schedule an auto-unsend job for an account's active message.

    Args:
        account_id: The OnlyFans account ID
        unsend_at: When to unsend the message
    """
    scheduler = get_scheduler()
    job_id = f"auto_unsend_{account_id}"

    # Remove existing auto-unsend job if present
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.debug(f"Removed existing auto-unsend job {job_id}")

    # Ensure unsend_at is timezone-aware
    if unsend_at.tzinfo is None:
        unsend_at = unsend_at.replace(tzinfo=timezone.utc)

    # If unsend time is in the past, execute immediately
    if unsend_at <= datetime.now(timezone.utc):
        logger.warning(f"Auto-unsend time for {account_id} is in the past, executing immediately")
        asyncio.create_task(_execute_auto_unsend(account_id))
        return

    # Schedule for future execution
    scheduler.add_job(
        _execute_auto_unsend,
        DateTrigger(run_date=unsend_at),
        args=[account_id],
        id=job_id,
        replace_existing=True,
    )

    logger.info(f"Scheduled auto-unsend job {job_id} for {unsend_at.isoformat()}")


async def cancel_auto_unsend_job(account_id: str) -> None:
    """Cancel an auto-unsend job.

    Args:
        account_id: The OnlyFans account ID
    """
    scheduler = get_scheduler()
    job_id = f"auto_unsend_{account_id}"

    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"Cancelled auto-unsend job {job_id}")


async def _execute_message(message_id: str) -> None:
    """Execute a scheduled message.

    This is the callback function run by APScheduler at the scheduled time.

    Args:
        message_id: The scheduled message document ID
    """
    logger.info(f"Executing scheduled message {message_id}")

    # Import here to avoid circular imports
    from modules.scheduled_message_service import ScheduledMessageService

    try:
        service = ScheduledMessageService()
        await service.execute_scheduled_message(message_id)
    except Exception as e:
        logger.error(f"Error executing scheduled message {message_id}: {e}")


async def _execute_auto_unsend(account_id: str) -> None:
    """Execute auto-unsend for an account's active message, then send next rotated message.

    This is the callback function run by APScheduler at the scheduled unsend time.
    After unsending, it will:
    1. Get the next caption from rotation
    2. Get a random GIF from the vault
    3. Send a new message
    4. Schedule the next auto-unsend

    Args:
        account_id: The OnlyFans account ID
    """
    logger.info(f"Executing auto-unsend for account {account_id}")

    # Import here to avoid circular imports
    from modules.scheduled_message_service import ScheduledMessageService

    try:
        service = ScheduledMessageService()
        success = await service.unsend_active_message(account_id)
        if success:
            logger.info(f"Auto-unsend completed for account {account_id}")
        else:
            logger.warning(f"No active message to unsend for account {account_id}")

        # Check if continuous rotation is enabled for this account
        rotation_state = await _get_rotation_state(account_id)
        if rotation_state and rotation_state.get("enabled"):
            logger.info(f"Continuous rotation enabled for {account_id}, sending next message")
            await _send_rotated_message(account_id, rotation_state)
        else:
            logger.debug(f"Continuous rotation not enabled for {account_id}")

    except Exception as e:
        logger.error(f"Error executing auto-unsend for account {account_id}: {e}")


async def _get_rotation_state(account_id: str) -> Optional[dict]:
    """Get rotation state for an account.

    Args:
        account_id: The OnlyFans account ID

    Returns:
        Rotation state dict or None if not found
    """
    try:
        db = get_firestore_client()
        doc = await db.collection(COLLECTION_ROTATION).document(account_id).get()
        if doc.exists:
            return doc.to_dict()
        return None
    except Exception as e:
        logger.error(f"Error getting rotation state for {account_id}: {e}")
        return None


async def _send_rotated_message(account_id: str, rotation_state: dict) -> None:
    """Send the next message in the rotation cycle.

    Args:
        account_id: The OnlyFans account ID
        rotation_state: Current rotation state with captions, index, settings
    """
    from modules.scheduled_message_service import ScheduledMessageService
    from modules.vault_manager import VaultManager
    from modules.auth import authenticate_from_db, close_session
    from modules.mass_message import MassMessenger, Recipient

    try:
        # Get rotation settings
        captions = rotation_state.get("captions", [])
        current_index = rotation_state.get("current_index", 0)
        test_user_id = rotation_state.get("test_user_id")
        auto_unsend_minutes = rotation_state.get("auto_unsend_after_minutes", 1)
        total_cycles = rotation_state.get("total_cycles", 1)
        completed_cycles = rotation_state.get("completed_cycles", 0)

        if not captions:
            logger.warning(f"No captions configured for rotation on {account_id}")
            return

        if not test_user_id:
            logger.warning(f"No test user configured for rotation on {account_id}")
            return

        # Check if rotation has reached end time
        end_at = rotation_state.get("end_at")
        if end_at:
            # Handle Firestore Timestamp
            if hasattr(end_at, 'timestamp'):
                end_at_dt = datetime.fromtimestamp(end_at.timestamp(), tz=timezone.utc)
            elif isinstance(end_at, datetime):
                end_at_dt = end_at if end_at.tzinfo else end_at.replace(tzinfo=timezone.utc)
            else:
                end_at_dt = None

            if end_at_dt and datetime.now(timezone.utc) >= end_at_dt:
                logger.info(f"Rotation end time reached for {account_id} (end_at: {end_at_dt.isoformat()})")
                await _disable_rotation(account_id)
                return

        # Check if we've completed all cycles (only if total_cycles > 0)
        messages_sent = rotation_state.get("messages_sent", 0)

        if total_cycles > 0:
            total_messages = total_cycles * len(captions)
            if messages_sent >= total_messages:
                logger.info(f"Completed all {total_cycles} cycle(s) for {account_id}")
                await _disable_rotation(account_id)
                return

        # Get next caption (rotate through list)
        caption = captions[current_index]
        next_index = (current_index + 1) % len(captions)

        # Track cycle completion
        new_completed_cycles = completed_cycles
        if next_index == 0:
            new_completed_cycles += 1

        logger.info(f"Using caption {current_index + 1}/{len(captions)}: '{caption[:30]}...'")

        # Authenticate
        auth_results = await authenticate_from_db(model_id=account_id)
        if not auth_results or not auth_results[0].get("success"):
            logger.error(f"Authentication failed for {account_id}")
            return

        auth = auth_results[0]["authed"]
        account_username = auth_results[0].get("account_name", "Unknown")

        try:
            # Get random GIF from vault
            gif_id = await _get_random_gif(account_id)

            # Parse test user ID
            user_id_str = test_user_id
            if user_id_str.startswith('u'):
                user_id_str = user_id_str[1:]
            user_id = int(user_id_str)

            # Get user info for personalization
            user = await auth.get_user(user_id)
            if not user:
                logger.error(f"User {user_id} not found")
                return

            fan_name = user.name or user.username or "Fan"
            fan_username = user.username or f"user_{user_id}"

            recipient = Recipient(
                user_id=user_id,
                username=fan_username,
                name=fan_name,
            )

            # Send message
            messenger = MassMessenger(auth)
            media_ids = [int(gif_id)] if gif_id else None

            logger.info(f"Sending rotated message to {fan_username} with GIF {gif_id}")

            results = await messenger.send_mass_message(
                recipients=[recipient],
                message_template=caption,
                media_ids=media_ids,
                price=0,  # Free message for rotation
            )

            if results and results[0].success:
                sent_message_id = str(getattr(results[0], 'message_id', None))
                logger.info(f"Rotated message sent: {sent_message_id}")

                # Update active message tracking
                service = ScheduledMessageService()
                await service._set_active_message(
                    account_id=account_id,
                    scheduled_message_id=f"rotation_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                    account_username=account_username,
                    message_content=caption,
                    price=0,
                    recipient_count=1,
                    message_ids=[sent_message_id] if sent_message_id else [],
                )

                # Update rotation state
                await _update_rotation_state(
                    account_id,
                    current_index=next_index,
                    messages_sent=messages_sent + 1,
                    completed_cycles=new_completed_cycles,
                )

                # Schedule next auto-unsend
                unsend_at = datetime.now(timezone.utc) + timedelta(minutes=auto_unsend_minutes)
                await schedule_auto_unsend_job(account_id, unsend_at)
                logger.info(f"Scheduled next auto-unsend at {unsend_at.isoformat()}")

            else:
                error_msg = results[0].error if results else "Unknown error"
                logger.error(f"Failed to send rotated message: {error_msg}")

        finally:
            await close_session(auth)

    except Exception as e:
        logger.error(f"Error sending rotated message for {account_id}: {e}")


async def _get_random_gif(account_id: str) -> Optional[str]:
    """Get a random GIF ID from the account's vault.

    Args:
        account_id: The OnlyFans account ID

    Returns:
        GIF media ID as string or None if not found
    """
    from modules.vault_manager import VaultManager

    try:
        vault = VaultManager()
        try:
            # Find GIFs folder
            gifs_folder = await vault.find_folder_by_pattern(account_id, "gif")
            if not gifs_folder:
                logger.warning(f"No GIFs folder found for {account_id}")
                return None

            folder_id = gifs_folder.get("id")
            logger.debug(f"Found GIFs folder: {gifs_folder.get('name')} (id: {folder_id})")

            # Get all GIFs from folder
            all_media = await vault.get_all_vault_media(account_id, folder_id)
            gifs = [m for m in all_media if m.get('type') == 'gif']

            if not gifs:
                logger.warning(f"No GIFs found in folder for {account_id}")
                return None

            # Return random GIF ID
            selected_gif = random.choice(gifs)
            gif_id = str(selected_gif['id'])
            logger.info(f"Selected random GIF: {gif_id}")
            return gif_id

        finally:
            await vault.close()

    except Exception as e:
        logger.error(f"Error getting random GIF for {account_id}: {e}")
        return None


async def _update_rotation_state(
    account_id: str,
    current_index: int,
    messages_sent: int,
    completed_cycles: int,
) -> None:
    """Update rotation state in Firestore.

    Args:
        account_id: The OnlyFans account ID
        current_index: Next caption index
        messages_sent: Total messages sent in this rotation
        completed_cycles: Number of completed caption cycles
    """
    try:
        db = get_firestore_client()
        await db.collection(COLLECTION_ROTATION).document(account_id).update({
            "current_index": current_index,
            "messages_sent": messages_sent,
            "completed_cycles": completed_cycles,
            "last_sent_at": datetime.now(timezone.utc),
        })
    except Exception as e:
        logger.error(f"Error updating rotation state for {account_id}: {e}")


async def _disable_rotation(account_id: str) -> None:
    """Disable rotation for an account.

    Args:
        account_id: The OnlyFans account ID
    """
    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)

        await db.collection(COLLECTION_ROTATION).document(account_id).update({
            "enabled": False,
            "completed_at": now,
        })
        logger.info(f"Disabled rotation for {account_id}")

        # Also mark the scheduled_messages entry as completed
        from google.cloud.firestore_v1 import FieldFilter

        query = (
            db.collection(COLLECTION_SCHEDULED)
            .where(filter=FieldFilter("account_id", "==", account_id))
            .where(filter=FieldFilter("is_rotation", "==", True))
            .where(filter=FieldFilter("status", "in", ["queued", "processing"]))
        )
        docs = await query.get()

        for doc in docs:
            await doc.reference.update({
                "status": "completed",
                "updated_at": now,
            })
            logger.info(f"Marked rotation scheduled_message as completed: {doc.id}")

    except Exception as e:
        logger.error(f"Error disabling rotation for {account_id}: {e}")


async def start_rotation(
    account_id: str,
    test_user_id: str,
    captions: List[str],
    auto_unsend_after_minutes: int = 1,
    total_cycles: int = 1,
    end_at: Optional[datetime] = None,
    run_duration_hours: Optional[int] = None,
    start_at: Optional[datetime] = None,
) -> dict:
    """Start or schedule continuous caption rotation for an account.

    Args:
        account_id: The OnlyFans account ID
        test_user_id: User ID to send test messages to (e.g., "u528621767")
        captions: List of captions to rotate through
        auto_unsend_after_minutes: Minutes before auto-unsend
        total_cycles: Number of complete caption cycles to run (1 cycle = all captions once)
                     Set to 0 or None for unlimited cycles (will run until end_at)
        end_at: Optional datetime when rotation should stop (e.g., end of day)
        run_duration_hours: Optional hours to run (alternative to end_at)
        start_at: Optional datetime when rotation should START (for scheduled rotations)

    Returns:
        Result dict with success status
    """
    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)

        # Calculate end time
        # IMPORTANT: If start_at is in the past (or immediate start), calculate end_at from NOW
        # Only use start_at as base if it's a future scheduled start
        rotation_end_at = None
        if end_at:
            rotation_end_at = end_at
        elif run_duration_hours:
            # Check if start_at is in the future (scheduled) or past/immediate
            is_future_start = start_at and start_at > now
            base_time = start_at if is_future_start else now
            rotation_end_at = base_time + timedelta(hours=run_duration_hours)

        # If start_at is in the future, create as "pending" (enabled=False)
        is_scheduled = start_at and start_at > now

        rotation_doc = {
            "account_id": account_id,
            "test_user_id": test_user_id,
            "captions": captions,
            "auto_unsend_after_minutes": auto_unsend_after_minutes,
            "total_cycles": total_cycles if total_cycles else 0,  # 0 = unlimited
            "current_index": 0,
            "messages_sent": 0,
            "completed_cycles": 0,
            "enabled": not is_scheduled,  # False if scheduled for later
            "pending": is_scheduled,  # True if waiting to start
            "start_at": start_at,  # When rotation should begin
            "created_at": now,
            "last_sent_at": None,
            "end_at": rotation_end_at,  # When to stop rotation
        }

        await db.collection(COLLECTION_ROTATION).document(account_id).set(rotation_doc)

        end_info = ""
        if rotation_end_at:
            end_info = f", ends at {rotation_end_at.isoformat()}"
        cycle_info = f"{total_cycles} cycle(s)" if total_cycles else "unlimited cycles"
        start_info = f" (scheduled for {start_at.isoformat()})" if is_scheduled else ""

        logger.info(f"Created rotation for {account_id}: {len(captions)} captions, {cycle_info}{end_info}{start_info}")

        return {
            "success": True,
            "message": f"Rotation created with {len(captions)} captions",
            "end_at": rotation_end_at.isoformat() if rotation_end_at else None,
            "start_at": start_at.isoformat() if start_at else None,
            "scheduled": is_scheduled,
        }

    except Exception as e:
        logger.error(f"Error starting rotation for {account_id}: {e}")
        return {"success": False, "error": str(e)}


async def schedule_rotation_start_job(account_id: str, start_at: datetime) -> None:
    """Schedule a job to start rotation at a specific time.

    Args:
        account_id: The OnlyFans account ID
        start_at: When to start the rotation
    """
    scheduler = get_scheduler()
    job_id = f"rotation_start_{account_id}"

    # Remove existing job if present
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.debug(f"Removed existing rotation start job {job_id}")

    # Ensure start_at is timezone-aware
    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=timezone.utc)

    # If start time is in the past, execute immediately
    if start_at <= datetime.now(timezone.utc):
        logger.warning(f"Rotation start time for {account_id} is in the past, executing immediately")
        asyncio.create_task(_execute_rotation_start(account_id))
        return

    # Schedule for future execution
    scheduler.add_job(
        _execute_rotation_start,
        DateTrigger(run_date=start_at),
        args=[account_id],
        id=job_id,
        replace_existing=True,
    )

    logger.info(f"Scheduled rotation start job {job_id} for {start_at.isoformat()}")


async def _execute_rotation_start(account_id: str) -> None:
    """Execute rotation start - called by scheduler at scheduled time.

    Args:
        account_id: The OnlyFans account ID
    """
    logger.info(f"Starting scheduled rotation for account {account_id}")

    try:
        db = get_firestore_client()

        # Update rotation state to enabled
        await db.collection(COLLECTION_ROTATION).document(account_id).update({
            "enabled": True,
            "pending": False,
            "started_at": datetime.now(timezone.utc),
        })

        # Get the rotation state and send first message
        rotation_state = await _get_rotation_state(account_id)
        if rotation_state:
            await _send_rotated_message(account_id, rotation_state)
            logger.info(f"Scheduled rotation started successfully for {account_id}")
        else:
            logger.error(f"Rotation state not found for {account_id}")

    except Exception as e:
        logger.error(f"Error starting scheduled rotation for {account_id}: {e}")


async def stop_rotation(account_id: str) -> dict:
    """Stop continuous rotation for an account.

    Args:
        account_id: The OnlyFans account ID

    Returns:
        Result dict with success status
    """
    try:
        db = get_firestore_client()
        await db.collection(COLLECTION_ROTATION).document(account_id).delete()

        # Also cancel any pending auto-unsend job
        await cancel_auto_unsend_job(account_id)

        logger.info(f"Stopped rotation for {account_id}")
        return {"success": True, "message": "Rotation stopped"}

    except Exception as e:
        logger.error(f"Error stopping rotation for {account_id}: {e}")
        return {"success": False, "error": str(e)}


async def _load_pending_jobs() -> None:
    """Load all pending approved jobs from Firestore on startup."""
    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)

        # Query for queued, approved messages scheduled in the future
        query = (
            db.collection(COLLECTION_SCHEDULED)
            .where(filter=FieldFilter("status", "==", MessageStatus.QUEUED.value))
            .where(filter=FieldFilter("approval_status", "==", ApprovalStatus.APPROVED.value))
            .where(filter=FieldFilter("scheduled_at", ">=", now))
        )

        docs = await query.get()
        loaded_count = 0

        for doc in docs:
            data = doc.to_dict()
            scheduled_at = data.get("scheduled_at")

            # Handle Firestore Timestamp
            if hasattr(scheduled_at, 'timestamp'):
                # Convert Firestore Timestamp to datetime
                scheduled_at = datetime.fromtimestamp(scheduled_at.timestamp(), tz=timezone.utc)
            elif isinstance(scheduled_at, datetime):
                if scheduled_at.tzinfo is None:
                    scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

            if scheduled_at:
                await schedule_message_job(data["id"], scheduled_at)
                loaded_count += 1

        logger.info(f"Loaded {loaded_count} pending jobs from Firestore")

    except Exception as e:
        logger.error(f"Error loading pending jobs: {e}")


async def _check_pending_jobs() -> None:
    """Periodic check for new or missed jobs.

    This runs every minute to catch:
    - Messages that were approved while scheduler was checking
    - Messages whose scheduled time just passed (missed due to timing)
    - New messages scheduled for the near future
    """
    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)
        past_threshold = now - timedelta(minutes=5)  # Look back 5 minutes for missed
        future_threshold = now + timedelta(minutes=10)  # Look ahead 10 minutes

        # Check for overdue messages (missed execution)
        overdue_query = (
            db.collection(COLLECTION_SCHEDULED)
            .where(filter=FieldFilter("status", "==", MessageStatus.QUEUED.value))
            .where(filter=FieldFilter("approval_status", "==", ApprovalStatus.APPROVED.value))
            .where(filter=FieldFilter("scheduled_at", "<=", now))
            .where(filter=FieldFilter("scheduled_at", ">=", past_threshold))
        )

        overdue_docs = await overdue_query.get()

        for doc in overdue_docs:
            data = doc.to_dict()
            logger.warning(f"Found overdue message {data['id']}, executing now")
            asyncio.create_task(_execute_message(data["id"]))

        # Schedule upcoming messages (next 10 minutes)
        upcoming_query = (
            db.collection(COLLECTION_SCHEDULED)
            .where(filter=FieldFilter("status", "==", MessageStatus.QUEUED.value))
            .where(filter=FieldFilter("approval_status", "==", ApprovalStatus.APPROVED.value))
            .where(filter=FieldFilter("scheduled_at", ">", now))
            .where(filter=FieldFilter("scheduled_at", "<=", future_threshold))
        )

        upcoming_docs = await upcoming_query.get()
        scheduler = get_scheduler()

        for doc in upcoming_docs:
            data = doc.to_dict()
            job_id = f"scheduled_message_{data['id']}"

            # Only add if not already scheduled
            if not scheduler.get_job(job_id):
                scheduled_at = data.get("scheduled_at")

                if hasattr(scheduled_at, 'timestamp'):
                    scheduled_at = datetime.fromtimestamp(scheduled_at.timestamp(), tz=timezone.utc)
                elif isinstance(scheduled_at, datetime):
                    if scheduled_at.tzinfo is None:
                        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

                if scheduled_at:
                    await schedule_message_job(data["id"], scheduled_at)

    except Exception as e:
        logger.error(f"Error in periodic job check: {e}")


def get_scheduled_jobs() -> list:
    """Get list of currently scheduled jobs.

    Returns:
        List of job info dicts
    """
    scheduler = get_scheduler()
    jobs = []

    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
            "name": job.name,
        })

    return jobs
