import asyncio
import logging
import random
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from apscheduler.jobstores.memory import MemoryJobStore
from google.cloud.firestore_v1 import FieldFilter

from modules.firebase_client import get_firestore_client
from modules.scheduled_message_models import MessageStatus, ApprovalStatus

logger = logging.getLogger(__name__)

_scheduler: Optional[AsyncIOScheduler] = None
_session_pool: Dict[str, dict] = {}
_executing_messages: set = set()

COLLECTION_SCHEDULED = "scheduled_messages"
COLLECTION_ROTATION = "rotation_state"
COLLECTION_BULK_GROUPS = "bulk_rotation_groups"


async def get_or_create_session(account_id: str) -> Optional[dict]:
    """Get existing session from pool or create new one."""
    global _session_pool
    from modules.auth import authenticate_from_db

    if account_id in _session_pool:
        session = _session_pool[account_id]
        logger.debug(f"Reusing existing session for {account_id}")
        return session

    auth_results = await authenticate_from_db(model_id=account_id)
    if not auth_results or not auth_results[0].get("success"):
        logger.error(f"Authentication failed for {account_id}")
        return None

    session = auth_results[0]
    _session_pool[account_id] = session
    logger.info(f"Created and cached session for {session.get('account_name', account_id)}")
    return session


async def close_session_pool() -> None:
    """Close all sessions in the pool."""
    global _session_pool
    from modules.auth import close_session

    for account_id, session_data in _session_pool.items():
        auth = session_data.get("authed")
        if auth:
            try:
                await close_session(auth)
                logger.debug(f"Closed session for {account_id}")
            except Exception as e:
                logger.warning(f"Error closing session for {account_id}: {e}")

    _session_pool.clear()
    logger.info("Session pool cleared")


async def remove_session(account_id: str) -> None:
    """Remove a single session from the pool."""
    global _session_pool
    from modules.auth import close_session

    if account_id in _session_pool:
        session_data = _session_pool.pop(account_id)
        auth = session_data.get("authed")
        if auth:
            try:
                await close_session(auth)
            except Exception:
                pass


async def prefetch_sessions(account_ids: List[str]) -> Dict[str, dict]:
    """Prefetch and cache sessions for multiple accounts using batch DB query."""
    global _session_pool
    import os
    from modules.db_credential_loader import load_multiple_credentials_from_db
    from modules.gologin_manager import GoLoginManager
    from ultima_scraper_api import select_api
    from ultima_scraper_api.apis.onlyfans.classes.extras import AuthDetails
    from ultima_scraper_api.apis.onlyfans.authenticator import OnlyFansAuthenticator
    from ultima_scraper_api.config import UltimaScraperAPIConfig

    # Filter out already cached accounts
    missing_ids = [aid for aid in account_ids if aid not in _session_pool]
    if not missing_ids:
        logger.debug("All requested sessions already cached")
        return {aid: _session_pool[aid] for aid in account_ids if aid in _session_pool}

    logger.info(f"Prefetching sessions for {len(missing_ids)} accounts...")

    # Step 1: Single DB query for all credentials
    credentials_map = await load_multiple_credentials_from_db(missing_ids)
    if not credentials_map:
        logger.warning("No credentials loaded for prefetch")
        return _session_pool

    # Helper for GoLogin proxy
    async def get_proxy_from_gologin(profile_id: str, account_name: str) -> Optional[str]:
        token = os.getenv("GOLOGIN_API_TOKEN")
        if not token:
            return None
        manager = None
        try:
            manager = GoLoginManager(api_token=token)
            profile_data = await manager.get_profile(profile_id)
            if profile_data:
                return manager._extract_proxy_url(profile_data)
        except Exception as e:
            logger.error(f"[{account_name}] GoLogin error: {e}")
        finally:
            if manager:
                await manager.close()
        return None

    # Step 2: Authenticate with OnlyFans API in parallel
    async def auth_single(account_id: str, cred: dict) -> tuple:
        account_name = cred.get("username", "Unknown")
        auth_data = cred.get("auth", {})
        gologin_profile_id = cred.get("gologin_profile_id")

        if not auth_data:
            return account_id, None

        try:
            auth_details = AuthDetails(
                id=cred.get("id"),
                username=account_name,
                cookie=auth_data.get("cookie", ""),
                x_bc=auth_data.get("x_bc", ""),
                user_agent=auth_data.get("user_agent", ""),
            )

            proxy_url = None
            if gologin_profile_id:
                proxy_url = await get_proxy_from_gologin(gologin_profile_id, account_name)

            if proxy_url:
                config = UltimaScraperAPIConfig()
                config.settings.network.proxies = [proxy_url]
                api = select_api("onlyfans", config=config)
            else:
                api = select_api("onlyfans")

            authenticator = OnlyFansAuthenticator(api, auth_details)
            auth = await authenticator.login()

            if auth and authenticator.is_authed():
                return account_id, {
                    "authed": auth,
                    "api": api,
                    "account_name": account_name,
                    "model_id": cred.get("id"),
                    "proxy_url": proxy_url,
                    "success": True
                }
        except Exception as e:
            logger.error(f"Prefetch auth failed for {account_id}: {e}")

        return account_id, None

    tasks = [auth_single(aid, cred) for aid, cred in credentials_map.items()]
    results = await asyncio.gather(*tasks)

    for account_id, session in results:
        if session:
            _session_pool[account_id] = session
            logger.info(f"Prefetched session for {session.get('account_name', account_id)}")

    logger.info(f"Prefetch complete: {len(_session_pool)} total sessions cached")
    return _session_pool


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
    await close_session_pool()


async def schedule_message_job(message_id: str, scheduled_at: datetime) -> None:
    scheduler = get_scheduler()
    job_id = f"scheduled_message_{message_id}"

    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.debug(f"Removed existing job {job_id}")

    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

    if scheduled_at <= datetime.now(timezone.utc):
        global _executing_messages
        if message_id in _executing_messages:
            logger.debug(f"Message {message_id} already scheduled for execution, skipping")
            return
        _executing_messages.add(message_id)
        logger.warning(f"Message {message_id} scheduled time is in the past, executing immediately")
        asyncio.create_task(_execute_message_with_cleanup(message_id))
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
    global _executing_messages
    if message_id in _executing_messages:
        logger.debug(f"Message {message_id} already executing, skipping")
        return
    _executing_messages.add(message_id)

    logger.info(f"Executing scheduled message {message_id}")

    try:
        # Check if this is a bulk rotation message
        if message_id.startswith("bulk_"):
            group_id = message_id.replace("bulk_", "")
            logger.info(f"Detected bulk rotation message, executing group {group_id}")
            await _execute_bulk_rotation_start(group_id)
        else:
            from modules.scheduled_message_service import ScheduledMessageService
            service = ScheduledMessageService()
            await service.execute_scheduled_message(message_id)
    except Exception as e:
        logger.error(f"Error executing scheduled message {message_id}: {e}")
    finally:
        _executing_messages.discard(message_id)


async def _execute_message_with_cleanup(message_id: str) -> None:
    """Execute message and remove from tracking set when done."""
    global _executing_messages
    if message_id in _executing_messages:
        logger.debug(f"Message {message_id} already executing, skipping")
        return
    _executing_messages.add(message_id)

    logger.info(f"Executing scheduled message {message_id}")

    try:
        # Check if this is a bulk rotation message
        if message_id.startswith("bulk_"):
            group_id = message_id.replace("bulk_", "")
            logger.info(f"Detected bulk rotation message, executing group {group_id}")
            await _execute_bulk_rotation_start(group_id)
        else:
            from modules.scheduled_message_service import ScheduledMessageService
            service = ScheduledMessageService()
            await service.execute_scheduled_message(message_id)
    except Exception as e:
        logger.error(f"Error executing scheduled message {message_id}: {e}")
    finally:
        _executing_messages.discard(message_id)


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
            bulk_group_id = rotation_state.get("bulk_group_id")

            if bulk_group_id:
                db = get_firestore_client()
                group_doc = await db.collection(COLLECTION_BULK_GROUPS).document(
                    bulk_group_id
                ).get()

                if group_doc.exists:
                    group_data = group_doc.to_dict()
                    trigger_model = group_data.get("model_ids", [])[0] if group_data.get("model_ids") else None

                    if account_id == trigger_model:
                        logger.info(
                            f"Bulk group {bulk_group_id}: trigger model {account_id} "
                            f"executing synchronized send for all models"
                        )
                        await _execute_bulk_rotation_sends(bulk_group_id)
                    else:
                        logger.debug(
                            f"Bulk group {bulk_group_id}: {account_id} is not trigger model, "
                            f"skipping (handled by {trigger_model})"
                        )
                else:
                    logger.warning(
                        f"Bulk group {bulk_group_id} not found, falling back to single send"
                    )
                    await _send_rotated_message(account_id, rotation_state)
            else:
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
    from modules.collections import CollectionsManager

    try:
        captions = rotation_state.get("captions", [])
        current_index = rotation_state.get("current_index", 0)
        auto_unsend_minutes = rotation_state.get("auto_unsend_after_minutes", 1)
        total_cycles = rotation_state.get("total_cycles", 1)
        completed_cycles = rotation_state.get("completed_cycles", 0)

        recipient_type = rotation_state.get("recipient_type", "test_user")
        collection_id = rotation_state.get("collection_id")
        test_user_id = rotation_state.get("test_user_id")

        gif_queue = rotation_state.get("gif_queue", [])
        gif_queue_index = rotation_state.get("gif_queue_index", 0)

        if not captions:
            logger.warning(f"No captions configured for rotation on {account_id}")
            return

        if recipient_type == "test_user" and not test_user_id:
            logger.warning(f"No test user configured for rotation on {account_id}")
            return

        if recipient_type == "collection" and not collection_id:
            logger.warning(f"No collection configured for rotation on {account_id}")
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

        if gif_queue and gif_queue_index >= len(gif_queue):
            logger.info(f"All {len(gif_queue)} GIFs sent for {account_id}, rotation complete")
            await _disable_rotation(account_id)
            return

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
            if gif_queue and gif_queue_index < len(gif_queue):
                gif_id = gif_queue[gif_queue_index]
                new_gif_queue_index = gif_queue_index + 1
                logger.info(f"Using GIF {gif_queue_index + 1}/{len(gif_queue)} from queue: {gif_id}")
            else:
                gif_id = await _get_random_gif(account_id)
                new_gif_queue_index = gif_queue_index

            recipients = []

            if recipient_type == "collection":
                collections_mgr = CollectionsManager(auth)
                users = await collections_mgr.get_collection_users(collection_id, fetch_all=True)
                recipients = [
                    Recipient(
                        user_id=u["id"],
                        username=u.get("username", "Unknown"),
                        name=u.get("name") or u.get("username", "Unknown"),
                    )
                    for u in users
                ]
                logger.info(f"Fetched {len(recipients)} recipients from collection {collection_id}")
            else:
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

                recipients = [
                    Recipient(
                        user_id=user_id,
                        username=fan_username,
                        name=fan_name,
                    )
                ]

            if not recipients:
                logger.warning(f"No recipients found for rotation on {account_id}")
                return

            messenger = MassMessenger(auth)
            media_ids = [int(gif_id)] if gif_id else None

            logger.info(
                f"Sending rotated message to {len(recipients)} recipient(s) with GIF {gif_id}"
            )

            if len(recipients) == 1:
                results = await messenger.send_mass_message(
                    recipients=recipients,
                    message_template=caption,
                    media_ids=media_ids,
                    price=0,
                )
            else:
                results = await messenger.send_mass_message_parallel(
                    recipients=recipients,
                    message_template=caption,
                    media_ids=media_ids,
                    price=0,
                    concurrent_sends=10,
                    batch_delay=3.0,
                )

            successful_results = [r for r in results if r.success]
            failed_results = [r for r in results if not r.success]
            sent_message_ids = [
                str(r.message_id) for r in successful_results if r.message_id
            ]

            logger.info(
                f"Rotation send complete: {len(successful_results)} success, "
                f"{len(failed_results)} failed"
            )

            if successful_results:
                service = ScheduledMessageService()
                await service._set_active_message(
                    account_id=account_id,
                    scheduled_message_id=f"rotation_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                    account_username=account_username,
                    message_content=caption,
                    price=0,
                    recipient_count=len(recipients),
                    message_ids=sent_message_ids,
                )

                await _update_rotation_state(
                    account_id,
                    current_index=next_index,
                    messages_sent=messages_sent + 1,
                    completed_cycles=new_completed_cycles,
                    gif_queue_index=new_gif_queue_index,
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
    gif_queue_index: Optional[int] = None,
) -> None:
    try:
        db = get_firestore_client()
        update_data = {
            "current_index": current_index,
            "messages_sent": messages_sent,
            "completed_cycles": completed_cycles,
            "last_sent_at": datetime.now(timezone.utc),
        }
        if gif_queue_index is not None:
            update_data["gif_queue_index"] = gif_queue_index

        await db.collection(COLLECTION_ROTATION).document(account_id).update(update_data)
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
    global _executing_messages
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
            message_id = data['id']
            if message_id in _executing_messages:
                logger.debug(f"Message {message_id} already executing, skipping")
                continue
            _executing_messages.add(message_id)
            logger.warning(f"Found overdue message {message_id}, executing now")
            asyncio.create_task(_execute_message_with_cleanup(message_id))

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


async def start_bulk_rotation(
    model_ids: List[str],
    captions: List[str],
    gif_count: int,
    vault_folder_name: str = "GIFS",
    recipient_type: str = "collection",
    collection_id: Optional[str] = None,
    collection_name: Optional[str] = None,
    test_user_id: Optional[str] = None,
    auto_unsend_after_minutes: int = 60,
    total_cycles: int = 0,
    end_at: Optional[datetime] = None,
    start_at: Optional[datetime] = None,
    stagger_minutes: int = 0,
) -> dict:
    from modules.vault_manager import VaultManager
    from uuid import uuid4

    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)

        group_id = str(uuid4())

        group_doc = {
            "id": group_id,
            "model_ids": model_ids,
            "recipient_type": recipient_type,
            "collection_id": collection_id,
            "collection_name": collection_name,
            "test_user_id": test_user_id,
            "vault_folder_name": vault_folder_name,
            "captions": captions,
            "gif_count": gif_count,
            "auto_unsend_after_minutes": auto_unsend_after_minutes,
            "total_cycles": total_cycles,
            "end_at": end_at,
            "start_at": start_at,
            "stagger_minutes": stagger_minutes,
            "created_at": now,
            "status": "pending",
            "approval_status": "pending",
        }

        await db.collection(COLLECTION_BULK_GROUPS).document(group_id).set(group_doc)

        model_gif_queues = {}
        vault = VaultManager()
        try:
            for model_id in model_ids:
                gif_ids = await vault.get_random_gifs_from_folder(
                    model_id, vault_folder_name, gif_count
                )
                model_gif_queues[model_id] = gif_ids
                logger.info(f"Pre-selected {len(gif_ids)} GIFs for model {model_id}")
        finally:
            await vault.close()

        for model_id in model_ids:
            rotation_doc = {
                "account_id": model_id,
                "bulk_group_id": group_id,
                "recipient_type": recipient_type,
                "collection_id": collection_id,
                "collection_name": collection_name,
                "test_user_id": test_user_id,
                "captions": captions,
                "gif_queue": model_gif_queues.get(model_id, []),
                "gif_queue_index": 0,
                "auto_unsend_after_minutes": auto_unsend_after_minutes,
                "total_cycles": total_cycles,
                "current_index": 0,
                "messages_sent": 0,
                "completed_cycles": 0,
                "enabled": False,
                "pending": True,
                "start_at": start_at,
                "end_at": end_at,
                "created_at": now,
                "last_sent_at": None,
            }

            await db.collection(COLLECTION_ROTATION).document(model_id).set(rotation_doc)
            logger.info(f"Created rotation state for model {model_id}")

        logger.info(
            f"Created bulk rotation group {group_id} with {len(model_ids)} models, "
            f"{gif_count} GIFs each"
        )

        return {
            "success": True,
            "group_id": group_id,
            "model_count": len(model_ids),
            "gif_queues": model_gif_queues,
        }

    except Exception as e:
        logger.error(f"Error starting bulk rotation: {e}")
        return {"success": False, "error": str(e)}


async def _execute_bulk_rotation_sends(group_id: str) -> None:
    try:
        db = get_firestore_client()

        query = (
            db.collection(COLLECTION_ROTATION)
            .where(filter=FieldFilter("bulk_group_id", "==", group_id))
            .where(filter=FieldFilter("enabled", "==", True))
        )

        docs = await query.get()

        if not docs:
            logger.warning(f"No active rotations found for group {group_id}")
            return

        async def safe_send(account_id: str, rotation_state: dict) -> dict:
            try:
                await _send_rotated_message(account_id, rotation_state)
                return {"account_id": account_id, "success": True}
            except Exception as e:
                logger.error(f"Model {account_id} failed in bulk rotation: {e}")
                await _mark_model_rotation_error(account_id, str(e))
                return {"account_id": account_id, "success": False, "error": str(e)}

        tasks = [
            safe_send(doc.to_dict().get("account_id"), doc.to_dict())
            for doc in docs
        ]

        results = await asyncio.gather(*tasks)

        success_count = sum(1 for r in results if r.get("success"))
        failed_count = len(results) - success_count
        logger.info(
            f"Bulk rotation sends for group {group_id}: "
            f"{success_count}/{len(results)} models successful"
        )

        # Update scheduled_messages document with counts for UI display
        scheduled_message_id = f"bulk_{group_id}"
        scheduled_doc_ref = db.collection(COLLECTION_SCHEDULED).document(scheduled_message_id)
        await scheduled_doc_ref.update({
            "success_count": success_count,
            "failed_count": failed_count,
            "updated_at": datetime.now(timezone.utc),
        })

    except Exception as e:
        logger.error(f"Error executing bulk rotation sends for {group_id}: {e}")


async def _mark_model_rotation_error(account_id: str, error: str) -> None:
    try:
        db = get_firestore_client()
        doc_ref = db.collection(COLLECTION_ROTATION).document(account_id)
        doc = await doc_ref.get()

        if doc.exists:
            current_count = doc.to_dict().get("error_count", 0)
            await doc_ref.update({
                "last_error": error,
                "last_error_at": datetime.now(timezone.utc),
                "error_count": current_count + 1,
            })
    except Exception as e:
        logger.error(f"Error marking rotation error for {account_id}: {e}")


async def schedule_bulk_rotation_start_job(group_id: str, start_at: datetime) -> None:
    scheduler = get_scheduler()
    job_id = f"bulk_rotation_start_{group_id}"

    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.debug(f"Removed existing bulk rotation start job {job_id}")

    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=timezone.utc)

    if start_at <= datetime.now(timezone.utc):
        logger.warning(
            f"Bulk rotation start time for {group_id} is in the past, executing immediately"
        )
        asyncio.create_task(_execute_bulk_rotation_start(group_id))
        return

    scheduler.add_job(
        _execute_bulk_rotation_start,
        DateTrigger(run_date=start_at),
        args=[group_id],
        id=job_id,
        replace_existing=True,
    )

    logger.info(f"Scheduled bulk rotation start job {job_id} for {start_at.isoformat()}")


async def _execute_bulk_rotation_start(group_id: str) -> None:
    logger.info(f"Starting scheduled bulk rotation: {group_id}")

    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)

        scheduled_message_id = f"bulk_{group_id}"
        scheduled_doc_ref = db.collection(COLLECTION_SCHEDULED).document(scheduled_message_id)
        scheduled_doc = await scheduled_doc_ref.get()
        if scheduled_doc.exists:
            await scheduled_doc_ref.update({
                "status": MessageStatus.PROCESSING.value,
                "started_at": now,
                "updated_at": now,
            })
            logger.info(f"Marked scheduled message {scheduled_message_id} as processing")

        group_doc = await db.collection(COLLECTION_BULK_GROUPS).document(group_id).get()
        if not group_doc.exists:
            logger.error(f"Bulk group {group_id} not found")
            return

        group_data = group_doc.to_dict()
        model_ids = group_data.get("model_ids", [])
        stagger_minutes = group_data.get("stagger_minutes", 0)

        await group_doc.reference.update({
            "status": "running",
            "started_at": now,
        })

        scheduler = get_scheduler()
        models_started_immediately = 0

        for index, model_id in enumerate(model_ids):
            model_start_offset = index * stagger_minutes
            model_start_time = now + timedelta(minutes=model_start_offset)

            if model_start_offset == 0 or model_start_time <= now:
                await db.collection(COLLECTION_ROTATION).document(model_id).update({
                    "enabled": True,
                    "pending": False,
                    "started_at": now,
                    "stagger_index": index,
                })
                models_started_immediately += 1
                logger.info(f"Model {model_id} starting immediately (index {index})")
            else:
                await db.collection(COLLECTION_ROTATION).document(model_id).update({
                    "scheduled_start_at": model_start_time,
                    "stagger_index": index,
                })
                job_id = f"model_start_{group_id}_{model_id}"
                scheduler.add_job(
                    _start_single_model_rotation,
                    DateTrigger(run_date=model_start_time),
                    args=[group_id, model_id],
                    id=job_id,
                    replace_existing=True,
                )
                logger.info(
                    f"Model {model_id} scheduled to start at {model_start_time.isoformat()} "
                    f"(+{model_start_offset} min, index {index})"
                )

        if models_started_immediately > 0:
            await _execute_bulk_rotation_sends_for_ready_models(group_id)

        logger.info(
            f"Bulk rotation {group_id} started: {models_started_immediately} immediate, "
            f"{len(model_ids) - models_started_immediately} staggered"
        )

    except Exception as e:
        logger.error(f"Error starting bulk rotation {group_id}: {e}")


async def _start_single_model_rotation(group_id: str, model_id: str) -> None:
    logger.info(f"Starting staggered model rotation: {model_id} in group {group_id}")

    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)

        await db.collection(COLLECTION_ROTATION).document(model_id).update({
            "enabled": True,
            "pending": False,
            "started_at": now,
        })

        await _execute_single_model_send(group_id, model_id)

    except Exception as e:
        logger.error(f"Error starting single model rotation {model_id}: {e}")


async def _execute_single_model_send(group_id: str, model_id: str) -> dict:
    logger.info(f"Executing send for model {model_id} in group {group_id}")

    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)

        rotation_doc = await db.collection(COLLECTION_ROTATION).document(model_id).get()
        if not rotation_doc.exists:
            logger.error(f"Rotation state not found for model {model_id}")
            return {"success": False, "error": "Rotation state not found"}

        rotation_data = rotation_doc.to_dict()

        if not rotation_data.get("enabled", False):
            logger.warning(f"Model {model_id} rotation is not enabled, skipping")
            return {"success": False, "error": "Rotation not enabled"}

        gif_queue = rotation_data.get("gif_queue", [])
        gif_queue_index = rotation_data.get("gif_queue_index", 0)
        captions = rotation_data.get("captions", [])
        recipient_type = rotation_data.get("recipient_type", "collection")
        collection_id = rotation_data.get("collection_id")
        test_user_id = rotation_data.get("test_user_id")
        auto_unsend_after_minutes = rotation_data.get("auto_unsend_after_minutes", 60)

        if gif_queue_index >= len(gif_queue):
            logger.info(f"Model {model_id} has completed all GIFs in queue")
            await _mark_model_rotation_completed(model_id, group_id)
            return {"success": True, "completed": True}

        current_gif_id = gif_queue[gif_queue_index]
        caption_index = gif_queue_index % len(captions) if captions else 0
        current_caption = captions[caption_index] if captions else ""

        session = await get_or_create_session(model_id)
        if not session:
            error_msg = f"Failed to authenticate model {model_id}"
            logger.error(error_msg)
            await _mark_model_rotation_error(model_id, error_msg)
            return {"success": False, "error": error_msg}

        auth = session["authed"]
        account_name = session.get("account_name", "Unknown")

        if rotation_data.get("last_sent_message_ids"):
            logger.info(f"Unsending previous messages for model {model_id}")
            from modules.mass_message import MassMessenger
            messenger = MassMessenger(auth)
            for msg_id in rotation_data["last_sent_message_ids"]:
                try:
                    await messenger.unsend_message(int(msg_id))
                except Exception as e:
                    logger.warning(f"Failed to unsend message {msg_id}: {e}")

        from modules.mass_message import Recipient
        recipients = []
        if recipient_type == "test_user" and test_user_id:
            test_user_id_str = str(test_user_id)
            if test_user_id_str.startswith('u'):
                test_user_id_str = test_user_id_str[1:]
            user_id_int = int(test_user_id_str)
            user = await auth.get_user(user_id_int)
            if user:
                recipients = [Recipient(
                    user_id=user_id_int,
                    username=user.username or f"user_{user_id_int}",
                    name=user.name or user.username or "Fan",
                )]
            else:
                logger.warning(f"Test user {user_id_int} not found, using fallback")
                recipients = [Recipient(user_id=user_id_int, name="Fan", username=f"user_{user_id_int}")]
        elif recipient_type == "collection" and collection_id:
            from modules.collection_list import CollectionsManager
            collections_mgr = CollectionsManager(auth)
            users = await collections_mgr.get_collection_users(collection_id, fetch_all=True)
            recipients = [Recipient(user_id=u["id"], name=u.get("name", ""), username=u.get("username", "")) for u in users]
            logger.info(f"Fetched {len(recipients)} recipients from collection {collection_id}")

        if not recipients:
            logger.warning(f"No recipients for model {model_id}")
            await rotation_doc.reference.update({
                "gif_queue_index": gif_queue_index + 1,
                "last_sent_at": now,
                "updated_at": now,
            })
            await _schedule_next_model_gif(group_id, model_id, auto_unsend_after_minutes)
            return {"success": True, "sent_count": 0}

        from modules.mass_message import MassMessenger
        messenger = MassMessenger(auth)

        results = await messenger.send_mass_message_parallel(
            recipients=recipients,
            message_template=current_caption,
            media_ids=[int(current_gif_id)],
            price=0,
            concurrent_sends=5,
            batch_delay=0.5,
        )

        success_count = sum(1 for r in results if r.success)
        sent_message_ids = [str(r.message_id) for r in results if r.success and r.message_id]

        await rotation_doc.reference.update({
            "gif_queue_index": gif_queue_index + 1,
            "last_sent_at": now,
            "last_sent_gif_id": current_gif_id,
            "last_sent_message_ids": sent_message_ids,
            "messages_sent": rotation_data.get("messages_sent", 0) + success_count,
            "updated_at": now,
        })

        await _update_bulk_group_counts(group_id)

        logger.info(
            f"Model {model_id}: Sent GIF {gif_queue_index + 1}/{len(gif_queue)} "
            f"to {success_count}/{len(recipients)} recipients"
        )

        if gif_queue_index + 1 >= len(gif_queue):
            logger.info(f"Model {model_id} completed all GIFs")
            await _mark_model_rotation_completed(model_id, group_id)
        else:
            await _schedule_next_model_gif(group_id, model_id, auto_unsend_after_minutes)

        return {"success": True, "sent_count": success_count, "model_id": model_id}

    except Exception as e:
        logger.error(f"Error executing send for model {model_id}: {e}")
        return {"success": False, "error": str(e)}


async def _schedule_next_model_gif(group_id: str, model_id: str, interval_minutes: int) -> None:
    scheduler = get_scheduler()
    next_time = datetime.now(timezone.utc) + timedelta(minutes=interval_minutes)
    job_id = f"model_next_{group_id}_{model_id}"

    scheduler.add_job(
        _execute_single_model_send,
        DateTrigger(run_date=next_time),
        args=[group_id, model_id],
        id=job_id,
        replace_existing=True,
    )

    logger.info(f"Scheduled next GIF for model {model_id} at {next_time.isoformat()}")


async def _mark_model_rotation_completed(model_id: str, group_id: str) -> None:
    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)

        await db.collection(COLLECTION_ROTATION).document(model_id).update({
            "enabled": False,
            "completed": True,
            "completed_at": now,
            "updated_at": now,
        })

        logger.info(f"Model {model_id} rotation marked as completed")

        await _check_bulk_group_completion(group_id)

    except Exception as e:
        logger.error(f"Error marking model {model_id} as completed: {e}")


async def _check_bulk_group_completion(group_id: str) -> None:
    try:
        db = get_firestore_client()

        group_doc = await db.collection(COLLECTION_BULK_GROUPS).document(group_id).get()
        if not group_doc.exists:
            return

        model_ids = group_doc.to_dict().get("model_ids", [])

        all_completed = True
        completed_count = 0

        for model_id in model_ids:
            state_doc = await db.collection(COLLECTION_ROTATION).document(model_id).get()
            if state_doc.exists:
                state_data = state_doc.to_dict()
                if state_data.get("completed", False):
                    completed_count += 1
                elif state_data.get("enabled", False) or state_data.get("pending", False):
                    all_completed = False

        logger.info(f"Bulk group {group_id}: {completed_count}/{len(model_ids)} models completed")

        if all_completed and completed_count == len(model_ids):
            now = datetime.now(timezone.utc)

            await group_doc.reference.update({
                "status": "completed",
                "completed_at": now,
            })

            scheduled_doc_ref = db.collection(COLLECTION_SCHEDULED).document(f"bulk_{group_id}")
            await scheduled_doc_ref.update({
                "status": MessageStatus.COMPLETED.value,
                "completed_at": now,
                "updated_at": now,
            })

            logger.info(f"Bulk rotation {group_id} COMPLETED - all {len(model_ids)} models finished")

    except Exception as e:
        logger.error(f"Error checking bulk group completion for {group_id}: {e}")


async def _update_bulk_group_counts(group_id: str) -> None:
    try:
        db = get_firestore_client()

        group_doc = await db.collection(COLLECTION_BULK_GROUPS).document(group_id).get()
        if not group_doc.exists:
            return

        model_ids = group_doc.to_dict().get("model_ids", [])

        total_success = 0
        total_sent = 0
        models_completed = 0

        for model_id in model_ids:
            state_doc = await db.collection(COLLECTION_ROTATION).document(model_id).get()
            if state_doc.exists:
                state_data = state_doc.to_dict()
                total_sent += state_data.get("messages_sent", 0)
                if state_data.get("completed", False):
                    models_completed += 1
                    total_success += 1

        scheduled_doc_ref = db.collection(COLLECTION_SCHEDULED).document(f"bulk_{group_id}")
        await scheduled_doc_ref.update({
            "success_count": models_completed,
            "failed_count": len(model_ids) - models_completed,
            "total_messages_sent": total_sent,
            "updated_at": datetime.now(timezone.utc),
        })

    except Exception as e:
        logger.error(f"Error updating bulk group counts for {group_id}: {e}")


async def _execute_bulk_rotation_sends_for_ready_models(group_id: str) -> None:
    try:
        db = get_firestore_client()

        query = (
            db.collection(COLLECTION_ROTATION)
            .where(filter=FieldFilter("bulk_group_id", "==", group_id))
            .where(filter=FieldFilter("enabled", "==", True))
        )

        docs = await query.get()

        if not docs:
            logger.warning(f"No enabled models found for bulk rotation {group_id}")
            return

        logger.info(f"Executing initial sends for {len(docs)} ready models in group {group_id}")

        async def safe_send(model_id: str) -> dict:
            try:
                return await _execute_single_model_send(group_id, model_id)
            except Exception as e:
                logger.error(f"Error in safe_send for {model_id}: {e}")
                return {"success": False, "error": str(e), "model_id": model_id}

        tasks = [safe_send(doc.id) for doc in docs]
        results = await asyncio.gather(*tasks)

        success_count = sum(1 for r in results if r.get("success"))
        logger.info(
            f"Initial bulk rotation sends for group {group_id}: "
            f"{success_count}/{len(results)} models successful"
        )

    except Exception as e:
        logger.error(f"Error executing bulk rotation sends for ready models {group_id}: {e}")


async def stop_bulk_rotation(group_id: str) -> dict:
    try:
        db = get_firestore_client()

        group_doc = await db.collection(COLLECTION_BULK_GROUPS).document(group_id).get()
        if not group_doc.exists:
            return {"success": False, "error": "Bulk group not found"}

        group_data = group_doc.to_dict()
        model_ids = group_data.get("model_ids", [])

        for model_id in model_ids:
            await stop_rotation(model_id)

        await group_doc.reference.update({
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc),
        })

        scheduler = get_scheduler()
        start_job_id = f"bulk_rotation_start_{group_id}"
        if scheduler.get_job(start_job_id):
            scheduler.remove_job(start_job_id)

        logger.info(f"Stopped bulk rotation {group_id} with {len(model_ids)} models")
        return {"success": True, "model_count": len(model_ids)}

    except Exception as e:
        logger.error(f"Error stopping bulk rotation {group_id}: {e}")
        return {"success": False, "error": str(e)}


async def get_bulk_rotation_status(group_id: str) -> Optional[dict]:
    try:
        db = get_firestore_client()

        group_doc = await db.collection(COLLECTION_BULK_GROUPS).document(group_id).get()
        if not group_doc.exists:
            return None

        group_data = group_doc.to_dict()
        model_ids = group_data.get("model_ids", [])

        model_statuses = []
        for model_id in model_ids:
            rot_doc = await db.collection(COLLECTION_ROTATION).document(model_id).get()
            if rot_doc.exists:
                model_statuses.append({
                    "model_id": model_id,
                    **rot_doc.to_dict()
                })

        return {
            "group_id": group_id,
            "status": group_data.get("status"),
            "approval_status": group_data.get("approval_status"),
            "model_count": len(model_ids),
            "collection_name": group_data.get("collection_name"),
            "vault_folder_name": group_data.get("vault_folder_name"),
            "gif_count": group_data.get("gif_count"),
            "end_at": group_data.get("end_at"),
            "models": model_statuses,
        }

    except Exception as e:
        logger.error(f"Error getting bulk rotation status for {group_id}: {e}")
        return None


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
