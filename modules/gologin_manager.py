import asyncio
import logging
import os
from typing import Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)


class GoLoginManager:

    API_BASE = "https://api.gologin.com"
    PING_INTERVAL = 300

    def __init__(self, api_token: Optional[str] = None):
        self.api_token = api_token or os.getenv("GOLOGIN_API_TOKEN")
        if not self.api_token:
            raise ValueError("GOLOGIN_API_TOKEN must be provided or set in environment variables")

        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }
        self.active_profiles: Dict[str, dict] = {}
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers=self.headers)
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def get_profile(self, profile_id: str) -> Optional[dict]:
        session = await self._get_session()
        url = f"{self.API_BASE}/browser/{profile_id}"

        try:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    logger.debug(f"Retrieved profile {profile_id}")
                    return data
                else:
                    error_text = await response.text()
                    logger.error(f"Failed to get profile {profile_id}: {response.status} - {error_text}")
                    return None
        except Exception as e:
            logger.error(f"Error getting profile {profile_id}: {str(e)}")
            return None

    async def get_profile_cookies(self, profile_id: str) -> Optional[str]:
        session = await self._get_session()
        url = f"{self.API_BASE}/browser/{profile_id}/cookies"

        try:
            async with session.get(url) as response:
                if response.status == 200:
                    cookies_data = await response.json()
                    if isinstance(cookies_data, list):
                        cookie_str = "; ".join(
                            f"{c.get('name')}={c.get('value')}"
                            for c in cookies_data
                            if c.get('name') and c.get('value')
                        )
                        logger.debug(f"Retrieved {len(cookies_data)} cookies for profile {profile_id}")
                        return cookie_str
                    return None
                else:
                    error_text = await response.text()
                    logger.error(f"Failed to get cookies for {profile_id}: {response.status} - {error_text}")
                    return None
        except Exception as e:
            logger.error(f"Error getting cookies for {profile_id}: {str(e)}")
            return None

    def _extract_proxy_url(self, profile_data: dict) -> Optional[str]:
        proxy = profile_data.get("proxy", {})
        if not proxy:
            return None

        mode = proxy.get("mode", "")
        if mode == "none":
            return None

        host = proxy.get("host", "")
        port = proxy.get("port", "")

        if not host or not port:
            return None

        username = proxy.get("username", "")
        password = proxy.get("password", "")

        if username and password:
            return f"http://{username}:{password}@{host}:{port}"
        return f"http://{host}:{port}"

    def _extract_x_bc(self, profile_data: dict) -> Optional[str]:
        extensions = profile_data.get("extensions", {})
        if isinstance(extensions, dict) and "x_bc" in extensions:
            return extensions.get("x_bc")

        storage = profile_data.get("storage", {})
        if isinstance(storage, dict) and "x_bc" in storage:
            return storage.get("x_bc")

        custom_data = profile_data.get("customData", {})
        if isinstance(custom_data, dict) and "x_bc" in custom_data:
            return custom_data.get("x_bc")

        return None

    async def get_fresh_credentials(self, profile_id: str) -> Optional[dict]:
        profile_data = await self.get_profile(profile_id)
        if not profile_data:
            logger.error(f"Could not retrieve profile {profile_id}")
            return None

        cookies = await self.get_profile_cookies(profile_id)

        x_bc = self._extract_x_bc(profile_data)

        if not x_bc and cookies:
            for cookie_pair in cookies.split("; "):
                if cookie_pair.startswith("fp="):
                    x_bc = cookie_pair.split("=", 1)[1]
                    break

        proxy_url = self._extract_proxy_url(profile_data)

        user_agent = profile_data.get("navigator", {}).get("userAgent", "")
        if not user_agent:
            user_agent = profile_data.get("userAgent", "")

        credentials = {
            "cookies": cookies,
            "x_bc": x_bc,
            "user_agent": user_agent,
            "proxy_url": proxy_url,
            "profile_id": profile_id,
            "profile_name": profile_data.get("name", "")
        }

        logger.info(f"Retrieved fresh credentials for profile {profile_id} ({profile_data.get('name', 'unknown')})")
        logger.debug(f"  Cookies: {'Yes' if cookies else 'No'}")
        logger.debug(f"  x_bc: {'Yes' if x_bc else 'No'}")
        logger.debug(f"  Proxy: {proxy_url or 'None'}")

        return credentials

    async def ping_profile(self, profile_id: str) -> bool:
        session = await self._get_session()
        url = f"{self.API_BASE}/browser/{profile_id}"

        try:
            async with session.get(url) as response:
                if response.status == 200:
                    logger.debug(f"Ping successful for profile {profile_id}")
                    return True
                else:
                    logger.warning(f"Ping failed for profile {profile_id}: {response.status}")
                    return False
        except Exception as e:
            logger.error(f"Ping error for profile {profile_id}: {str(e)}")
            return False

    async def ping_all_profiles(self, profile_ids: List[str]) -> Dict[str, bool]:
        results = {}
        for profile_id in profile_ids:
            results[profile_id] = await self.ping_profile(profile_id)
            await asyncio.sleep(0.5)
        return results

    async def start_keepalive_loop(self, profile_ids: List[str], on_failure: Optional[callable] = None):
        logger.info(f"Starting keep-alive loop for {len(profile_ids)} profiles (interval: {self.PING_INTERVAL}s)")

        while True:
            results = await self.ping_all_profiles(profile_ids)

            failed = [pid for pid, success in results.items() if not success]
            if failed:
                logger.error(f"Keep-alive failed for profiles: {failed}")
                if on_failure:
                    for profile_id in failed:
                        on_failure(profile_id, "Ping failed")

            success_count = sum(1 for success in results.values() if success)
            logger.info(f"Keep-alive ping: {success_count}/{len(profile_ids)} profiles OK")

            await asyncio.sleep(self.PING_INTERVAL)


async def get_gologin_credentials(profile_id: str, api_token: Optional[str] = None) -> Optional[dict]:
    manager = GoLoginManager(api_token)
    try:
        return await manager.get_fresh_credentials(profile_id)
    finally:
        await manager.close()


async def get_gologin_proxy(profile_id: str, api_token: Optional[str] = None) -> Optional[str]:
    manager = GoLoginManager(api_token)
    try:
        profile_data = await manager.get_profile(profile_id)
        if profile_data:
            return manager._extract_proxy_url(profile_data)
        return None
    finally:
        await manager.close()
