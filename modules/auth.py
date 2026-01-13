import logging
import os
from typing import TYPE_CHECKING, List, Optional

from ultima_scraper_api import select_api
from ultima_scraper_api.apis.onlyfans.classes.extras import AuthDetails
from ultima_scraper_api.apis.onlyfans.authenticator import OnlyFansAuthenticator
from ultima_scraper_api.config import UltimaScraperAPIConfig

from modules.db_credential_loader import load_credentials_from_db
from modules.gologin_manager import GoLoginManager

if TYPE_CHECKING:
    from ultima_scraper_api.apis.onlyfans.classes.auth_model import OnlyFansAuthModel

logger = logging.getLogger(__name__)


async def authenticate_from_db(
    model_id: Optional[str] = None,
    only_authenticated: bool = True,
    get_gologin_token: Optional[callable] = None
) -> List[dict]:
    credentials = await load_credentials_from_db(
        model_id=model_id,
        only_authenticated=only_authenticated
    )

    if not credentials:
        logger.warning("No credentials found in database")
        return []

    authenticated = []

    for cred in credentials:
        auth_data = cred.get("auth", {})
        account_name = cred.get("username", "Unknown")
        gologin_profile_id = cred.get("gologin_profile_id")

        if not auth_data:
            logger.warning(f"No auth data for {account_name}")
            continue

        auth_details = AuthDetails(
            id=cred.get("id"),
            username=account_name,
            cookie=auth_data.get("cookie", ""),
            x_bc=auth_data.get("x_bc", ""),
            user_agent=auth_data.get("user_agent", ""),
        )

        proxy_url = None
        if gologin_profile_id:
            custom_token = None
            if get_gologin_token:
                custom_token = get_gologin_token(account_name)
            proxy_url = await _get_proxy_from_gologin(gologin_profile_id, account_name, custom_token)

        if proxy_url:
            config = UltimaScraperAPIConfig()
            config.settings.network.proxies = [proxy_url]
            api = select_api("onlyfans", config=config)
            logger.info(f"[{account_name}] API configured with proxy")
        else:
            api = select_api("onlyfans")
            if gologin_profile_id:
                logger.warning(f"[{account_name}] No proxy available, using direct connection")

        authenticator = OnlyFansAuthenticator(api, auth_details)
        auth = await authenticator.login()

        if auth and authenticator.is_authed():
            logger.info(f"Authenticated as: {auth.username} (ID: {auth.id})")
            print(f"Authenticated as: {auth.username} (ID: {auth.id})")
            authenticated.append({
                "authed": auth,
                "api": api,
                "account_name": account_name,
                "model_id": cred.get("id"),
                "proxy_url": proxy_url,
                "success": True
            })
        else:
            logger.warning(f"Authentication failed for {account_name}")
            print(f"Authentication failed for {account_name}")
            error_messages = []
            if authenticator.errors:
                for error in authenticator.errors:
                    logger.error(f"  Error {error.code}: {error.message}")
                    print(f"  Error {error.code}: {error.message}")
                    error_messages.append(f"{error.code}: {error.message}")
            authenticated.append({
                "authed": None,
                "api": api,
                "account_name": account_name,
                "model_id": cred.get("id"),
                "proxy_url": proxy_url,
                "success": False,
                "error": "; ".join(error_messages) if error_messages else "Authentication failed"
            })

    return authenticated


async def _get_proxy_from_gologin(
    profile_id: str,
    account_name: str,
    gologin_token: Optional[str] = None
) -> Optional[str]:
    token = gologin_token or os.getenv("GOLOGIN_API_TOKEN")
    if not token:
        logger.warning(f"[{account_name}] No GoLogin API token available, skipping proxy")
        return None

    manager = None
    proxy_url = None
    try:
        manager = GoLoginManager(api_token=token)
        profile_data = await manager.get_profile(profile_id)

        if profile_data:
            proxy_url = manager._extract_proxy_url(profile_data)
            if proxy_url:
                masked = proxy_url.split('@')[-1] if '@' in proxy_url else proxy_url
                logger.info(f"[{account_name}] Proxy: {masked}")
            else:
                logger.warning(f"[{account_name}] No proxy configured in GoLogin profile {profile_id}")
        else:
            logger.warning(f"[{account_name}] Could not get GoLogin profile {profile_id}")

    except Exception as e:
        logger.error(f"[{account_name}] GoLogin error: {str(e)}")

    finally:
        if manager:
            await manager.close()

    return proxy_url


async def authenticate_single(model_id: str) -> Optional["OnlyFansAuthModel"]:
    results = await authenticate_from_db(model_id=model_id)
    if results:
        return results[0]["authed"]
    return None


async def authenticate_all() -> List[dict]:
    return await authenticate_from_db(only_authenticated=True)


async def close_session(auth: "OnlyFansAuthModel") -> None:
    try:
        session = auth.get_requester().active_session
        if session and not session.closed:
            await session.close()
    except Exception:
        pass
