"""
Test script for scheduled mass message execution with caption rotation and random GIFs.

Features:
- Rotates through different captions
- Randomly selects GIFs from the vault
- Auto-unsends after a configurable delay
- Loops through all captions once

Run with: .venv\Scripts\python test_scheduled_message.py
"""

import asyncio
import logging
import random
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# Test parameters
TEST_ACCOUNT_ID = "248797134"  # Ayumi
TEST_USER_ID = 528621767  # Test recipient user ID

# Auto-unsend after X minutes (1 for testing, 60 for production)
AUTO_UNSEND_AFTER_MINUTES = 1

# Captions to rotate through (uses {name} placeholder for personalization)
CAPTIONS = [
    "HI {name}",
    "I miss you {name}",
    "do you miss me {name}",
]

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

async def get_random_gif_id(model_id: str) -> str | None:
    """Get a random GIF ID from the vault.

    Args:
        model_id: The OnlyFans model/account ID

    Returns:
        GIF ID as string, or None if no GIFs found
    """
    from modules.vault_manager import VaultManager

    vault = VaultManager()
    try:
        # Find GIFs folder
        print("  Searching for GIFs folder in vault...")
        gifs_folder = await vault.find_folder_by_pattern(model_id, "gif")

        if not gifs_folder:
            print("  WARNING: No GIFs folder found in vault!")
            return None

        folder_id = gifs_folder['id']
        folder_name = gifs_folder.get('name', 'Unknown')
        print(f"  Found folder: '{folder_name}' (ID: {folder_id})")

        # Get all media from the folder
        print("  Fetching GIFs from folder...")
        all_media = await vault.get_all_vault_media(model_id, folder_id)

        if not all_media:
            print("  WARNING: No media found in GIFs folder!")
            return None

        # Filter for GIFs only (type == 'gif')
        gifs = [m for m in all_media if m.get('type') == 'gif']

        # If no items with type='gif', use all media from the folder
        if not gifs:
            print(f"  No items with type='gif', using all {len(all_media)} items from folder")
            gifs = all_media
        else:
            print(f"  Found {len(gifs)} GIFs in folder")

        # Select random GIF
        random_gif = random.choice(gifs)
        gif_id = str(random_gif['id'])
        print(f"  Selected random GIF ID: {gif_id}")

        return gif_id

    finally:
        await vault.close()


async def send_message_with_gif(
    account_id: str,
    user_id: int,
    caption: str,
    gif_id: str,
) -> tuple[bool, str | None]:
    """Send a message with a GIF attachment.

    Args:
        account_id: The OnlyFans model/account ID
        user_id: The recipient user ID
        caption: The message caption (with {name} placeholder)
        gif_id: The GIF media ID from vault

    Returns:
        Tuple of (success, message_id)
    """
    from modules.auth import authenticate_from_db, close_session
    from modules.mass_message import MassMessenger, Recipient

    # Authenticate
    auth_results = await authenticate_from_db(model_id=account_id)
    if not auth_results or not auth_results[0].get("success"):
        print("  ERROR: Authentication failed!")
        return (False, None)

    auth = auth_results[0]["authed"]
    account_name = auth_results[0].get("account_name", "Unknown")

    try:
        # Get user info for personalization
        user = await auth.get_user(user_id)
        if not user:
            print(f"  ERROR: Could not find user {user_id}")
            return (False, None)

        fan_name = user.name or user.username or "Fan"
        fan_username = user.username or f"user_{user_id}"

        # Create recipient
        recipient = Recipient(
            user_id=user_id,
            username=fan_username,
            name=fan_name,
        )

        # Send message
        messenger = MassMessenger(auth)
        results = await messenger.send_mass_message(
            recipients=[recipient],
            message_template=caption,
            media_ids=[int(gif_id)],
            price=0,
        )

        if results and results[0].success:
            message_id = str(results[0].message_id)
            return (True, message_id)
        else:
            error = results[0].error if results else "Unknown error"
            print(f"  ERROR: Failed to send message: {error}")
            return (False, None)

    finally:
        await close_session(auth)


async def unsend_message(account_id: str, message_id: str) -> bool:
    """Unsend a message by ID.

    Args:
        account_id: The OnlyFans model/account ID
        message_id: The message ID to unsend

    Returns:
        True if successful, False otherwise
    """
    from modules.auth import authenticate_from_db, close_session
    from modules.mass_message import MassMessenger

    auth_results = await authenticate_from_db(model_id=account_id)
    if not auth_results or not auth_results[0].get("success"):
        print("  ERROR: Authentication failed for unsend!")
        return False

    auth = auth_results[0]["authed"]

    try:
        messenger = MassMessenger(auth)
        success = await messenger.unsend_message(int(message_id))
        return success
    finally:
        await close_session(auth)


async def wait_with_countdown(minutes: int):
    """Wait for the specified time with a countdown display.

    Args:
        minutes: Number of minutes to wait
    """
    total_seconds = minutes * 60
    remaining = total_seconds

    while remaining > 0:
        mins, secs = divmod(remaining, 60)
        print(f"\r  Time remaining: {mins:02d}:{secs:02d}", end="", flush=True)
        await asyncio.sleep(1)
        remaining -= 1

    print("\r  Time remaining: 00:00 - Time's up!     ")


# =============================================================================
# MAIN TEST FUNCTION
# =============================================================================

async def run_caption_rotation_test():
    """Run the caption rotation test with random GIFs."""

    print("=" * 70)
    print("CAPTION ROTATION TEST WITH RANDOM GIFS")
    print("=" * 70)
    print(f"\nConfiguration:")
    print(f"  Account ID: {TEST_ACCOUNT_ID}")
    print(f"  Test User ID: {TEST_USER_ID}")
    print(f"  Auto-unsend delay: {AUTO_UNSEND_AFTER_MINUTES} minute(s)")
    print(f"  Captions to rotate: {len(CAPTIONS)}")
    for i, caption in enumerate(CAPTIONS, 1):
        print(f"    {i}. \"{caption}\"")

    print("\n" + "=" * 70)
    print("Starting test cycle...")
    print("=" * 70)

    for round_num, caption in enumerate(CAPTIONS, 1):
        print(f"\n{'='*70}")
        print(f"ROUND {round_num}/{len(CAPTIONS)}")
        print(f"{'='*70}")
        print(f"Caption: \"{caption}\"")

        # Step 1: Get random GIF
        print("\n[Step 1] Getting random GIF from vault...")
        gif_id = await get_random_gif_id(TEST_ACCOUNT_ID)

        if not gif_id:
            print("  ERROR: Could not get GIF, skipping this round")
            continue

        # Step 2: Send message
        print(f"\n[Step 2] Sending message with GIF {gif_id}...")
        success, message_id = await send_message_with_gif(
            account_id=TEST_ACCOUNT_ID,
            user_id=TEST_USER_ID,
            caption=caption,
            gif_id=gif_id,
        )

        if not success:
            print("  ERROR: Failed to send message, skipping to next round")
            continue

        print(f"  SUCCESS: Message sent! (ID: {message_id})")

        # Step 3: Wait
        print(f"\n[Step 3] Waiting {AUTO_UNSEND_AFTER_MINUTES} minute(s) before unsending...")
        await wait_with_countdown(AUTO_UNSEND_AFTER_MINUTES)

        # Step 4: Unsend
        print(f"\n[Step 4] Unsending message {message_id}...")
        unsend_success = await unsend_message(TEST_ACCOUNT_ID, message_id)

        if unsend_success:
            print(f"  SUCCESS: Message unsent!")
        else:
            print(f"  WARNING: Failed to unsend message")

        # Small delay between rounds
        if round_num < len(CAPTIONS):
            print("\n  Moving to next round in 3 seconds...")
            await asyncio.sleep(3)

    print("\n" + "=" * 70)
    print("TEST COMPLETE!")
    print("=" * 70)
    print(f"\nCompleted {len(CAPTIONS)} rounds of caption rotation with random GIFs.")


async def main():
    """Main entry point."""
    print("\n" + "=" * 70)
    print("SCHEDULED MESSAGE TEST - CAPTION ROTATION")
    print("=" * 70)
    print("\nThis test will:")
    print(f"  1. Send '{CAPTIONS[0]}' with a random GIF")
    print(f"  2. Wait {AUTO_UNSEND_AFTER_MINUTES} minute(s), then unsend")
    print(f"  3. Send '{CAPTIONS[1]}' with a different random GIF")
    print(f"  4. Wait {AUTO_UNSEND_AFTER_MINUTES} minute(s), then unsend")
    print(f"  5. Send '{CAPTIONS[2]}' with a different random GIF")
    print(f"  6. Wait {AUTO_UNSEND_AFTER_MINUTES} minute(s), then unsend")
    print("\nPress Ctrl+C to cancel at any time.")

    try:
        await run_caption_rotation_test()
    except KeyboardInterrupt:
        print("\n\nTest cancelled by user.")


if __name__ == "__main__":
    asyncio.run(main())
