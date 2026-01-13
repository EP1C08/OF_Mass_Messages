"""Mass messaging functionality for OnlyFans."""
import asyncio
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ultima_scraper_api.apis.onlyfans.classes.auth_model import OnlyFansAuthModel
    from ultima_scraper_api.apis.onlyfans.classes.chat_model import ChatModel


@dataclass
class MessageResult:
    """Result of a message send attempt."""
    user_id: int
    username: str
    success: bool
    error: str | None = None
    message_id: int | None = None  # OF message ID for unsend tracking


@dataclass
class Recipient:
    """Simple recipient data structure."""
    user_id: int
    username: str
    name: str


class MassMessenger:
    """Handles mass messaging to OnlyFans users."""

    def __init__(
        self,
        auth: "OnlyFansAuthModel",
        delay: float = 3.0,
        large_batch_delay: float = 10.0,
        large_batch_threshold: int = 450,
    ):
        self.auth = auth
        self.delay = delay
        self.large_batch_delay = large_batch_delay
        self.large_batch_threshold = large_batch_threshold

    async def get_chats(self) -> list["ChatModel"]:
        """Fetch all chats."""
        chats = await self.auth.get_chats()
        print(f"Found {len(chats)} chats")
        return chats

    async def get_recipients_from_chats(self) -> list[Recipient]:
        """Get recipient list from existing chats."""
        chats = await self.get_chats()
        recipients = []
        for chat in chats:
            if chat.user:
                recipients.append(Recipient(
                    user_id=chat.user.id,
                    username=chat.user.username,
                    name=chat.user.name or chat.user.username,
                ))
        return recipients

    async def get_subscribers(self) -> list[Recipient]:
        """
        Fetch subscribers (people subscribed to you).
        Only works for creator accounts.
        """
        try:
            subscriptions = await self.auth.get_subscriptions(sub_type="active")
            recipients = []
            for sub in subscriptions:
                if sub.user:
                    recipients.append(Recipient(
                        user_id=sub.user.id,
                        username=sub.user.username,
                        name=sub.user.name or sub.user.username,
                    ))
            print(f"Found {len(recipients)} active subscribers")
            return recipients
        except (KeyError, Exception) as e:
            print(f"Could not fetch subscribers: {e}")
            print("Falling back to chats...")
            return await self.get_recipients_from_chats()

    def personalize_message(self, template: str, username: str, name: str) -> str:
        """
        Replace placeholders in message template.

        Placeholders:
            {name} - User's display name
            {username} - User's username
        """
        return template.replace("{name}", name or username).replace("{username}", username)

    async def send_message(
        self,
        user_id: int,
        text: str,
        media_ids: list[int | str] | None = None,
        price: float = 0,
        previews: list[int | str] | None = None,
    ) -> dict[str, Any]:
        """
        Send a message to a single user using direct API call.

        Args:
            user_id: Target user's ID
            text: Message content
            media_ids: Optional list of media IDs to attach
            price: PPV price (0 for free, 3-200 for paid)
            previews: Preview media IDs (required if price > 0)

        Returns:
            API response dict with 'id' on success or 'error' on failure
        """
        # Get target user and their requester session
        target = await self.auth.get_user(user_id)
        if not target:
            return {"error": f"User {user_id} not found"}

        target_authed_session = target.get_requester()
        endpoint = f"https://onlyfans.com/api2/v2/chats/{user_id}/messages"

        # Build payload - OnlyFans API expects mediaFiles as list of STRING IDs
        payload: dict[str, Any] = {
            "text": text,
            "lockedText": False,
            "mediaFiles": [str(mid) for mid in media_ids] if media_ids else [],
            "price": price if price > 0 else 0,
            "isCouplePeopleMedia": False,
            "isForward": False
        }

        # Add previews if price > 0
        if price > 0 and previews:
            payload["previews"] = [int(p) for p in previews]

        # Get required headers
        headers = await target_authed_session.session_rules(endpoint)
        headers["accept"] = "application/json, text/plain, */*"
        headers["Connection"] = "keep-alive"

        # Make the request
        response = await target_authed_session.active_session.post(
            endpoint, headers=headers, json=payload
        )

        if response.status == 200:
            return await response.json()
        else:
            response_text = await response.text()
            return {"error": {"code": response.status, "message": response_text}}

    async def unsend_message(self, message_id: int) -> bool:
        """Unsend a previously sent message.

        Args:
            message_id: The OnlyFans message ID to unsend

        Returns:
            True if successfully unsent, False otherwise
        """
        # Correct endpoint: DELETE /api2/v2/messages/{message_id}
        endpoint = f"https://onlyfans.com/api2/v2/messages/{message_id}"
        try:
            requester = self.auth.get_requester()
            headers = await requester.session_rules(endpoint)
            headers["accept"] = "application/json, text/plain, */*"
            headers["Connection"] = "keep-alive"

            response = await requester.active_session.delete(endpoint, headers=headers)

            if response.status == 200:
                return True
            else:
                response_text = await response.text()
                print(f"Failed to unsend message {message_id}: Status {response.status}, Response: {response_text[:200]}")
                return False
        except Exception as e:
            print(f"Failed to unsend message {message_id}: {e}")
            return False

    async def send_mass_message(
        self,
        recipients: list[Recipient],
        message_template: str,
        media_ids: list[int] | None = None,
        price: float = 0,
        previews: list[int] | None = None,
        dry_run: bool = False,
    ) -> list[MessageResult]:
        """
        Send a message to multiple recipients with rate limiting.

        Args:
            recipients: List of recipients to message
            message_template: Message with optional {name}/{username} placeholders
            media_ids: Optional media to attach
            price: PPV price
            previews: Preview media IDs
            dry_run: If True, simulate without sending

        Returns:
            List of MessageResult for each recipient
        """
        results: list[MessageResult] = []
        total = len(recipients)
        delay = self.large_batch_delay if total > self.large_batch_threshold else self.delay

        print(f"\n{'[DRY RUN] ' if dry_run else ''}Sending to {total} recipients...")
        print(f"Delay between messages: {delay}s\n")

        for i, recipient in enumerate(recipients, 1):
            username = recipient.username
            name = recipient.name
            user_id = recipient.user_id

            personalized = self.personalize_message(message_template, username, name)

            print(f"[{i}/{total}] {username} (ID: {user_id})")

            if dry_run:
                print(f"  Would send: {personalized[:50]}...")
                results.append(MessageResult(user_id, username, True))
            else:
                try:
                    response = await self.send_message(
                        user_id=user_id,
                        text=personalized,
                        media_ids=media_ids,
                        price=price,
                        previews=previews,
                    )

                    if "error" in response:
                        error_obj = response["error"]
                        if isinstance(error_obj, dict):
                            error_msg = error_obj.get("message", str(error_obj))
                        else:
                            error_msg = str(error_obj)
                        print(f"  Error: {error_msg}")
                        print(f"  Full response: {response}")
                        results.append(MessageResult(user_id, username, False, error_msg))
                    else:
                        # Extract message ID from response for unsend tracking
                        msg_id = response.get("id") or response.get("message_id")
                        print(f"  Sent successfully (ID: {msg_id})")
                        results.append(MessageResult(user_id, username, True, message_id=msg_id))

                except Exception as e:
                    import traceback
                    print(f"  Exception: {e}")
                    print(f"  Traceback: {traceback.format_exc()}")
                    results.append(MessageResult(user_id, username, False, str(e)))

            if i < total:
                await asyncio.sleep(delay)

        return results

    def print_summary(self, results: list[MessageResult]) -> None:
        """Print summary of mass message results."""
        total = len(results)
        successful = sum(1 for r in results if r.success)
        failed = total - successful

        print("\n" + "=" * 50)
        print("MASS MESSAGE SUMMARY")
        print("=" * 50)
        print(f"Total: {total}")
        print(f"Successful: {successful}")
        print(f"Failed: {failed}")

        if failed > 0:
            print("\nFailed messages:")
            for r in results:
                if not r.success:
                    print(f"  - {r.username}: {r.error}")
