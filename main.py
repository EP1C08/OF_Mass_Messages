"""
OF Mass Messages - Main Entry Point

Usage:
    python main.py                    # Interactive mode
    python main.py --dry-run          # Test without sending
    python main.py --test             # Run connection test only
"""
import asyncio
import argparse
from dotenv import load_dotenv

from modules import authenticate_all, close_session, MassMessenger

load_dotenv()

# Rate limiting settings
DELAY_BETWEEN_MESSAGES = 3.0
DELAY_FOR_LARGE_BATCHES = 10.0
LARGE_BATCH_THRESHOLD = 450
MAX_MESSAGE_LENGTH = 1000


async def test_connection() -> bool:
    """Test authentication and fetch chat/subscriber count."""
    print("=" * 50)
    print("CONNECTION TEST")
    print("=" * 50)

    authenticated = await authenticate_all()

    if not authenticated:
        print("Authentication failed")
        return False

    account_data = authenticated[0]
    auth = account_data["authed"]

    try:
        print(f"\nUser Info:")
        print(f"  Username: {auth.username}")
        print(f"  User ID: {auth.id}")

        # Check if creator account
        user = auth.user
        is_creator = user.is_performer() if user else False
        print(f"  Account Type: {'Creator' if is_creator else 'Subscriber'}")

        messenger = MassMessenger(auth)

        # Fetch chats (creators you've messaged/subscribed to)
        print("\nFetching chats...")
        recipients = await messenger.get_recipients_from_chats()

        if recipients:
            print(f"\nRecipient Preview (first 5):")
            for r in recipients[:5]:
                print(f"  - {r.username} (ID: {r.user_id})")

        print("\nConnection test PASSED")
        return True
    finally:
        await close_session(auth)


async def run_mass_message(dry_run: bool = False) -> None:
    """Run the mass messaging flow."""
    authenticated = await authenticate_all()

    if not authenticated:
        print("Authentication failed")
        return

    account_data = authenticated[0]
    auth = account_data["authed"]

    try:
        messenger = MassMessenger(
            auth,
            delay=DELAY_BETWEEN_MESSAGES,
            large_batch_delay=DELAY_FOR_LARGE_BATCHES,
            large_batch_threshold=LARGE_BATCH_THRESHOLD,
        )

        # Get recipients
        print("\nFetching recipients...")
        recipients = await messenger.get_subscribers()

        if not recipients:
            print("No recipients found.")
            return

        # Get message from user
        print("\n" + "=" * 50)
        print("COMPOSE MESSAGE")
        print("=" * 50)
        print("Placeholders: {name} = display name, {username} = username")
        print(f"Max length: {MAX_MESSAGE_LENGTH} characters")
        print("-" * 50)

        message = input("Enter your message:\n> ").strip()

        if not message:
            print("Message cannot be empty.")
            return

        if len(message) > MAX_MESSAGE_LENGTH:
            print(f"Message too long ({len(message)} > {MAX_MESSAGE_LENGTH})")
            return

        # Confirm
        print(f"\n{'[DRY RUN] ' if dry_run else ''}Ready to send to {len(recipients)} recipients")
        print(f"Message preview: {message[:100]}...")

        confirm = input("\nProceed? (yes/no): ").strip().lower()
        if confirm != "yes":
            print("Cancelled.")
            return

        # Send
        results = await messenger.send_mass_message(
            recipients=recipients,
            message_template=message,
            dry_run=dry_run,
        )

        messenger.print_summary(results)
    finally:
        await close_session(auth)


async def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="OF Mass Messages")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without sending")
    parser.add_argument("--test", action="store_true", help="Test connection only")
    args = parser.parse_args()

    if args.test:
        await test_connection()
    else:
        await run_mass_message(dry_run=args.dry_run)


if __name__ == "__main__":
    asyncio.run(main())
