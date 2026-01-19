import asyncio
import logging
import os
import random
from typing import Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)


class VaultManager:

    API_BASE = "https://of-message-sender-3qumvbkjdq-uc.a.run.app"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("VAULT_API")
        if not self.api_key:
            raise ValueError("VAULT_API must be provided or set in environment variables")

        self.headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json"
        }
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers=self.headers)
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def health_check(self) -> Optional[dict]:
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
                    logger.error(
                        f"Failed to get vault folders for {model_id}: {response.status} - {error_text}"
                    )
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
            await asyncio.sleep(0.1)

        logger.debug(f"Retrieved total {len(all_media)} media items from folder {list_id}")
        return all_media

    async def get_media_by_id(self, model_id: str, media_id: int) -> Optional[dict]:
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
                    error_msg = (
                        error_detail.get("error", "Unknown error")
                        if isinstance(error_detail, dict)
                        else str(error_detail)
                    )
                    logger.error(f"Failed to send message to {fan_id}: {error_msg}")
                    return {"success": False, "error": error_msg}
        except Exception as e:
            logger.error(f"Error sending message to {fan_id}: {str(e)}")
            return {"success": False, "error": str(e)}

    async def find_folder_by_pattern(self, model_id: str, pattern: str) -> Optional[dict]:
        folders = await self.get_vault_folders(model_id)
        pattern_lower = pattern.lower()

        for folder in folders:
            folder_name = folder.get("name", "").lower()
            if pattern_lower in folder_name:
                return folder

        return None

    async def find_folders_by_pattern(self, model_id: str, pattern: str) -> List[dict]:
        folders = await self.get_vault_folders(model_id)
        pattern_lower = pattern.lower()

        matching = [
            folder for folder in folders
            if pattern_lower in folder.get("name", "").lower()
        ]

        return matching

    async def find_folder_by_exact_name(
        self,
        model_id: str,
        folder_name: str,
    ) -> Optional[dict]:
        folders = await self.get_vault_folders(model_id)
        folder_name_lower = folder_name.lower()

        for folder in folders:
            if folder.get("name", "").lower() == folder_name_lower:
                return folder

        return None

    async def get_random_gifs_from_folder(
        self,
        model_id: str,
        folder_name: str,
        count: int,
    ) -> List[str]:
        folder = await self.find_folder_by_exact_name(model_id, folder_name)
        if not folder:
            logger.warning(f"Folder '{folder_name}' not found for model {model_id}")
            return []

        folder_id = folder.get("id")
        all_media = await self.get_all_vault_media(model_id, folder_id)
        gifs = [m for m in all_media if m.get("type") == "gif"]

        if not gifs:
            logger.warning(f"No GIFs found in folder '{folder_name}' for model {model_id}")
            return []

        actual_count = min(count, len(gifs))
        selected = random.sample(gifs, actual_count)
        gif_ids = [str(g["id"]) for g in selected]

        logger.info(
            f"Selected {len(gif_ids)} random GIFs from '{folder_name}' for model {model_id}"
        )
        return gif_ids


async def get_vault_manager(api_key: Optional[str] = None) -> VaultManager:
    return VaultManager(api_key)
