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

COLLECTION_SCHEDULED = "scheduled_messages"
COLLECTION_ROTATION = "rotation_state"


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(
            jobstores={"default": MemoryJobStore()},
            job_defaults={
                "coalesce": True,
                "max_instances": 1,
                "misfire_grace_time": 300,
            },
        )
    return _scheduler


async def start_scheduler() -> None:
    scheduler = get_scheduler()

    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started")

    await _load_pending_jobs()

    scheduler.add_job(
        _check_pending_jobs,
        "interval",
        minutes=1,
        id="check_pending_jobs",
        replace_existing=True,
    )
    logger.info("Scheduled periodic job checker (every 1 minute)")


async def stop_scheduler() -> None:
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.shutdown(wait=True)
        logger.info("APScheduler stopped")


async def schedule_message_job(message_id: str, scheduled_at: datetime) -> None:
    scheduler = get_scheduler()
    job_id = f"scheduled_message_{message_id}"

    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.debug(f"Removed existing job {job_id}")

    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

    if scheduled_at <= datetime.now(timezone.utc):
        logger.warning(f"Message {message_id} scheduled time is in the past, executing immediately")
        asyncio.create_task(_execute_message(message_id))
        return

    scheduler.add_job(
        _execute_message,
        DateTrigger(run_date=scheduled_at),
        args=[message_id],
        id=job_id,
        replace_existing=True,
    )

    logger.info(f"Scheduled job {job_id} for {scheduled_at.isoformat()}")


async def cancel_message_job(message_id: str) -> None:
    scheduler = get_scheduler()
    job_id = f"scheduled_message_{message_id}"

    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"Cancelled job {job_id}")


async def schedule_auto_unsend_job(account_id: str, unsend_at: datetime) -> None:
    scheduler = get_scheduler()
    job_id = f"auto_unsend_{account_id}"

    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.debug(f"Removed existing auto-unsend job {job_id}")

    if unsend_at.tzinfo is None:
        unsend_at = unsend_at.replace(tzinfo=timezone.utc)

    if unsend_at <= datetime.now(timezone.utc):
        logger.warning(f"Auto-unsend time for {account_id} is in the past, executing immediately")
        asyncio.create_task(_execute_auto_unsend(account_id))
        return

    scheduler.add_job(
        _execute_auto_unsend,
        DateTrigger(run_date=unsend_at),
        args=[account_id],
        id=job_id,
        replace_existing=True,
    )

    logger.info(f"Scheduled auto-unsend job {job_id} for {unsend_at.isoformat()}")


async def cancel_auto_unsend_job(account_id: str) -> None:
    scheduler = get_scheduler()
    job_id = f"auto_unsend_{account_id}"

    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"Cancelled auto-unsend job {job_id}")


async def _execute_message(message_id: str) -> None:
    logger.info(f"Executing scheduled message {message_id}")

    from modules.scheduled_message_service import ScheduledMessageService

    try:
        service = ScheduledMessageService()
        await service.execute_scheduled_message(message_id)
    except Exception as e:
        logger.error(f"Error executing scheduled message {message_id}: {e}")


async def _execute_auto_unsend(account_id: str) -> None:
    logger.info(f"Executing auto-unsend for account {account_id}")

    from modules.scheduled_message_service import ScheduledMessageService

    try:
        service = ScheduledMessageService()
        success = await service.unsend_active_message(account_id)
        if success:
            logger.info(f"Auto-unsend completed for account {account_id}")
        else:
            logger.warning(f"No active message to unsend for account {account_id}")

        rotation_state = await _get_rotation_state(account_id)
        if rotation_state and rotation_state.get("enabled"):
            logger.info(f"Continuous rotation enabled for {account_id}, sending next message")
            await _send_rotated_message(account_id, rotation_state)
        else:
            logger.debug(f"Continuous rotation not enabled for {account_id}")

    except Exception as e:
        logger.error(f"Error executing auto-unsend for account {account_id}: {e}")


async def _get_rotation_state(account_id: str) -> Optional[dict]:
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
    from modules.scheduled_message_service import ScheduledMessageService
    from modules.vault_manager import VaultManager
    from modules.auth import authenticate_from_db, close_session
    from modules.mass_message import MassMessenger, Recipient

    try:
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

        end_at = rotation_state.get("end_at")
        if end_at:
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

        messages_sent = rotation_state.get("messages_sent", 0)

        if total_cycles > 0:
            total_messages = total_cycles * len(captions)
            if messages_sent >= total_messages:
                logger.info(f"Completed all {total_cycles} cycle(s) for {account_id}")
                await _disable_rotation(account_id)
                return

        caption = captions[current_index]
        next_index = (current_index + 1) % len(captions)

        new_completed_cycles = completed_cycles
        if next_index == 0:
            new_completed_cycles += 1

        logger.info(f"Using caption {current_index + 1}/{len(captions)}: '{caption[:30]}...'")

        auth_results = await authenticate_from_db(model_id=account_id)
        if not auth_results or not auth_results[0].get("success"):
            logger.error(f"Authentication failed for {account_id}")
            return

        auth = auth_results[0]["authed"]
        account_username = auth_results[0].get("account_name", "Unknown")

        try:
            gif_id = await _get_random_gif(account_id)

            user_id_str = test_user_id
            if user_id_str.startswith('u'):
                user_id_str = user_id_str[1:]
            user_id = int(user_id_str)

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

            messenger = MassMessenger(auth)
            media_ids = [int(gif_id)] if gif_id else None

            logger.info(f"Sending rotated message to {fan_username} with GIF {gif_id}")

            results = await messenger.send_mass_message(
                recipients=[recipient],
                message_template=caption,
                media_ids=media_ids,
                price=0,
            )

            if results and results[0].success:
                sent_message_id = str(getattr(results[0], 'message_id', None))
                logger.info(f"Rotated message sent: {sent_message_id}")

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

                await _update_rotation_state(
                    account_id,
                    current_index=next_index,
                    messages_sent=messages_sent + 1,
                    completed_cycles=new_completed_cycles,
                )

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
    from modules.vault_manager import VaultManager

    try:
        vault = VaultManager()
        try:
            gifs_folder = await vault.find_folder_by_pattern(account_id, "gif")
            if not gifs_folder:
                logger.warning(f"No GIFs folder found for {account_id}")
                return None

            folder_id = gifs_folder.get("id")
            logger.debug(f"Found GIFs folder: {gifs_folder.get('name')} (id: {folder_id})")

            all_media = await vault.get_all_vault_media(account_id, folder_id)
            gifs = [m for m in all_media if m.get('type') == 'gif']

            if not gifs:
                logger.warning(f"No GIFs found in folder for {account_id}")
                return None

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
    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)

        await db.collection(COLLECTION_ROTATION).document(account_id).update({
            "enabled": False,
            "completed_at": now,
        })
        logger.info(f"Disabled rotation for {account_id}")

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
    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)

        rotation_end_at = None
        if end_at:
            rotation_end_at = end_at
        elif run_duration_hours:
            is_future_start = start_at and start_at > now
            base_time = start_at if is_future_start else now
            rotation_end_at = base_time + timedelta(hours=run_duration_hours)

        is_scheduled = start_at and start_at > now

        rotation_doc = {
            "account_id": account_id,
            "test_user_id": test_user_id,
            "captions": captions,
            "auto_unsend_after_minutes": auto_unsend_after_minutes,
            "total_cycles": total_cycles if total_cycles else 0,
            "current_index": 0,
            "messages_sent": 0,
            "completed_cycles": 0,
            "enabled": not is_scheduled,
            "pending": is_scheduled,
            "start_at": start_at,
            "created_at": now,
            "last_sent_at": None,
            "end_at": rotation_end_at,
        }

        await db.collection(COLLECTION_ROTATION).document(account_id).set(rotation_doc)

        end_info = ""
        if rotation_end_at:
            end_info = f", ends at {rotation_end_at.isoformat()}"
        cycle_info = f"{total_cycles} cycle(s)" if total_cycles else "unlimited cycles"
        start_info = f" (scheduled for {start_at.isoformat()})" if is_scheduled else ""

        logger.info(
            f"Created rotation for {account_id}: {len(captions)} captions, "
            f"{cycle_info}{end_info}{start_info}"
        )

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
    scheduler = get_scheduler()
    job_id = f"rotation_start_{account_id}"

    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.debug(f"Removed existing rotation start job {job_id}")

    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=timezone.utc)

    if start_at <= datetime.now(timezone.utc):
        logger.warning(f"Rotation start time for {account_id} is in the past, executing immediately")
        asyncio.create_task(_execute_rotation_start(account_id))
        return

    scheduler.add_job(
        _execute_rotation_start,
        DateTrigger(run_date=start_at),
        args=[account_id],
        id=job_id,
        replace_existing=True,
    )

    logger.info(f"Scheduled rotation start job {job_id} for {start_at.isoformat()}")


async def _execute_rotation_start(account_id: str) -> None:
    logger.info(f"Starting scheduled rotation for account {account_id}")

    try:
        db = get_firestore_client()

        await db.collection(COLLECTION_ROTATION).document(account_id).update({
            "enabled": True,
            "pending": False,
            "started_at": datetime.now(timezone.utc),
        })

        rotation_state = await _get_rotation_state(account_id)
        if rotation_state:
            await _send_rotated_message(account_id, rotation_state)
            logger.info(f"Scheduled rotation started successfully for {account_id}")
        else:
            logger.error(f"Rotation state not found for {account_id}")

    except Exception as e:
        logger.error(f"Error starting scheduled rotation for {account_id}: {e}")


async def stop_rotation(account_id: str) -> dict:
    try:
        db = get_firestore_client()
        await db.collection(COLLECTION_ROTATION).document(account_id).delete()

        await cancel_auto_unsend_job(account_id)

        logger.info(f"Stopped rotation for {account_id}")
        return {"success": True, "message": "Rotation stopped"}

    except Exception as e:
        logger.error(f"Error stopping rotation for {account_id}: {e}")
        return {"success": False, "error": str(e)}


async def _load_pending_jobs() -> None:
    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)

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

            if hasattr(scheduled_at, 'timestamp'):
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
    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)
        past_threshold = now - timedelta(minutes=5)
        future_threshold = now + timedelta(minutes=10)

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
    scheduler = get_scheduler()
    jobs = []

    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
            "name": job.name,
        })

    return jobs
