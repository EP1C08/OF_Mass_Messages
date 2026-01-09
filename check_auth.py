"""Authentication Checker Script.

Tests authentication for all accounts in the creator_credentials database table.
Reports which accounts are working and which need credential updates.
"""

import asyncio
import logging
import sys
from datetime import datetime
from typing import List

from dotenv import load_dotenv

load_dotenv()

from modules import authenticate_from_db, close_session

# Creators that use GALEN_API_TOKEN (different GoLogin account)
GALEN_CREATORS = ["Juno", "avabarham2", "Luna", "luna"]


def get_gologin_token(account_name: str) -> str:
    """Get the correct GoLogin API token for a creator.

    :param account_name: Creator's username/name.
    :return: GoLogin API token string.
    """
    import os
    if account_name in GALEN_CREATORS:
        return os.getenv("GALEN_API_TOKEN")
    return os.getenv("GOLOGIN_API_TOKEN")


# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


async def check_all_accounts() -> List[dict]:
    """Check authentication for all accounts in database.

    Uses authenticate_from_db() which handles:
    - Loading credentials from database
    - GoLogin proxy setup
    - Authentication with OnlyFans API

    :return: List of result dictionaries.
    """
    logger.info("Authenticating all accounts from database...")
    logger.info("(This includes GoLogin proxy setup if configured)\n")

    results = []

    try:
        # authenticate_from_db handles everything including GoLogin proxy
        # Pass get_gologin_token callback to use correct token per account
        authenticated = await authenticate_from_db(
            only_authenticated=False,
            get_gologin_token=get_gologin_token
        )

        for account in authenticated:
            auth = account.get("authed")
            account_name = account["account_name"]
            proxy_url = account.get("proxy_url")
            success = account.get("success", False)

            if success and auth:
                result = {
                    'name': account_name,
                    'id': auth.id,
                    'auth_success': True,
                    'error': None,
                    'proxy_available': proxy_url is not None,
                    'user_info': {
                        'username': auth.username,
                        'id': auth.id
                    }
                }

                # Log which token type was used
                token_type = "GALEN_API_TOKEN" if account_name in GALEN_CREATORS else "GOLOGIN_API_TOKEN"
                logger.info(f"[{account_name}] SUCCESS - Authenticated as {auth.username} (using {token_type})")
                if proxy_url:
                    masked = proxy_url.split('@')[-1] if '@' in proxy_url else proxy_url
                    logger.info(f"[{account_name}] Proxy: {masked}")

                # Close session after checking
                await close_session(auth)
            else:
                result = {
                    'name': account_name,
                    'id': account.get("model_id"),
                    'auth_success': False,
                    'error': account.get("error", "Authentication failed"),
                    'proxy_available': proxy_url is not None,
                    'user_info': None
                }

                token_type = "GALEN_API_TOKEN" if account_name in GALEN_CREATORS else "GOLOGIN_API_TOKEN"
                logger.warning(f"[{account_name}] FAILED - (using {token_type})")

            results.append(result)

    except Exception as e:
        logger.error(f"Error during authentication: {str(e)}")
        import traceback
        traceback.print_exc()

    return results


def print_summary(results: List[dict]) -> None:
    """Print summary of authentication check results.

    :param results: List of result dictionaries.
    """
    print("\n" + "=" * 70)
    print("AUTHENTICATION CHECK SUMMARY")
    print("=" * 70)

    success_count = sum(1 for r in results if r['auth_success'])
    failed_count = len(results) - success_count

    print(f"\nTotal accounts: {len(results)}")
    print(f"Authenticated:  {success_count}")
    print(f"Failed:         {failed_count}")

    # Print successful accounts
    if success_count > 0:
        print("\n" + "-" * 70)
        print("WORKING ACCOUNTS:")
        print("-" * 70)
        for r in results:
            if r['auth_success']:
                user_info = r.get('user_info', {})
                print(f"  [OK] {r['name']} (ID: {r['id']})")
                if user_info:
                    print(f"       -> Logged in as: {user_info.get('username', 'N/A')}")

    # Print failed accounts
    if failed_count > 0:
        print("\n" + "-" * 70)
        print("FAILED ACCOUNTS (need credential update):")
        print("-" * 70)
        for r in results:
            if not r['auth_success']:
                print(f"  [FAIL] {r['name']} (ID: {r['id']})")
                if r.get('error'):
                    print(f"         Error: {r['error']}")

    print("\n" + "=" * 70)


async def main() -> None:
    """Main entry point."""
    print("=" * 70)
    print("Authentication Checker")
    print("=" * 70)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    try:
        results = await check_all_accounts()
        print_summary(results)

        print(f"\nCompleted at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        # Exit with error code if any accounts failed
        failed_count = sum(1 for r in results if not r['auth_success'])
        if failed_count > 0:
            sys.exit(1)

    except Exception as e:
        logger.error(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
