"""
Local FastAPI server for Collections API.

Provides REST endpoints for managing OnlyFans collections/lists.
Run with: uvicorn api_server:app --reload --port 8001
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, List, Optional, Union

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from modules import authenticate_from_db, close_session, CollectionsManager

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
    yield
    logger.info("Shutting down, closing all sessions...")
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
    """Get all available models from database."""
    try:
        # Get all credentials (not just authenticated) to show available models
        results = await authenticate_from_db(only_authenticated=False)

        models = []
        for result in results:
            models.append(ModelResponse(
                model_id=str(result.get("model_id", "")),
                username=result.get("account_name", "Unknown"),
                authenticated=result.get("success", False)
            ))

        # Close sessions we just opened for listing
        for result in results:
            if result.get("authed"):
                await close_session(result["authed"])

        return models
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
