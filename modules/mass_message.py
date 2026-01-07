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
        media_ids: list[int] | None = None,
        price: float = 0,
        previews: list[int] | None = None,
    ) -> dict[str, Any]:
        """
        Send a message to a single user.

        Args:
            user_id: Target user's ID
            text: Message content
            media_ids: Optional list of media IDs to attach
            price: PPV price (0 for free, 3-200 for paid)
            previews: Preview media IDs (required if price > 0)

        Returns:
            API response dict
        """
        kwargs: dict[str, Any] = {}

        if media_ids:
            kwargs["mediaFiles"] = media_ids

        if price > 0:
            kwargs["price"] = price
            if previews:
                kwargs["previews"] = previews

        return await self.auth.send_message(user_id, text, **kwargs)

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
                        error_msg = response["error"].get("message", "Unknown error")
                        print(f"  Error: {error_msg}")
                        results.append(MessageResult(user_id, username, False, error_msg))
                    else:
                        print(f"  Sent successfully")
                        results.append(MessageResult(user_id, username, True))

                except Exception as e:
                    print(f"  Exception: {e}")
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
