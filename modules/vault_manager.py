"""Vault Manager - API client for OF Message Sender vault endpoints.

Handles:
- Getting authenticated models from the API
- Fetching vault folders per model
- Fetching media from vault folders
- Sending messages with media
"""

import asyncio
import logging
import os
from typing import Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)


class VaultManager:
    """Manages vault API interactions for OnlyFans Message Sender."""

    API_BASE = "https://of-message-sender-3qumvbkjdq-uc.a.run.app"

    def __init__(self, api_key: Optional[str] = None):
        """Initialize Vault manager.

        :param api_key: Vault API key. If not provided, reads from VAULT_API_KEY env var.
        :raises ValueError: If no API key is provided or found in environment.
        """
        self.api_key = api_key or os.getenv("VAULT_API_KEY")
        if not self.api_key:
            raise ValueError("VAULT_API_KEY must be provided or set in environment variables")

        self.headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json"
        }
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers=self.headers)
        return self._session

    async def close(self):
        """Close the aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()

    async def health_check(self) -> Optional[dict]:
        """Check service health and get authenticated models.

        :return: Health status dictionary or None if failed.
        """
        session = await self._get_session()
        url = f"{self.API_BASE}/health"

        try:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    logger.debug(f"Health check: {data.get('status')}")
                    return data
                else:
                    error_text = await response.text()
                    logger.error(f"Health check failed: {response.status} - {error_text}")
                    return None
        except Exception as e:
            logger.error(f"Health check error: {str(e)}")
            return None

    async def get_models(self) -> List[dict]:
        """Get all configured models with their authentication status.

        :return: List of model dictionaries with id, label, authenticated status.
        """
        session = await self._get_session()
        url = f"{self.API_BASE}/models"

        try:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    models = data.get("models", [])
                    logger.debug(f"Retrieved {len(models)} models")
                    return models
                else:
                    error_text = await response.text()
                    logger.error(f"Failed to get models: {response.status} - {error_text}")
                    return []
        except Exception as e:
            logger.error(f"Error getting models: {str(e)}")
            return []

    async def get_vault_folders(self, model_id: str) -> List[dict]:
        """Get all vault folders for a model.

        :param model_id: OnlyFans creator/model ID.
        :return: List of vault folder dictionaries.
        """
        session = await self._get_session()
        url = f"{self.API_BASE}/vault/lists"

        try:
            async with session.get(url, params={"model_id": model_id}) as response:
                if response.status == 200:
                    data = await response.json()
                    folders = data.get("folders", [])
                    logger.debug(f"Retrieved {len(folders)} vault folders for model {model_id}")
                    return folders
                else:
                    error_text = await response.text()
                    logger.error(f"Failed to get vault folders for {model_id}: {response.status} - {error_text}")
                    return []
        except Exception as e:
            logger.error(f"Error getting vault folders for {model_id}: {str(e)}")
            return []

    async def get_vault_media(
        self,
        model_id: str,
        list_id: int,
        limit: int = 100,
        offset: int = 0
    ) -> dict:
        """Get media from a specific vault folder.

        :param model_id: OnlyFans creator/model ID.
        :param list_id: Vault folder ID.
        :param limit: Items per page (max 100).
        :param offset: Pagination offset.
        :return: Dictionary with media list, count, has_more, total_count.
        """
        session = await self._get_session()
        url = f"{self.API_BASE}/vault/media"
        params = {
            "model_id": model_id,
            "list_id": list_id,
            "limit": limit,
            "offset": offset
        }

        try:
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    logger.debug(
                        f"Retrieved {data.get('count', 0)} media items from folder {list_id} "
                        f"(total: {data.get('total_count', 0)})"
                    )
                    return data
                else:
                    error_text = await response.text()
                    logger.error(
                        f"Failed to get vault media for {model_id}/{list_id}: "
                        f"{response.status} - {error_text}"
                    )
                    return {"media": [], "count": 0, "has_more": False, "total_count": 0}
        except Exception as e:
            logger.error(f"Error getting vault media for {model_id}/{list_id}: {str(e)}")
            return {"media": [], "count": 0, "has_more": False, "total_count": 0}

    async def get_all_vault_media(self, model_id: str, list_id: int) -> List[dict]:
        """Get all media from a vault folder (handles pagination).

        :param model_id: OnlyFans creator/model ID.
        :param list_id: Vault folder ID.
        :return: List of all media items in the folder.
        """
        all_media = []
        offset = 0
        limit = 100

        while True:
            data = await self.get_vault_media(model_id, list_id, limit=limit, offset=offset)
            media = data.get("media", [])
            all_media.extend(media)

            if not data.get("has_more", False):
                break

            offset += limit
            # Small delay to avoid rate limiting
            await asyncio.sleep(0.1)

        logger.debug(f"Retrieved total {len(all_media)} media items from folder {list_id}")
        return all_media

    async def get_media_by_id(self, model_id: str, media_id: int) -> Optional[dict]:
        """Find a specific media item by its ID.

        :param model_id: OnlyFans creator/model ID.
        :param media_id: Media ID to search for.
        :return: Media item dictionary or None if not found.
        """
        session = await self._get_session()
        url = f"{self.API_BASE}/vault/media/{media_id}"

        try:
            async with session.get(url, params={"model_id": model_id}) as response:
                if response.status == 200:
                    data = await response.json()
                    logger.debug(f"Found media {media_id}")
                    return data
                elif response.status == 404:
                    logger.debug(f"Media {media_id} not found")
                    return None
                else:
                    error_text = await response.text()
                    logger.error(f"Failed to get media {media_id}: {response.status} - {error_text}")
                    return None
        except Exception as e:
            logger.error(f"Error getting media {media_id}: {str(e)}")
            return None

    async def send_message(
        self,
        model_id: str,
        fan_id: str,
        text: str,
        price: int = 0,
        media_ids: Optional[List[str]] = None,
        locked_text: bool = False,
        reply_to_message_id: Optional[int] = None
    ) -> dict:
        """Send a message to a fan.

        :param model_id: OnlyFans creator/model ID.
        :param fan_id: OnlyFans fan ID.
        :param text: Message content.
        :param price: PPV price in dollars (0 = free message).
        :param media_ids: List of vault media IDs to attach.
        :param locked_text: If True, text is hidden behind paywall.
        :param reply_to_message_id: Message ID to reply to (for PPV bumps).
        :return: Response dictionary with success, message_id, or error.
        """
        session = await self._get_session()
        url = f"{self.API_BASE}/send-message"

        payload = {
            "model_id": model_id,
            "fan_id": fan_id,
            "text": text,
            "price": price,
            "media_ids": media_ids or [],
            "locked_text": locked_text
        }

        if reply_to_message_id:
            payload["reply_to_message_id"] = reply_to_message_id

        try:
            async with session.post(url, json=payload) as response:
                data = await response.json()

                if response.status == 200:
                    logger.debug(f"Message sent to fan {fan_id}: {data.get('message_id')}")
                    return {"success": True, **data}
                else:
                    error_detail = data.get("detail", {})
                    error_msg = error_detail.get("error", "Unknown error") if isinstance(error_detail, dict) else str(error_detail)
                    logger.error(f"Failed to send message to {fan_id}: {error_msg}")
                    return {"success": False, "error": error_msg}
        except Exception as e:
            logger.error(f"Error sending message to {fan_id}: {str(e)}")
            return {"success": False, "error": str(e)}

    async def find_folder_by_pattern(self, model_id: str, pattern: str) -> Optional[dict]:
        """Find a vault folder matching a pattern (case-insensitive).

        :param model_id: OnlyFans creator/model ID.
        :param pattern: Pattern to match folder name (e.g., 'gifs', 'mass message').
        :return: Matching folder dictionary or None if not found.
        """
        folders = await self.get_vault_folders(model_id)
        pattern_lower = pattern.lower()

        for folder in folders:
            folder_name = folder.get("name", "").lower()
            # Check if pattern is contained in folder name
            if pattern_lower in folder_name:
                return folder

        return None

    async def find_folders_by_pattern(self, model_id: str, pattern: str) -> List[dict]:
        """Find all vault folders matching a pattern (case-insensitive).

        :param model_id: OnlyFans creator/model ID.
        :param pattern: Pattern to match folder name (e.g., 'gifs', 'mass message').
        :return: List of matching folder dictionaries.
        """
        folders = await self.get_vault_folders(model_id)
        pattern_lower = pattern.lower()

        matching = [
            folder for folder in folders
            if pattern_lower in folder.get("name", "").lower()
        ]

        return matching


async def get_vault_manager(api_key: Optional[str] = None) -> VaultManager:
    """Convenience function to create a VaultManager instance.

    :param api_key: Optional API key (uses env var if not provided).
    :return: VaultManager instance.
    """
    return VaultManager(api_key)
