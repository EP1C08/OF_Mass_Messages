"""
Test if chat_messages_count gives us total messages without fetching all messages.
"""
import asyncio
from dotenv import load_dotenv

from modules import authenticate_from_db, close_session

load_dotenv()

TEST_FAN_ID = 528621767
TEST_MODEL = "ayumi_2"


async def test_message_count():
    """Test chat_messages_count field."""
    print(f"Authenticating {TEST_MODEL}...")

    authenticated = await authenticate_from_db(model_id=TEST_MODEL)
    successful = [a for a in authenticated if a.get("success", True) and a.get("authed")]

    if not successful:
        print("Authentication failed")
        return

    acc = successful[0]
    auth = acc.get("authed")
    account_name = acc.get("account_name", "Unknown")

    print(f"Testing with [{account_name}]")
    print(f"Fan ID: {TEST_FAN_ID}\n")

    # Get user directly
    user = await auth.get_user(TEST_FAN_ID)

    if not user:
        print("User not found")
        return

    username = user.username or "Unknown"
    msg_count = getattr(user, 'chat_messages_count', 'NOT FOUND')

    print(f"Username: {username}")
    print(f"chat_messages_count: {msg_count}")

    # Cleanup
    await close_session(auth)


if __name__ == "__main__":
    asyncio.run(test_message_count())
