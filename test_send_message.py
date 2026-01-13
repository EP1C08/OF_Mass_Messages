"""
Test script to send a test message with media attachment.

Run with: .venv\Scripts\python test_send_message.py
"""

import asyncio
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,  # Changed to INFO to reduce noise
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Test parameters - adjust these as needed
TEST_ACCOUNT_ID = "248797134"  # Ayumi
TEST_USER_ID = 528621767  # Test recipient user ID
TEST_MESSAGE = "Hiiiiii {name}"
TEST_MEDIA_ID = 3490548556  # GIF media ID from your vault (as integer)


async def test_authentication():
    """Test 1: Verify authentication works."""
    print("\n" + "=" * 60)
    print("TEST 1: Authentication")
    print("=" * 60)

    from modules.auth import authenticate_from_db, close_session

    try:
        results = await authenticate_from_db(model_id=TEST_ACCOUNT_ID)

        if not results:
            print("❌ FAILED: No authentication results returned")
            return None

        result = results[0]
        if not result.get("success"):
            print(f"❌ FAILED: Authentication failed - {result.get('error', 'Unknown error')}")
            return None

        auth = result.get("authed")
        if not auth:
            print("❌ FAILED: No auth object returned")
            return None

        print(f"✅ SUCCESS: Authenticated as {auth.username} (ID: {auth.id})")
        print(f"   Account name: {result.get('account_name')}")
        print(f"   Proxy: {result.get('proxy_url', 'None')}")

        return auth

    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return None


async def test_get_user_info(auth):
    """Test 2: Verify we can access the test user."""
    print("\n" + "=" * 60)
    print("TEST 2: Get User Info")
    print("=" * 60)

    try:
        # Try to get user info
        user = await auth.get_user(TEST_USER_ID)

        if user:
            print(f"✅ SUCCESS: Found user")
            print(f"   User ID: {user.id}")
            print(f"   Username: {user.username}")
            print(f"   Name: {user.name}")
            print(f"   Is subscriber: {getattr(user, 'subscribedBy', 'unknown')}")
            return user
        else:
            print(f"❌ FAILED: Could not find user {TEST_USER_ID}")
            return None

    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return None


async def test_get_chat(auth):
    """Test 3: Skipped - get_chat method doesn't exist."""
    print("\n" + "=" * 60)
    print("TEST 3: Get/Create Chat - SKIPPED")
    print("=" * 60)
    print("   Note: auth.get_chat() doesn't exist, use get_chats() instead")
    return None


async def test_vault_media(auth):
    """Test 4: Verify media ID exists in vault and get correct format."""
    print("\n" + "=" * 60)
    print("TEST 4: Verify Vault Media & Get Correct Format")
    print("=" * 60)

    try:
        # List available methods on auth
        print("   Available vault-related methods:")
        for attr in dir(auth):
            if 'vault' in attr.lower() or 'media' in attr.lower():
                print(f"     - {attr}")

        # Try getting vault lists
        print("\n   Trying auth.get_vault_lists()...")
        try:
            vault_lists = await auth.get_vault_lists()
            if vault_lists:
                print(f"   ✅ Found {len(vault_lists)} vault lists")
                for vl in vault_lists[:5]:  # Show first 5
                    print(f"     - ID: {vl.get('id')} | Name: {vl.get('name')} | Type: {vl.get('type')}")
                    print(f"       Videos: {vl.get('videosCount', 0)}, Photos: {vl.get('photosCount', 0)}, GIFs: {vl.get('gifsCount', 0)}")
        except Exception as e:
            print(f"   ❌ get_vault_lists failed: {e}")

        # Try getting vault media from a specific list
        print("\n   Trying to get vault media from GIF folder...")
        try:
            # Get the GIFS folder (ID 26617836 based on earlier API response)
            gifs_folder_id = 26617836
            vault_media = await auth.get_vault_media(gifs_folder_id)
            if vault_media:
                print(f"   ✅ Found {len(vault_media) if isinstance(vault_media, list) else 'some'} media items")
                # Show first few items to see the structure
                items = vault_media[:3] if isinstance(vault_media, list) else [vault_media]
                for i, item in enumerate(items):
                    print(f"\n   Media item {i+1}:")
                    if isinstance(item, dict):
                        for k, v in list(item.items())[:10]:  # First 10 keys
                            print(f"     {k}: {v}")
                    else:
                        print(f"     Type: {type(item)}")
                        print(f"     Attrs: {dir(item)[:10]}")
                        if hasattr(item, 'id'):
                            print(f"     ID: {item.id}")
                        if hasattr(item, '__dict__'):
                            for k, v in list(item.__dict__.items())[:10]:
                                print(f"     {k}: {v}")
        except Exception as e:
            print(f"   ❌ get_vault_media failed: {e}")
            import traceback
            traceback.print_exc()

        # Try getting a specific vault item by ID
        print(f"\n   Trying to get specific media ID {TEST_MEDIA_ID}...")
        try:
            media_item = await auth.get_vault_item(int(TEST_MEDIA_ID))
            if media_item:
                print(f"   ✅ Found media item")
                print(f"   Type: {type(media_item)}")
                if isinstance(media_item, dict):
                    for k, v in media_item.items():
                        print(f"     {k}: {v}")
                else:
                    print(f"   Attrs: {dir(media_item)}")
        except Exception as e:
            print(f"   ❌ get_vault_item failed: {e}")

        return True

    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_send_message_direct(auth, fan_name: str = "Fan"):
    """Test 5: Send message with media using direct API call (like OF-Automation-layer)."""
    print("\n" + "=" * 60)
    print("TEST 5: Send Message WITH MEDIA (Direct HTTP POST)")
    print("=" * 60)

    try:
        # Personalize message with fan's actual name
        message_text = TEST_MESSAGE.replace("{name}", fan_name)

        # Get the target user and their requester session
        target = await auth.get_user(TEST_USER_ID)
        if not target:
            print(f"❌ FAILED: Could not find user {TEST_USER_ID}")
            return False

        target_authed_session = target.get_requester()

        # Build the endpoint URL
        endpoint = f"https://onlyfans.com/api2/v2/chats/{TEST_USER_ID}/messages"

        # CRITICAL: OnlyFans raw API expects mediaFiles as list of STRING IDs
        # This is the format from OF-Automation-layer that works
        payload = {
            "text": message_text,
            "lockedText": False,
            "mediaFiles": [str(TEST_MEDIA_ID)],  # List of string IDs!
            "price": 0,
            "isCouplePeopleMedia": False,
            "isForward": False
        }

        print(f"   Sending to user: {TEST_USER_ID}")
        print(f"   Fan name: {fan_name}")
        print(f"   Message: {message_text}")
        print(f"   Endpoint: {endpoint}")
        print(f"   Payload: {payload}")

        # Get the required headers using session_rules
        headers = await target_authed_session.session_rules(endpoint)
        headers["accept"] = "application/json, text/plain, */*"
        headers["Connection"] = "keep-alive"

        print("\n   Attempting direct POST to OnlyFans API...")

        response = await target_authed_session.active_session.post(
            endpoint, headers=headers, json=payload
        )

        print(f"\n   Response status: {response.status}")

        if response.status == 200:
            result = await response.json()
            print(f"✅ SUCCESS: Message sent with media!")
            print(f"   Message ID: {result.get('id')}")
            return True
        else:
            response_text = await response.text()
            print(f"❌ FAILED: Status {response.status}")
            print(f"   Response: {response_text[:500]}")
            return False

    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_send_without_media(auth, fan_name: str = "Fan"):
    """Test 6: Send message WITHOUT media."""
    print("\n" + "=" * 60)
    print("TEST 6: Send Message (NO MEDIA)")
    print("=" * 60)

    try:
        # Personalize message with fan's actual name
        message_text = TEST_MESSAGE.replace("{name}", fan_name)

        print(f"   Sending to user: {TEST_USER_ID}")
        print(f"   Fan name: {fan_name}")
        print(f"   Message: {message_text}")
        print(f"   Media: NONE")

        response = await auth.send_message(
            TEST_USER_ID,
            message_text
        )

        print(f"\n   Raw response: {response}")

        if isinstance(response, dict) and "error" in response:
            print(f"❌ FAILED: {response['error']}")
            return False
        elif hasattr(response, 'id') or (isinstance(response, dict) and 'id' in response):
            msg_id = response.id if hasattr(response, 'id') else response.get('id')
            print(f"✅ SUCCESS: Message sent (ID: {msg_id})")
            return True
        else:
            print(f"⚠️ UNKNOWN response format")
            return False

    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_send_with_different_media_format(auth):
    """Test 7: Try different media parameter formats."""
    print("\n" + "=" * 60)
    print("TEST 7: Test Different Media Formats")
    print("=" * 60)

    message_text = "Testing media format - please ignore"
    media_id = TEST_MEDIA_ID

    # First, get the actual media item from vault to understand its structure
    print("   First, getting actual media from vault...")
    actual_media = None
    try:
        vault_media = await auth.get_vault_media(26617836)  # GIFs folder
        if vault_media:
            for item in vault_media:
                if hasattr(item, 'id') and str(item.id) == media_id:
                    actual_media = item
                    break
                elif isinstance(item, dict) and str(item.get('id')) == media_id:
                    actual_media = item
                    break

            if actual_media:
                print(f"   Found actual media item!")
                if hasattr(actual_media, '__dict__'):
                    print(f"   Media dict keys: {list(actual_media.__dict__.keys())}")
    except Exception as e:
        print(f"   Could not get vault media: {e}")

    # Based on OF-Automation-layer project, mediaFiles should be a LIST OF STRINGS
    # NOT a list of dicts, NOT a list of integers - just STRING IDs!
    formats_to_try = [
        # CORRECT FORMAT: List of string IDs (from OF-Automation-layer)
        ("mediaFiles as list of STRING IDs", {"mediaFiles": [str(media_id)]}),

        # Alternative formats to try if strings don't work
        ("mediaFiles as list of int", {"mediaFiles": [int(media_id)]}),
        ("mediaFiles with only id (dict)", {"mediaFiles": [{"id": int(media_id)}]}),
        ("mediaFiles with id as string (dict)", {"mediaFiles": [{"id": str(media_id)}]}),
    ]

    # If we have actual media, try sending it as-is
    if actual_media:
        if hasattr(actual_media, '__dict__'):
            formats_to_try.insert(0, ("mediaFiles with actual media __dict__", {"mediaFiles": [actual_media.__dict__]}))
        if isinstance(actual_media, dict):
            formats_to_try.insert(0, ("mediaFiles with actual media dict", {"mediaFiles": [actual_media]}))

    for desc, kwargs in formats_to_try:
        print(f"\n   Trying: {desc}")
        print(f"   kwargs (truncated): {str(kwargs)[:200]}...")

        try:
            response = await auth.send_message(
                TEST_USER_ID,
                message_text,
                **kwargs
            )

            if isinstance(response, dict) and "error" in response:
                print(f"   ❌ Error: {response['error']}")
            elif hasattr(response, 'id') or (isinstance(response, dict) and 'id' in response):
                msg_id = response.id if hasattr(response, 'id') else response.get('id')
                print(f"   ✅ SUCCESS with format '{desc}' (ID: {msg_id})")
                return desc
            else:
                print(f"   ⚠️ Unknown response: {response}")

        except Exception as e:
            print(f"   ❌ Exception: {e}")

    return None


async def inspect_auth_send_message(auth):
    """Inspect the send_message method signature."""
    print("\n" + "=" * 60)
    print("INSPECT: auth.send_message signature")
    print("=" * 60)

    import inspect

    try:
        sig = inspect.signature(auth.send_message)
        print(f"   Signature: {sig}")

        for name, param in sig.parameters.items():
            print(f"   - {name}: {param.annotation} = {param.default}")

        # Try to get the source code
        print("\n   Trying to find send_message source...")
        try:
            source = inspect.getsource(auth.send_message)
            print(f"   Source (first 2000 chars):\n{source[:2000]}")
        except Exception as e:
            print(f"   Could not get source: {e}")

    except Exception as e:
        print(f"   Could not inspect: {e}")


async def test_inspect_message_with_media(auth):
    """Test 8: Inspect existing messages that have media to understand the format."""
    print("\n" + "=" * 60)
    print("TEST 8: Inspect Existing Messages With Media")
    print("=" * 60)

    try:
        # Get chat messages from a chat to see what format media comes in
        print("   Getting chat messages to find messages with media...")

        # Get the test user's chat messages
        try:
            requester = auth.get_requester()
            url = f"https://onlyfans.com/api2/v2/chats/{TEST_USER_ID}/messages?limit=50"
            print(f"   Fetching: {url}")

            messages = await requester.json_request(url)

            if isinstance(messages, dict) and "list" in messages:
                messages = messages["list"]

            if messages:
                print(f"   Found {len(messages)} messages")

                # Find messages with media
                for msg in messages:
                    media = msg.get("media", [])
                    if media:
                        print(f"\n   *** FOUND MESSAGE WITH MEDIA ***")
                        print(f"   Message ID: {msg.get('id')}")
                        print(f"   Text: {msg.get('text', '')[:50]}...")
                        print(f"   Media count: {len(media)}")

                        for i, m in enumerate(media):
                            print(f"\n   Media item {i+1}:")
                            if isinstance(m, dict):
                                for k, v in m.items():
                                    # Truncate long values
                                    if isinstance(v, (dict, list)):
                                        print(f"     {k}: {type(v).__name__} with {len(v)} items")
                                    else:
                                        print(f"     {k}: {v}")
                            else:
                                print(f"     {m}")

                        # This is the key - print the raw media structure
                        print(f"\n   RAW MEDIA JSON for reference:")
                        import json
                        print(f"   {json.dumps(media[0], indent=2)[:500]}...")
                        break
                else:
                    print("   No messages with media found in chat")
            else:
                print("   No messages found in chat")

        except Exception as e:
            print(f"   ❌ Failed to get chat messages: {e}")
            import traceback
            traceback.print_exc()

    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()


async def test_raw_api_call(auth):
    """Test 9: Make raw API call to understand the expected format."""
    print("\n" + "=" * 60)
    print("TEST 9: Raw API Call Inspection")
    print("=" * 60)

    try:
        # Get the requester from auth
        requester = auth.get_requester()
        print(f"   Requester type: {type(requester)}")

        # Check if we can see how messages are sent
        print("\n   Checking chat endpoint structure...")

        # Try to find the actual endpoint URL and method used
        if hasattr(requester, 'session') or hasattr(requester, 'active_session'):
            print("   Found session object")

        # Try to inspect what happens when we prepare a message
        print("\n   Checking how mediaFiles should be structured by looking at existing messages...")

        # Get chat messages to see what format media comes in
        try:
            chats = await auth.get_chats()
            if chats:
                print(f"   Found {len(chats)} chats")
                # Find a chat with media
                for chat in chats[:10]:
                    if hasattr(chat, 'media') and chat.media:
                        print(f"\n   Found chat with media:")
                        print(f"     Chat ID: {chat.id if hasattr(chat, 'id') else 'N/A'}")
                        for media in chat.media[:2]:
                            print(f"     Media: {media}")
                            if hasattr(media, '__dict__'):
                                print(f"     Media dict: {media.__dict__}")
                        break
        except Exception as e:
            print(f"   ❌ Failed to get chats: {e}")

        # Get vault media to see the structure
        print("\n   Getting vault lists to find correct media format...")
        try:
            vault_lists = await auth.get_vault_lists()
            if vault_lists:
                # Find GIFs folder
                gifs_folder = None
                for vl in vault_lists:
                    if 'gif' in str(vl.get('name', '')).lower() or vl.get('gifsCount', 0) > 0:
                        gifs_folder = vl
                        break

                if gifs_folder:
                    print(f"   Found GIFs folder: {gifs_folder.get('name')} (ID: {gifs_folder.get('id')})")

                    # Get media from this folder
                    media_items = await auth.get_vault_media(gifs_folder.get('id'))
                    if media_items:
                        print(f"   Found {len(media_items)} media items")
                        item = media_items[0]
                        print(f"\n   First media item structure:")
                        print(f"   Type: {type(item)}")
                        if hasattr(item, '__dict__'):
                            for k, v in item.__dict__.items():
                                print(f"     {k}: {v}")
                        elif isinstance(item, dict):
                            for k, v in item.items():
                                print(f"     {k}: {v}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            import traceback
            traceback.print_exc()

    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()


async def main():
    print("=" * 60)
    print("MESSAGE SENDING TEST")
    print("=" * 60)
    print(f"\nTest Account: {TEST_ACCOUNT_ID}")
    print(f"Test User: {TEST_USER_ID}")
    print(f"Test Media ID: {TEST_MEDIA_ID}")

    # Run tests
    auth = await test_authentication()

    if not auth:
        print("\n\n❌ Cannot proceed without authentication")
        return

    try:
        # Get user info to use their actual name
        user = await test_get_user_info(auth)

        # Get the fan's name (fallback to username if no name)
        fan_name = "Fan"
        if user:
            fan_name = user.name or user.username or "Fan"

        # === ACTUAL MESSAGE SENDING TESTS ===
        print("\n\n" + "=" * 60)
        print("MESSAGE SENDING TESTS")
        print("=" * 60)

        # Test 1: Send without media first
        result_no_media = await test_send_without_media(auth, fan_name)

        if result_no_media:
            # Test 2: Send with media
            await test_send_message_direct(auth, fan_name)
        else:
            print("\n⚠️ Basic message sending failed, skipping media tests")

    finally:
        # Cleanup
        from modules.auth import close_session
        await close_session(auth)
        print("\n\nSession closed.")


if __name__ == "__main__":
    asyncio.run(main())
