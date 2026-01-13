from typing import TYPE_CHECKING, Any, Union

if TYPE_CHECKING:
    from ultima_scraper_api.apis.onlyfans.classes.auth_model import OnlyFansAuthModel


class CollectionsManager:

    def __init__(self, auth: "OnlyFansAuthModel"):
        self.auth = auth

    async def get_all_collections(self) -> list[dict[str, Any]]:
        lists = await self.auth.get_lists()
        return lists or []

    async def get_collection_by_id(self, list_id: Union[int, str]) -> dict[str, Any] | None:
        lists = await self.get_all_collections()
        for list_item in lists:
            if str(list_item.get("id")) == str(list_id):
                return list_item
        return None

    async def get_collection_by_name(self, name: str) -> dict[str, Any] | None:
        lists = await self.get_all_collections()
        for list_item in lists:
            if list_item.get("name", "").lower() == name.lower():
                return list_item
        return None

    async def get_collection_users(
        self,
        list_id: Union[int, str],
        limit: int = 100,
        offset: int = 0,
        fetch_all: bool = True
    ) -> list[dict[str, Any]]:
        users = await self.auth.get_lists_users(
            list_id,
            check=not fetch_all,
            limit=limit,
            offset=offset
        )
        return users or []

    async def create_collection(self, name: str) -> dict[str, Any] | None:
        url = "https://onlyfans.com/api2/v2/lists"
        payload = {"name": name}

        try:
            result = await self.auth.get_requester().json_request(
                url, method="POST", payload=payload
            )
            return result if result and "id" in result else None
        except Exception:
            return None

    async def delete_collection(self, list_id: Union[int, str]) -> bool:
        url = f"https://onlyfans.com/api2/v2/lists/{list_id}"

        try:
            await self.auth.get_requester().json_request(url, method="DELETE")
            return True
        except Exception:
            return False

    async def add_user_to_collection(self, user_id: int, list_id: Union[int, str]) -> bool:
        url = f"https://onlyfans.com/api2/v2/lists/{list_id}/users"

        payloads = [
            {"ids": [user_id]},
            {"userIds": [user_id]},
            {"userId": user_id},
        ]

        requester = self.auth.get_requester()

        for payload in payloads:
            try:
                headers = await requester.session_rules(url)
                headers["accept"] = "application/json, text/plain, */*"

                response = await requester.active_session.post(
                    url, headers=headers, json=payload
                )

                if response.status == 200:
                    return True
            except Exception:
                continue

        return False

    async def remove_user_from_collection(self, user_id: int, list_id: Union[int, str]) -> bool:
        url = f"https://onlyfans.com/api2/v2/lists/{list_id}/users/{user_id}"

        try:
            requester = self.auth.get_requester()
            headers = await requester.session_rules(url)
            headers["accept"] = "application/json, text/plain, */*"

            response = await requester.active_session.delete(url, headers=headers)
            return response.status == 200
        except Exception:
            return False

    async def is_user_in_collection(self, user_id: int, list_id: Union[int, str]) -> bool:
        users = await self.get_collection_users(list_id)
        return any(str(u.get("id")) == str(user_id) for u in users)

    async def find_user_collections(self, user_id: int) -> list[dict[str, Any]]:
        found_in = []
        lists = await self.get_all_collections()

        for list_item in lists:
            list_id = list_item.get("id")
            users_count = list_item.get("usersCount", 0)

            if users_count > 0:
                if await self.is_user_in_collection(user_id, list_id):
                    found_in.append(list_item)

        return found_in
