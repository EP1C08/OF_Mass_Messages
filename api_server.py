"""
Local FastAPI server for Collections API and Scheduled Messages API.

Provides REST endpoints for managing OnlyFans collections/lists and scheduled mass messages.
Run with: uvicorn api_server:app --reload --port 8001
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Union

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from modules import authenticate_from_db, close_session, CollectionsManager, list_models_from_db
from modules.scheduled_message_service import ScheduledMessageService
from modules.scheduled_message_models import (
    CreateScheduledMessageRequest,
    UpdateScheduledMessageRequest,
    ScheduledMessageResponse,
    SendResultResponse,
    ActiveMessageResponse,
    ScheduleStatsResponse,
    TestExecuteRequest,
    TestExecuteResponse,
    MessageStatus,
    ApprovalStatus,
    BatchIdsRequest,
    BatchResultResponse,
)
from modules.scheduler import (
    start_scheduler,
    stop_scheduler,
    schedule_message_job,
    cancel_message_job,
    get_scheduled_jobs,
    get_scheduler,
    start_rotation,
    stop_rotation,
    schedule_rotation_start_job,
)
from modules.firebase_client import get_firestore_client

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cache for authenticated sessions
_auth_cache: Dict[str, dict] = {}
_auth_lock = asyncio.Lock()


class CollectionResponse(BaseModel):
    id: Union[int, str]  # Can be int for custom lists or string like "fans", "following"
    name: str
    usersCount: int
    type: Optional[str] = None


class CollectionUserResponse(BaseModel):
    id: int
    username: str
    name: Optional[str] = None
    avatar: Optional[str] = None


class ModelResponse(BaseModel):
    model_id: str
    username: str
    authenticated: bool


async def get_authenticated_model(model_id: str) -> Optional[dict]:
    """Get or create authenticated session for a model."""
    async with _auth_lock:
        # Check cache first
        if model_id in _auth_cache:
            cached = _auth_cache[model_id]
            if cached.get("authed"):
                return cached

        # Authenticate
        logger.info(f"Authenticating model {model_id}...")
        results = await authenticate_from_db(model_id=model_id)

        if results and results[0].get("success") and results[0].get("authed"):
            _auth_cache[model_id] = results[0]
            logger.info(f"Model {model_id} authenticated successfully")
            return results[0]

        logger.warning(f"Failed to authenticate model {model_id}")
        return None


async def close_all_sessions():
    """Close all cached sessions."""
    async with _auth_lock:
        for model_id, data in _auth_cache.items():
            if data.get("authed"):
                try:
                    await close_session(data["authed"])
                    logger.info(f"Closed session for {model_id}")
                except Exception as e:
                    logger.error(f"Error closing session for {model_id}: {e}")
        _auth_cache.clear()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    logger.info("Starting Collections API server...")

    # Start the scheduler for scheduled messages
    try:
        await start_scheduler()
        logger.info("Scheduler started successfully")
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")

    yield

    logger.info("Shutting down...")

    # Stop the scheduler
    try:
        await stop_scheduler()
        logger.info("Scheduler stopped")
    except Exception as e:
        logger.error(f"Error stopping scheduler: {e}")

    # Close all auth sessions
    await close_all_sessions()


app = FastAPI(
    title="OF Collections API",
    description="Local API for managing OnlyFans collections/lists",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "cached_sessions": len(_auth_cache)}


@app.get("/models", response_model=List[ModelResponse])
async def get_models():
    """Get all available models from database.

    This is a fast operation that just reads the database
    without authenticating any accounts.
    """
    try:
        # Fast listing - no authentication needed
        models = await list_models_from_db()

        return [
            ModelResponse(
                model_id=m["model_id"],
                username=m["username"],
                authenticated=m["authenticated"]
            )
            for m in models
        ]
    except Exception as e:
        logger.error(f"Error getting models: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/collections", response_model=List[CollectionResponse])
async def get_collections(
    model_id: str = Query(..., description="OnlyFans model/creator ID")
):
    """Get all collections/lists for a model."""
    auth_data = await get_authenticated_model(model_id)

    if not auth_data or not auth_data.get("authed"):
        raise HTTPException(
            status_code=401,
            detail=f"Failed to authenticate model {model_id}"
        )

    try:
        manager = CollectionsManager(auth_data["authed"])
        collections = await manager.get_all_collections()

        return [
            CollectionResponse(
                id=c.get("id", 0),
                name=c.get("name", "Unnamed"),
                usersCount=c.get("usersCount", 0),
                type=c.get("type")
            )
            for c in collections
        ]
    except Exception as e:
        logger.error(f"Error getting collections for {model_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/collections/{list_id}", response_model=CollectionResponse)
async def get_collection(
    list_id: str,  # Can be int or string like "fans"
    model_id: str = Query(..., description="OnlyFans model/creator ID")
):
    """Get a specific collection by ID."""
    auth_data = await get_authenticated_model(model_id)

    if not auth_data or not auth_data.get("authed"):
        raise HTTPException(
            status_code=401,
            detail=f"Failed to authenticate model {model_id}"
        )

    try:
        # Convert to int if it's a numeric string
        parsed_id: Union[int, str] = int(list_id) if list_id.isdigit() else list_id
        manager = CollectionsManager(auth_data["authed"])
        collection = await manager.get_collection_by_id(parsed_id)

        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")

        return CollectionResponse(
            id=collection.get("id", 0),
            name=collection.get("name", "Unnamed"),
            usersCount=collection.get("usersCount", 0),
            type=collection.get("type")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting collection {list_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class PaginatedUsersResponse(BaseModel):
    users: List[CollectionUserResponse]
    total: int  # Total count from collection metadata
    limit: int
    offset: int
    has_more: bool


@app.get("/collections/{list_id}/users")
async def get_collection_users(
    list_id: str,  # Can be int or string like "fans"
    model_id: str = Query(..., description="OnlyFans model/creator ID"),
    limit: int = Query(20, ge=1, le=100, description="Number of users per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """Get users in a collection with pagination."""
    auth_data = await get_authenticated_model(model_id)

    if not auth_data or not auth_data.get("authed"):
        raise HTTPException(
            status_code=401,
            detail=f"Failed to authenticate model {model_id}"
        )

    try:
        # Convert to int if it's a numeric string
        parsed_id: Union[int, str] = int(list_id) if list_id.isdigit() else list_id
        manager = CollectionsManager(auth_data["authed"])

        # Get collection metadata for total count
        collection = await manager.get_collection_by_id(parsed_id)
        total_count = collection.get("usersCount", 0) if collection else 0

        # Fetch only one page of users (fetch_all=False)
        users = await manager.get_collection_users(
            parsed_id,
            limit=limit,
            offset=offset,
            fetch_all=False
        )

        user_responses = [
            CollectionUserResponse(
                id=u.get("id", 0),
                username=u.get("username", "Unknown"),
                name=u.get("name"),
                avatar=u.get("avatar")
            )
            for u in users
        ]

        return PaginatedUsersResponse(
            users=user_responses,
            total=total_count,
            limit=limit,
            offset=offset,
            has_more=(offset + len(users)) < total_count
        )
    except Exception as e:
        logger.error(f"Error getting users for collection {list_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CreateCollectionRequest(BaseModel):
    name: str
    model_id: str


@app.post("/collections", response_model=CollectionResponse)
async def create_collection(request: CreateCollectionRequest):
    """Create a new collection."""
    auth_data = await get_authenticated_model(request.model_id)

    if not auth_data or not auth_data.get("authed"):
        raise HTTPException(
            status_code=401,
            detail=f"Failed to authenticate model {request.model_id}"
        )

    try:
        manager = CollectionsManager(auth_data["authed"])
        result = await manager.create_collection(request.name)

        if not result:
            raise HTTPException(status_code=400, detail="Failed to create collection")

        return CollectionResponse(
            id=result.get("id", 0),
            name=result.get("name", request.name),
            usersCount=0,
            type="custom"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/collections/{list_id}")
async def delete_collection(
    list_id: str,  # Can be int or string like "fans"
    model_id: str = Query(..., description="OnlyFans model/creator ID")
):
    """Delete a collection."""
    auth_data = await get_authenticated_model(model_id)

    if not auth_data or not auth_data.get("authed"):
        raise HTTPException(
            status_code=401,
            detail=f"Failed to authenticate model {model_id}"
        )

    try:
        # Convert to int if it's a numeric string
        parsed_id: Union[int, str] = int(list_id) if list_id.isdigit() else list_id
        manager = CollectionsManager(auth_data["authed"])
        success = await manager.delete_collection(parsed_id)

        if not success:
            raise HTTPException(status_code=400, detail="Failed to delete collection")

        return {"success": True, "message": f"Collection {list_id} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting collection {list_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class AddUserRequest(BaseModel):
    user_id: int
    model_id: str


@app.post("/collections/{list_id}/users")
async def add_user_to_collection(list_id: str, request: AddUserRequest):
    """Add a user to a collection."""
    auth_data = await get_authenticated_model(request.model_id)

    if not auth_data or not auth_data.get("authed"):
        raise HTTPException(
            status_code=401,
            detail=f"Failed to authenticate model {request.model_id}"
        )

    try:
        # Convert to int if it's a numeric string
        parsed_id: Union[int, str] = int(list_id) if list_id.isdigit() else list_id
        manager = CollectionsManager(auth_data["authed"])
        success = await manager.add_user_to_collection(request.user_id, parsed_id)

        if not success:
            raise HTTPException(status_code=400, detail="Failed to add user to collection")

        return {"success": True, "message": f"User {request.user_id} added to collection {list_id}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding user to collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/collections/{list_id}/users/{user_id}")
async def remove_user_from_collection(
    list_id: str,  # Can be int or string like "fans"
    user_id: int,
    model_id: str = Query(..., description="OnlyFans model/creator ID")
):
    """Remove a user from a collection."""
    auth_data = await get_authenticated_model(model_id)

    if not auth_data or not auth_data.get("authed"):
        raise HTTPException(
            status_code=401,
            detail=f"Failed to authenticate model {model_id}"
        )

    try:
        # Convert to int if it's a numeric string
        parsed_id: Union[int, str] = int(list_id) if list_id.isdigit() else list_id
        manager = CollectionsManager(auth_data["authed"])
        success = await manager.remove_user_from_collection(user_id, parsed_id)

        if not success:
            raise HTTPException(status_code=400, detail="Failed to remove user from collection")

        return {"success": True, "message": f"User {user_id} removed from collection {list_id}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing user from collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/clear-cache")
async def clear_auth_cache():
    """Clear the authentication cache and close all sessions."""
    await close_all_sessions()
    return {"success": True, "message": "Cache cleared"}


# ============================================================================
# Captions API
# ============================================================================

CAPTIONS_FILE = Path(__file__).parent / "data" / "captions.json"


class CaptionTemplate(BaseModel):
    id: str
    content: str
    type: str  # 'ppv' or 'free'
    suggestedPrice: Optional[int] = None
    priceTier: Optional[str] = None  # 'low', 'medium', 'high'
    tags: Optional[List[str]] = None
    useCount: Optional[int] = 0
    conversionRate: Optional[float] = None
    totalRevenue: Optional[float] = None
    rpm: Optional[float] = None  # Revenue per thousand messages


class CreateCaptionRequest(BaseModel):
    content: str
    type: str
    suggestedPrice: Optional[int] = None
    priceTier: Optional[str] = None
    tags: Optional[List[str]] = None


class UpdateCaptionRequest(BaseModel):
    content: Optional[str] = None
    type: Optional[str] = None
    suggestedPrice: Optional[int] = None
    priceTier: Optional[str] = None
    tags: Optional[List[str]] = None


def load_captions() -> List[dict]:
    """Load captions from JSON file."""
    if not CAPTIONS_FILE.exists():
        return []
    try:
        with open(CAPTIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Error loading captions: {e}")
        return []


def save_captions(captions: List[dict]) -> bool:
    """Save captions to JSON file."""
    try:
        CAPTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CAPTIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(captions, f, indent=2, ensure_ascii=False)
        return True
    except IOError as e:
        logger.error(f"Error saving captions: {e}")
        return False


@app.get("/captions", response_model=List[CaptionTemplate])
async def get_captions():
    """Get all caption templates."""
    captions = load_captions()
    return captions


@app.get("/captions/{caption_id}", response_model=CaptionTemplate)
async def get_caption(caption_id: str):
    """Get a specific caption by ID."""
    captions = load_captions()
    for caption in captions:
        if caption.get("id") == caption_id:
            return caption
    raise HTTPException(status_code=404, detail="Caption not found")


@app.post("/captions", response_model=CaptionTemplate)
async def create_caption(request: CreateCaptionRequest):
    """Create a new caption."""
    captions = load_captions()

    # Generate new ID
    max_id = 0
    for c in captions:
        try:
            max_id = max(max_id, int(c.get("id", 0)))
        except ValueError:
            pass
    new_id = str(max_id + 1)

    new_caption = {
        "id": new_id,
        "content": request.content,
        "type": request.type,
        "suggestedPrice": request.suggestedPrice,
        "priceTier": request.priceTier,
        "tags": request.tags or [],
        "useCount": 0,
        "conversionRate": None,
        "totalRevenue": None,
        "rpm": None
    }

    captions.append(new_caption)
    if not save_captions(captions):
        raise HTTPException(status_code=500, detail="Failed to save caption")

    return new_caption


@app.put("/captions/{caption_id}", response_model=CaptionTemplate)
async def update_caption(caption_id: str, request: UpdateCaptionRequest):
    """Update an existing caption."""
    captions = load_captions()

    for i, caption in enumerate(captions):
        if caption.get("id") == caption_id:
            if request.content is not None:
                caption["content"] = request.content
            if request.type is not None:
                caption["type"] = request.type
            if request.suggestedPrice is not None:
                caption["suggestedPrice"] = request.suggestedPrice
            if request.priceTier is not None:
                caption["priceTier"] = request.priceTier
            if request.tags is not None:
                caption["tags"] = request.tags

            captions[i] = caption
            if not save_captions(captions):
                raise HTTPException(status_code=500, detail="Failed to save caption")
            return caption

    raise HTTPException(status_code=404, detail="Caption not found")


@app.delete("/captions/{caption_id}")
async def delete_caption(caption_id: str):
    """Delete a caption."""
    captions = load_captions()

    for i, caption in enumerate(captions):
        if caption.get("id") == caption_id:
            captions.pop(i)
            if not save_captions(captions):
                raise HTTPException(status_code=500, detail="Failed to save captions")
            return {"success": True, "message": f"Caption {caption_id} deleted"}

    raise HTTPException(status_code=404, detail="Caption not found")


@app.post("/captions/{caption_id}/increment-use")
async def increment_caption_use(caption_id: str):
    """Increment the use count of a caption."""
    captions = load_captions()

    for i, caption in enumerate(captions):
        if caption.get("id") == caption_id:
            caption["useCount"] = caption.get("useCount", 0) + 1
            captions[i] = caption
            if not save_captions(captions):
                raise HTTPException(status_code=500, detail="Failed to save caption")
            return {"success": True, "useCount": caption["useCount"]}

    raise HTTPException(status_code=404, detail="Caption not found")


# ============================================================================
# Scheduled Messages API
# ============================================================================

@app.post("/scheduled-messages", response_model=ScheduledMessageResponse)
async def create_scheduled_message(request: CreateScheduledMessageRequest):
    """Create a new scheduled message."""
    try:
        service = ScheduledMessageService()
        message = await service.create_scheduled_message(request)
        logger.info(f"Created scheduled message {message.id}")
        return message
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating scheduled message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/scheduled-messages", response_model=List[ScheduledMessageResponse])
async def list_scheduled_messages(
    account_id: Optional[str] = Query(None, alias="accountId"),
    status: Optional[str] = None,
    approval_status: Optional[str] = Query(None, alias="approvalStatus"),
    from_date: Optional[str] = Query(None, alias="fromDate"),
    to_date: Optional[str] = Query(None, alias="toDate"),
    limit: int = Query(100, ge=1, le=500),
):
    """List scheduled messages with filters."""
    try:
        service = ScheduledMessageService()

        # Parse enums
        status_enum = MessageStatus(status) if status else None
        approval_enum = ApprovalStatus(approval_status) if approval_status else None

        # Parse dates
        from_dt = None
        to_dt = None
        if from_date:
            from_dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
        if to_date:
            to_dt = datetime.fromisoformat(to_date.replace("Z", "+00:00"))

        messages = await service.list_scheduled_messages(
            account_id=account_id,
            status=status_enum,
            approval_status=approval_enum,
            from_date=from_dt,
            to_date=to_dt,
            limit=limit,
        )
        return messages
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error listing scheduled messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/scheduled-messages/{message_id}", response_model=ScheduledMessageResponse)
async def get_scheduled_message(message_id: str):
    """Get a scheduled message by ID."""
    service = ScheduledMessageService()
    message = await service.get_scheduled_message(message_id)

    if not message:
        raise HTTPException(status_code=404, detail="Scheduled message not found")

    return message


@app.put("/scheduled-messages/{message_id}", response_model=ScheduledMessageResponse)
async def update_scheduled_message(message_id: str, request: UpdateScheduledMessageRequest):
    """Update a scheduled message (only if queued)."""
    try:
        service = ScheduledMessageService()
        message = await service.update_scheduled_message(message_id, request)

        if not message:
            raise HTTPException(status_code=404, detail="Scheduled message not found")

        # Reschedule job if time changed
        if request.scheduled_at:
            await schedule_message_job(message_id, request.scheduled_at)

        return message
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating scheduled message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/scheduled-messages/{message_id}")
async def delete_scheduled_message(message_id: str):
    """Delete a scheduled message.

    Regular messages can only be deleted if queued or cancelled.
    Rotation messages can be deleted in any non-completed state.
    """
    try:
        db = get_firestore_client()
        doc = await db.collection("scheduled_messages").document(message_id).get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Scheduled message not found")

        data = doc.to_dict()
        is_rotation = data.get("is_rotation", False)
        account_id = data.get("account_id")
        status = data.get("status")

        # Rotations can be deleted in any state (including completed for cleanup)
        # Regular messages can only be deleted if queued or cancelled
        if not is_rotation:
            if status not in ["queued", "cancelled"]:
                raise HTTPException(status_code=400, detail="Can only delete queued or cancelled messages")

        # Delete the document directly
        await doc.reference.delete()
        logger.info(f"Deleted scheduled message {message_id}")

        # Cancel the scheduled job
        await cancel_message_job(message_id)

        # If it's a rotation, also clean up the rotation state and cancel rotation jobs
        if is_rotation and account_id:
            await stop_rotation(account_id)
            # Cancel rotation start job if scheduled
            scheduler = get_scheduler()
            rotation_start_job_id = f"rotation_start_{account_id}"
            if scheduler.get_job(rotation_start_job_id):
                scheduler.remove_job(rotation_start_job_id)
                logger.info(f"Cancelled rotation start job: {rotation_start_job_id}")

        return {"success": True, "message": f"Scheduled message {message_id} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting scheduled message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/scheduled-messages/{message_id}/approve", response_model=ScheduledMessageResponse)
async def approve_scheduled_message(message_id: str):
    """Approve a pending scheduled message."""
    try:
        service = ScheduledMessageService()
        message = await service.approve_message(message_id)

        if not message:
            raise HTTPException(status_code=404, detail="Scheduled message not found")

        # Schedule the job now that it's approved
        scheduled_at = datetime.fromisoformat(message.scheduled_at.replace("Z", "+00:00"))
        await schedule_message_job(message_id, scheduled_at)

        return message
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error approving scheduled message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/scheduled-messages/{message_id}/cancel")
async def cancel_scheduled_message(message_id: str):
    """Cancel a scheduled message.

    Regular messages can only be cancelled if queued.
    Rotation messages can be cancelled in queued or processing state.
    """
    try:
        db = get_firestore_client()
        doc = await db.collection("scheduled_messages").document(message_id).get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Scheduled message not found")

        data = doc.to_dict()
        is_rotation = data.get("is_rotation", False)
        account_id = data.get("account_id")
        status = data.get("status")

        # Rotations can be cancelled in queued or processing state
        # Regular messages can only be cancelled if queued
        if is_rotation:
            if status not in ["queued", "processing"]:
                raise HTTPException(status_code=400, detail=f"Cannot cancel rotation in {status} state")
        else:
            if status != "queued":
                raise HTTPException(status_code=400, detail="Can only cancel queued messages")

        # Update status to cancelled
        await doc.reference.update({
            "status": "cancelled",
            "updated_at": datetime.now(timezone.utc),
        })
        logger.info(f"Cancelled scheduled message {message_id}")

        # Cancel the scheduled job
        await cancel_message_job(message_id)

        # If it's a rotation, also stop the rotation
        if is_rotation and account_id:
            await stop_rotation(account_id)
            # Cancel rotation start job if scheduled
            scheduler = get_scheduler()
            rotation_start_job_id = f"rotation_start_{account_id}"
            if scheduler.get_job(rotation_start_job_id):
                scheduler.remove_job(rotation_start_job_id)
                logger.info(f"Cancelled rotation start job: {rotation_start_job_id}")

        # Return updated document
        updated_doc = await doc.reference.get()
        return updated_doc.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling scheduled message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/scheduled-messages/{message_id}/results", response_model=List[SendResultResponse])
async def get_message_results(
    message_id: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Get send results for a scheduled message."""
    try:
        service = ScheduledMessageService()
        results = await service.get_message_results(message_id, limit=limit, offset=offset)
        return results
    except Exception as e:
        logger.error(f"Error getting message results: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Active Message Endpoints

@app.get("/accounts/{account_id}/active-message", response_model=Optional[ActiveMessageResponse])
async def get_active_message(account_id: str):
    """Get the currently active message for an account."""
    service = ScheduledMessageService()
    return await service.get_active_message(account_id)


@app.post("/accounts/{account_id}/unsend-active")
async def unsend_active_message(account_id: str):
    """Unsend the currently active message for an account."""
    try:
        service = ScheduledMessageService()
        success = await service.unsend_active_message(account_id)

        if not success:
            raise HTTPException(status_code=404, detail="No active message found")

        return {"success": True, "message": "Active message unsent"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error unsending active message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Batch Operations

@app.post("/scheduled-messages/batch/approve", response_model=BatchResultResponse)
async def batch_approve_messages(request: BatchIdsRequest):
    """Approve multiple scheduled messages."""
    service = ScheduledMessageService()
    processed = 0
    failed = 0
    errors = []

    for message_id in request.ids:
        try:
            message = await service.approve_message(message_id)
            if message:
                scheduled_at = datetime.fromisoformat(message.scheduled_at.replace("Z", "+00:00"))
                await schedule_message_job(message_id, scheduled_at)
                processed += 1
            else:
                failed += 1
                errors.append(f"{message_id}: not found")
        except ValueError as e:
            failed += 1
            errors.append(f"{message_id}: {str(e)}")
        except Exception as e:
            failed += 1
            errors.append(f"{message_id}: {str(e)}")

    return BatchResultResponse(
        success=failed == 0,
        processed=processed,
        failed=failed,
        errors=errors if errors else None,
    )


@app.post("/scheduled-messages/batch/delete", response_model=BatchResultResponse)
async def batch_delete_messages(request: BatchIdsRequest):
    """Delete multiple scheduled messages."""
    service = ScheduledMessageService()
    processed = 0
    failed = 0
    errors = []

    for message_id in request.ids:
        try:
            success = await service.delete_scheduled_message(message_id)
            if success:
                await cancel_message_job(message_id)
                processed += 1
            else:
                failed += 1
                errors.append(f"{message_id}: not found")
        except ValueError as e:
            failed += 1
            errors.append(f"{message_id}: {str(e)}")
        except Exception as e:
            failed += 1
            errors.append(f"{message_id}: {str(e)}")

    return BatchResultResponse(
        success=failed == 0,
        processed=processed,
        failed=failed,
        errors=errors if errors else None,
    )


# Test Execution Endpoint

@app.post("/scheduled-messages/test", response_model=TestExecuteResponse)
async def test_execute_message(request: TestExecuteRequest):
    """Test message sending to a single user.

    This endpoint is for testing the send/unsend flow with a specific user
    before running scheduled messages on real collections.

    - Optionally unsends the previous active message
    - Sends a new message to the specified test user
    - Logs all steps to a JSON file for debugging
    - Supports dry_run mode to simulate without actual API calls
    """
    service = ScheduledMessageService()
    return await service.test_execute(request)


# Stats Endpoint

@app.get("/scheduled-messages-stats", response_model=ScheduleStatsResponse)
async def get_schedule_stats(account_id: Optional[str] = Query(None, alias="accountId")):
    """Get statistics about scheduled messages."""
    try:
        from google.cloud.firestore_v1 import FieldFilter

        db = get_firestore_client()
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        base_query = db.collection("scheduled_messages")
        if account_id:
            base_query = base_query.where(filter=FieldFilter("account_id", "==", account_id))

        # Get all docs for counting
        all_docs = await base_query.get()

        stats = {
            "total_scheduled": 0,
            "pending_approval": 0,
            "queued": 0,
            "processing": 0,
            "completed_today": 0,
            "failed_today": 0,
        }

        for doc in all_docs:
            data = doc.to_dict()
            stats["total_scheduled"] += 1

            if data["status"] == MessageStatus.QUEUED.value:
                stats["queued"] += 1
                if data["approval_status"] == ApprovalStatus.PENDING.value:
                    stats["pending_approval"] += 1
            elif data["status"] == MessageStatus.PROCESSING.value:
                stats["processing"] += 1
            elif data["status"] == MessageStatus.COMPLETED.value:
                completed_at = data.get("completed_at")
                if completed_at:
                    if hasattr(completed_at, 'timestamp'):
                        completed_dt = datetime.fromtimestamp(completed_at.timestamp(), tz=timezone.utc)
                    else:
                        completed_dt = completed_at
                    if completed_dt >= today_start:
                        stats["completed_today"] += 1
            elif data["status"] == MessageStatus.FAILED.value:
                updated_at = data.get("updated_at")
                if updated_at:
                    if hasattr(updated_at, 'timestamp'):
                        updated_dt = datetime.fromtimestamp(updated_at.timestamp(), tz=timezone.utc)
                    else:
                        updated_dt = updated_at
                    if updated_dt >= today_start:
                        stats["failed_today"] += 1

        return ScheduleStatsResponse(**stats)
    except Exception as e:
        logger.error(f"Error getting schedule stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Scheduler Debug Endpoint

@app.get("/scheduler/jobs")
async def get_scheduler_jobs():
    """Get list of currently scheduled jobs (debug endpoint)."""
    return {"jobs": get_scheduled_jobs()}


# ============================================================================
# Caption Rotation API
# ============================================================================

class StartRotationRequest(BaseModel):
    """Request to start caption rotation for an account."""
    account_id: str
    test_user_id: str  # e.g., "u528621767"
    captions: List[str]  # e.g., ["HI {name}", "I miss you {name}", "do you miss me {name}"]
    auto_unsend_after_minutes: int = 1  # Default 1 minute for testing
    total_cycles: int = 0  # How many times to cycle through all captions (0 = unlimited)
    end_at: Optional[str] = None  # ISO timestamp when to stop rotation (e.g., end of day)
    run_duration_hours: Optional[int] = None  # Alternative: run for X hours
    start_at: Optional[str] = None  # ISO timestamp when rotation should START (scheduled start)


@app.post("/rotation/start")
async def api_start_rotation(request: StartRotationRequest):
    """Start or schedule caption/GIF rotation for an account.

    This will:
    1. If start_at is provided, schedule the rotation to start at that time
    2. Otherwise, start immediately:
       - Send the first message with caption[0] + random GIF
       - Wait for auto_unsend_after_minutes
       - Unsend and send the next caption with a new random GIF
    3. Repeat until:
       - All cycles completed (if total_cycles > 0), OR
       - end_at time reached, OR
       - run_duration_hours elapsed, OR
       - Manually stopped via /rotation/stop
    """
    try:
        from modules.scheduler import (
            _send_rotated_message,
            _get_rotation_state,
            schedule_rotation_start_job,
        )
        import uuid

        # Parse timestamps
        end_at_dt = None
        if request.end_at:
            end_at_dt = datetime.fromisoformat(request.end_at.replace("Z", "+00:00"))

        start_at_dt = None
        if request.start_at:
            start_at_dt = datetime.fromisoformat(request.start_at.replace("Z", "+00:00"))

        now = datetime.now(timezone.utc)

        # First, create the rotation state (but with enabled=False if scheduled for later)
        is_scheduled = start_at_dt and start_at_dt > now

        result = await start_rotation(
            account_id=request.account_id,
            test_user_id=request.test_user_id,
            captions=request.captions,
            auto_unsend_after_minutes=request.auto_unsend_after_minutes,
            total_cycles=request.total_cycles,
            end_at=end_at_dt,
            run_duration_hours=request.run_duration_hours,
            start_at=start_at_dt,  # Pass scheduled start time
        )

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to start rotation"))

        cycle_info = f"{request.total_cycles} cycle(s)" if request.total_cycles > 0 else "unlimited cycles"
        total_msgs = len(request.captions) * request.total_cycles if request.total_cycles > 0 else None

        # Get account username for display
        auth_data = await get_authenticated_model(request.account_id)
        account_username = auth_data.get("account_name", "Unknown") if auth_data else "Unknown"

        # Create a scheduled_messages entry so it appears in the UI
        db = get_firestore_client()
        message_id = f"rotation_{request.account_id}_{uuid.uuid4().hex[:8]}"
        scheduled_at = start_at_dt if is_scheduled else now

        # Build message content summary for display
        captions_preview = " | ".join(request.captions[:3])
        if len(request.captions) > 3:
            captions_preview += f" (+{len(request.captions) - 3} more)"

        scheduled_msg_doc = {
            "id": message_id,
            "account_id": request.account_id,
            "account_username": account_username,
            "message_content": f"[ROTATION] {captions_preview}",
            "media_ids": None,  # GIFs are selected randomly
            "price": 0,  # Rotation messages are free
            "recipient_type": "test_user",
            "recipient_count": 1,
            "test_user_id": request.test_user_id,
            "scheduled_at": scheduled_at,
            "status": "queued",
            "approval_status": "pending",  # Requires approval before starting
            "auto_unsend_previous": True,
            "auto_unsend_after_minutes": request.auto_unsend_after_minutes,
            "created_at": now,
            "updated_at": now,
            # Rotation-specific fields
            "is_rotation": True,
            "rotation_captions": request.captions,
            "rotation_duration_hours": request.run_duration_hours,
            "rotation_end_at": result.get("end_at"),
        }

        await db.collection("scheduled_messages").document(message_id).set(scheduled_msg_doc)
        logger.info(f"Created scheduled_messages entry for rotation: {message_id}")

        # Rotation now requires approval before starting
        # The job will be scheduled when the rotation is approved via /rotation/approve/{message_id}
        return {
            "success": True,
            "message": f"Rotation created with {len(request.captions)} captions, {cycle_info}. PENDING APPROVAL.",
            "scheduled": is_scheduled,
            "start_at": start_at_dt.isoformat() if start_at_dt else None,
            "total_messages": total_msgs,
            "auto_unsend_after_minutes": request.auto_unsend_after_minutes,
            "end_at": result.get("end_at"),
            "scheduled_message_id": message_id,
            "approval_status": "pending",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting rotation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rotation/stop/{account_id}")
async def api_stop_rotation(account_id: str):
    """Stop caption/GIF rotation for an account.

    This will immediately stop the rotation and cancel any pending auto-unsend jobs.
    """
    try:
        result = await stop_rotation(account_id)

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to stop rotation"))

        # Also update any scheduled_messages entries for this rotation to "cancelled"
        db = get_firestore_client()
        from google.cloud.firestore_v1 import FieldFilter

        # Find rotation messages for this account
        query = (
            db.collection("scheduled_messages")
            .where(filter=FieldFilter("account_id", "==", account_id))
            .where(filter=FieldFilter("is_rotation", "==", True))
            .where(filter=FieldFilter("status", "in", ["queued", "processing"]))
        )
        docs = await query.get()

        for doc in docs:
            await doc.reference.update({
                "status": "cancelled",
                "updated_at": datetime.now(timezone.utc),
            })
            logger.info(f"Cancelled scheduled_messages entry: {doc.id}")

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping rotation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rotation/approve/{message_id}")
async def api_approve_rotation(message_id: str):
    """Approve a pending rotation to start.

    This will:
    1. Update the approval_status to 'approved'
    2. If scheduled for future: schedule the rotation start job
    3. If immediate: start the rotation now
    """
    try:
        from modules.scheduler import (
            _send_rotated_message,
            _get_rotation_state,
            schedule_rotation_start_job,
        )

        db = get_firestore_client()

        # Get the scheduled message document
        doc = await db.collection("scheduled_messages").document(message_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Rotation not found")

        data = doc.to_dict()

        # Verify it's a rotation
        if not data.get("is_rotation"):
            raise HTTPException(status_code=400, detail="This is not a rotation message")

        # Verify it's pending approval
        if data.get("approval_status") != "pending":
            raise HTTPException(status_code=400, detail=f"Rotation is already {data.get('approval_status')}")

        now = datetime.now(timezone.utc)
        account_id = data.get("account_id")

        # Parse scheduled_at time
        scheduled_at = data.get("scheduled_at")
        if hasattr(scheduled_at, 'timestamp'):
            scheduled_at_dt = datetime.fromtimestamp(scheduled_at.timestamp(), tz=timezone.utc)
        elif isinstance(scheduled_at, datetime):
            scheduled_at_dt = scheduled_at if scheduled_at.tzinfo else scheduled_at.replace(tzinfo=timezone.utc)
        else:
            scheduled_at_dt = now  # Default to now if no scheduled time

        # Update approval status
        await doc.reference.update({
            "approval_status": "approved",
            "approved_at": now,
            "updated_at": now,
        })

        is_future = scheduled_at_dt > now

        if is_future:
            # Schedule the rotation to start at the specified time
            await schedule_rotation_start_job(account_id, scheduled_at_dt)

            logger.info(f"Approved rotation {message_id}, scheduled to start at {scheduled_at_dt.isoformat()}")
            return {
                "success": True,
                "message": f"Rotation approved and scheduled to start at {scheduled_at_dt.isoformat()}",
                "scheduled": True,
                "start_at": scheduled_at_dt.isoformat(),
            }
        else:
            # Start immediately
            # Update rotation state to enabled
            await db.collection("rotation_state").document(account_id).update({
                "enabled": True,
                "pending": False,
                "started_at": now,
            })

            # Get the rotation state and send first message
            rotation_state = await _get_rotation_state(account_id)
            if rotation_state:
                await _send_rotated_message(account_id, rotation_state)

                # Update status to processing
                await doc.reference.update({
                    "status": "processing",
                    "updated_at": now,
                })

                logger.info(f"Approved rotation {message_id}, started immediately")
                return {
                    "success": True,
                    "message": "Rotation approved and started immediately",
                    "scheduled": False,
                }
            else:
                raise HTTPException(status_code=500, detail="Failed to get rotation state")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving rotation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rotation/status/{account_id}")
async def get_rotation_status(account_id: str):
    """Get the current rotation status for an account."""
    try:
        db = get_firestore_client()
        doc = await db.collection("rotation_state").document(account_id).get()

        if not doc.exists:
            return {"enabled": False, "message": "No rotation configured for this account"}

        data = doc.to_dict()
        total_cycles = data.get("total_cycles", 0)
        captions = data.get("captions", [])

        # Calculate total messages only if cycles are limited
        total_messages = total_cycles * len(captions) if total_cycles > 0 else None

        # Handle end_at timestamp
        end_at = data.get("end_at")
        end_at_str = None
        if end_at:
            if hasattr(end_at, 'isoformat'):
                end_at_str = end_at.isoformat()
            elif hasattr(end_at, 'timestamp'):
                end_at_str = datetime.fromtimestamp(end_at.timestamp(), tz=timezone.utc).isoformat()

        return {
            "enabled": data.get("enabled", False),
            "account_id": data.get("account_id"),
            "test_user_id": data.get("test_user_id"),
            "captions": captions,
            "current_index": data.get("current_index", 0),
            "messages_sent": data.get("messages_sent", 0),
            "total_messages": total_messages,
            "completed_cycles": data.get("completed_cycles", 0),
            "total_cycles": total_cycles,
            "unlimited_cycles": total_cycles == 0,
            "auto_unsend_after_minutes": data.get("auto_unsend_after_minutes", 1),
            "end_at": end_at_str,
            "created_at": data.get("created_at").isoformat() if data.get("created_at") else None,
            "last_sent_at": data.get("last_sent_at").isoformat() if data.get("last_sent_at") else None,
            "completed_at": data.get("completed_at").isoformat() if data.get("completed_at") else None,
        }
    except Exception as e:
        logger.error(f"Error getting rotation status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
