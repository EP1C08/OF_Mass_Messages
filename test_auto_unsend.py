"""
Test script for auto-unsend after a delay.

This script:
1. Sends a message with media to a test user
2. Waits for a specified delay
3. Automatically unsends the message

Run with: .venv\Scripts\python test_auto_unsend.py
"""

import asyncio
import logging
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Test parameters - adjust these as needed
TEST_ACCOUNT_ID = "248797134"  # Ayumi
TEST_USER_ID = 528621767  # Test recipient user ID
TEST_MESSAGE = "Hiiiiii {name} - this will auto-unsend!"
TEST_MEDIA_ID = 3490548556  # GIF media ID from your vault

# Auto-unsend delay in seconds
# For testing: 60 = 1 minute, 300 = 5 minutes
# For production: 3600 = 1 hour
AUTO_UNSEND_DELAY_SECONDS = 60  # 1 minute for testing


async def send_and_auto_unsend():
    """Send a message and automatically unsend it after a delay."""
    print("=" * 60)
    print("AUTO-UNSEND TEST")
    print("=" * 60)
    print(f"\nSettings:")
    print(f"  Account ID: {TEST_ACCOUNT_ID}")
    print(f"  Test User ID: {TEST_USER_ID}")
    print(f"  Message: {TEST_MESSAGE}")
    print(f"  Media ID: {TEST_MEDIA_ID}")
    print(f"  Auto-unsend delay: {AUTO_UNSEND_DELAY_SECONDS} seconds ({AUTO_UNSEND_DELAY_SECONDS/60:.1f} minutes)")

    from modules.auth import authenticate_from_db, close_session
    from modules.mass_message import MassMessenger, Recipient

    # Step 1: Authenticate
    print("\n" + "-" * 60)
    print("Step 1: Authenticating...")
    print("-" * 60)

    auth_results = await authenticate_from_db(model_id=TEST_ACCOUNT_ID)
    if not auth_results or not auth_results[0].get("success"):
        print("Authentication failed!")
        return

    auth = auth_results[0]["authed"]
    account_name = auth_results[0].get("account_name", "Unknown")
    print(f"Authenticated as: {account_name}")

    try:
        # Step 2: Get user info
        print("\n" + "-" * 60)
        print("Step 2: Getting user info...")
        print("-" * 60)

        user = await auth.get_user(TEST_USER_ID)
        if not user:
            print(f"Could not find user {TEST_USER_ID}")
            return

        fan_name = user.name or user.username or "Fan"
        print(f"Target user: {fan_name} (ID: {TEST_USER_ID})")

        # Step 3: Send message
        print("\n" + "-" * 60)
        print("Step 3: Sending message with media...")
        print("-" * 60)

        recipient = Recipient(
            user_id=TEST_USER_ID,
            username=user.username,
            name=fan_name,
        )

        messenger = MassMessenger(auth)
        results = await messenger.send_mass_message(
            recipients=[recipient],
            message_template=TEST_MESSAGE,
            media_ids=[TEST_MEDIA_ID],
            price=0,
        )

        if not results or not results[0].success:
            print(f"Failed to send message: {results[0].error if results else 'Unknown error'}")
            return

        message_id = results[0].message_id
        print(f"Message sent successfully!")
        print(f"  Message ID: {message_id}")
        sent_time = datetime.now(timezone.utc)
        print(f"  Sent at: {sent_time.strftime('%Y-%m-%d %H:%M:%S')} UTC")

        # Step 4: Wait for delay
        print("\n" + "-" * 60)
        print(f"Step 4: Waiting {AUTO_UNSEND_DELAY_SECONDS} seconds before unsending...")
        print("-" * 60)

        unsend_time = sent_time.timestamp() + AUTO_UNSEND_DELAY_SECONDS
        unsend_datetime = datetime.fromtimestamp(unsend_time, tz=timezone.utc)
        print(f"  Will unsend at: {unsend_datetime.strftime('%Y-%m-%d %H:%M:%S')} UTC")
        print()

        # Countdown
        remaining = AUTO_UNSEND_DELAY_SECONDS
        while remaining > 0:
            mins, secs = divmod(remaining, 60)
            print(f"\r  Time remaining: {mins:02d}:{secs:02d}", end="", flush=True)
            await asyncio.sleep(1)
            remaining -= 1

        print("\r  Time remaining: 00:00 - Unsending now!")

        # Step 5: Unsend the message
        print("\n" + "-" * 60)
        print("Step 5: Unsending message...")
        print("-" * 60)

        if message_id:
            success = await messenger.unsend_message(int(message_id))
            if success:
                print(f"Message {message_id} unsent successfully!")
            else:
                print(f"Failed to unsend message {message_id}")
        else:
            print("No message ID available to unsend")

        print("\n" + "=" * 60)
        print("TEST COMPLETE")
        print("=" * 60)

    finally:
        await close_session(auth)
        print("\nSession closed.")


async def test_unsend_specific_message():
    """Unsend a specific message by ID (for manual testing)."""
    print("=" * 60)
    print("UNSEND SPECIFIC MESSAGE")
    print("=" * 60)

    # Set the message ID to unsend
    MESSAGE_ID_TO_UNSEND = input("Enter message ID to unsend: ").strip()

    if not MESSAGE_ID_TO_UNSEND:
        print("No message ID provided")
        return

    from modules.auth import authenticate_from_db, close_session
    from modules.mass_message import MassMessenger

    auth_results = await authenticate_from_db(model_id=TEST_ACCOUNT_ID)
    if not auth_results or not auth_results[0].get("success"):
        print("Authentication failed!")
        return

    auth = auth_results[0]["authed"]

    try:
        messenger = MassMessenger(auth)
        success = await messenger.unsend_message(int(MESSAGE_ID_TO_UNSEND))

        if success:
            print(f"Message {MESSAGE_ID_TO_UNSEND} unsent successfully!")
        else:
            print(f"Failed to unsend message {MESSAGE_ID_TO_UNSEND}")

    finally:
        await close_session(auth)
        print("\nSession closed.")


async def main():
    print("\nSelect test to run:")
    print("1. Send message and auto-unsend after delay")
    print("2. Unsend a specific message by ID")

    choice = input("\nEnter choice (1 or 2): ").strip()

    if choice == "1":
        await send_and_auto_unsend()
    elif choice == "2":
        await test_unsend_specific_message()
    else:
        # Default to auto-unsend test
        await send_and_auto_unsend()


if __name__ == "__main__":
    asyncio.run(main())
