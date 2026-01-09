"""
View and Manage OnlyFans Collections (Lists)
Shows all your lists and fans in each list
"""
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv

from modules import authenticate_all, close_session, CollectionsManager

load_dotenv()


@asynccontextmanager
async def get_first_authenticated():
    """Context manager that authenticates all accounts and yields the first successful one.

    Properly closes all sessions when done.
    """
    authenticated = await authenticate_all()

    if not authenticated:
        raise RuntimeError("Authentication failed")

    # Filter to only successful authentications
    successful = [a for a in authenticated if a.get("success", True) and a.get("authed")]

    if not successful:
        # Close all sessions before raising
        for account in authenticated:
            if account.get("authed"):
                await close_session(account["authed"])
        raise RuntimeError("No accounts authenticated successfully")

    try:
        yield successful[0]
    finally:
        # Close ALL authenticated sessions
        for account in authenticated:
            if account.get("authed"):
                await close_session(account["authed"])


async def view_all_collections():
    """View all collections from all authenticated creators compiled into one list."""
    print("=" * 70)
    print("VIEWING ONLYFANS COLLECTIONS (LISTS)")
    print("=" * 70)

    authenticated = await authenticate_all()

    if not authenticated:
        print("Authentication failed")
        return

    # Filter to only successful authentications
    successful = [a for a in authenticated if a.get("success", True) and a.get("authed")]

    if not successful:
        print("No accounts authenticated successfully")
        # Close all sessions
        for account in authenticated:
            if account.get("authed"):
                await close_session(account["authed"])
        return

    # Compile all collections from all creators
    all_collections = []

    try:
        print(f"\nFetching collections from {len(successful)} creator(s)...\n")

        for account_data in successful:
            auth = account_data["authed"]
            account_name = account_data["account_name"]

            manager = CollectionsManager(auth)

            lists = await manager.get_all_collections()

            if lists:
                for list_item in lists:
                    all_collections.append({
                        "account": account_name,
                        "name": list_item.get("name", "Unnamed"),
                        "usersCount": list_item.get("usersCount", 0),
                        "id": list_item.get("id")
                    })

        if not all_collections:
            print("No collections found across all creators")
            return

        # Aggregate collections with the same name
        aggregated = {}
        for coll in all_collections:
            name = coll["name"]
            if name in aggregated:
                aggregated[name]["usersCount"] += coll["usersCount"]
                aggregated[name]["accounts"].append(coll["account"])
            else:
                aggregated[name] = {
                    "name": name,
                    "usersCount": coll["usersCount"],
                    "accounts": [coll["account"]]
                }

        # Convert to list and sort: Fans first, Following second, then by count descending
        aggregated_list = list(aggregated.values())

        def sort_key(x):
            name = x["name"]
            if name == "Fans":
                return (0, -x["usersCount"])
            elif name == "Following":
                return (1, -x["usersCount"])
            else:
                return (2, -x["usersCount"])

        aggregated_list.sort(key=sort_key)

        print(f"Found {len(aggregated_list)} unique collection(s) from {len(successful)} creator(s):\n")

        for coll in aggregated_list:
            name = coll["name"]
            count = coll["usersCount"]
            print(f"  ○ {name} ({count:,} total)")

    finally:
        # Close ALL authenticated sessions
        for account in authenticated:
            if account.get("authed"):
                await close_session(account["authed"])


async def view_collection_details(list_id: int):
    """View detailed information about a specific collection."""
    print("=" * 70)
    print(f"COLLECTION DETAILS - ID: {list_id}")
    print("=" * 70)

    try:
        async with get_first_authenticated() as account_data:
            auth = account_data["authed"]
            account_name = account_data["account_name"]

            manager = CollectionsManager(auth)
            print(f"\n[{account_name}] Fetching collection details...")

            target_list = await manager.get_collection_by_id(list_id)

            if not target_list:
                print(f"Collection with ID {list_id} not found")
                return

            list_name = target_list.get("name", "Unnamed")
            users_count = target_list.get("usersCount", 0)

            print(f"\nCollection: {list_name}")
            print(f"   ID: {list_id}")
            print(f"   Total fans: {users_count}")

            if users_count > 0:
                print(f"\nFetching all fans in this collection...")
                users = await manager.get_collection_users(list_id)

                print(f"\n{'Username':<20} | {'Name':<30} | {'Fan ID':<15}")
                print("-" * 70)

                for user in users:
                    username = user.get("username", "Unknown")
                    name = user.get("name", "")
                    fan_id = user.get("id", "")
                    print(f"{username:<20} | {name:<30} | {str(fan_id):<15}")

                print(f"\nTotal: {len(users)} fans")
    except RuntimeError as e:
        print(str(e))


async def search_fan_in_collections(fan_id: str):
    """Search which collections a fan belongs to."""
    print("=" * 70)
    print(f"SEARCHING FAN IN COLLECTIONS - ID: {fan_id}")
    print("=" * 70)

    try:
        async with get_first_authenticated() as account_data:
            auth = account_data["authed"]
            account_name = account_data["account_name"]

            manager = CollectionsManager(auth)
            print(f"\n[{account_name}] Searching collections...")

            found_in = await manager.find_user_collections(int(fan_id))

            if found_in:
                print(f"\nFan {fan_id} found in {len(found_in)} collection(s):")
                for item in found_in:
                    print(f"\n  {item.get('name', 'Unnamed')} (ID: {item.get('id')})")
            else:
                print(f"\nFan {fan_id} not found in any collections")
    except RuntimeError as e:
        print(str(e))


async def create_collection(name: str):
    """Create a new collection/list."""
    print("=" * 70)
    print(f"CREATING NEW COLLECTION: {name}")
    print("=" * 70)

    try:
        async with get_first_authenticated() as account_data:
            auth = account_data["authed"]
            account_name = account_data["account_name"]

            manager = CollectionsManager(auth)
            print(f"\n[{account_name}] Creating collection '{name}'...")

            result = await manager.create_collection(name)

            if result:
                print(f"\nCollection created successfully!")
                print(f"   Name: {result.get('name', name)}")
                print(f"   ID: {result.get('id')}")
                return result
            else:
                print(f"\nFailed to create collection")
                return None
    except RuntimeError as e:
        print(str(e))
        return None


async def add_fan_to_collection(fan_id: str, collection_name: str):
    """Add a fan to a collection."""
    print("=" * 70)
    print("ADDING FAN TO COLLECTION")
    print("=" * 70)

    try:
        async with get_first_authenticated() as account_data:
            auth = account_data["authed"]
            account_name = account_data["account_name"]

            manager = CollectionsManager(auth)

            print(f"\n[{account_name}] Fetching fan details...")
            target = await auth.get_user(fan_id)

            if not target:
                print(f"Fan not found: {fan_id}")
                return False

            print(f"Found fan: {target.username} ({target.name})")

            print(f"\n[{account_name}] Fetching collection details...")
            target_list = await manager.get_collection_by_name(collection_name)

            if not target_list:
                print(f"Collection '{collection_name}' not found")
                lists = await manager.get_all_collections()
                if lists:
                    print(f"\nAvailable collections:")
                    for list_item in lists:
                        print(f"   - {list_item.get('name', 'Unnamed')}")
                return False

            list_id = target_list.get("id")
            list_name = target_list.get("name", "Unnamed")
            print(f"Found collection: {list_name} (ID: {list_id})")

            print(f"\n[{account_name}] Checking if fan is already in collection...")
            if await manager.is_user_in_collection(int(fan_id), list_id):
                print(f"Fan {target.username} is already in collection '{list_name}'")
                return True

            print(f"\nAdding {target.username} to '{list_name}'...")
            success = await manager.add_user_to_collection(int(fan_id), list_id)

            if success:
                print(f"Successfully added {target.username} to '{list_name}'!")
                return True
            else:
                print(f"Failed to add fan to collection")
                return False
    except RuntimeError as e:
        print(str(e))
        return False


async def remove_fan_from_collection(fan_id: str, collection_name: str):
    """Remove a fan from a collection."""
    print("=" * 70)
    print("REMOVING FAN FROM COLLECTION")
    print("=" * 70)

    try:
        async with get_first_authenticated() as account_data:
            auth = account_data["authed"]
            account_name = account_data["account_name"]

            manager = CollectionsManager(auth)

            print(f"\n[{account_name}] Fetching fan details...")
            target = await auth.get_user(fan_id)

            if not target:
                print(f"Fan not found: {fan_id}")
                return False

            print(f"Found fan: {target.username} ({target.name})")

            print(f"\n[{account_name}] Fetching collection details...")
            target_list = await manager.get_collection_by_name(collection_name)

            if not target_list:
                print(f"Collection '{collection_name}' not found")
                lists = await manager.get_all_collections()
                if lists:
                    print(f"\nAvailable collections:")
                    for list_item in lists:
                        print(f"   - {list_item.get('name', 'Unnamed')}")
                return False

            list_id = target_list.get("id")
            list_name = target_list.get("name", "Unnamed")
            print(f"Found collection: {list_name} (ID: {list_id})")

            print(f"\nRemoving {target.username} from '{list_name}'...")
            success = await manager.remove_user_from_collection(int(fan_id), list_id)

            if success:
                print(f"Successfully removed {target.username} from '{list_name}'!")
                return True
            else:
                print(f"Failed to remove fan from collection")
                return False
    except RuntimeError as e:
        print(str(e))
        return False


async def delete_collection(list_id: int):
    """Delete a collection."""
    print("=" * 70)
    print("DELETING COLLECTION")
    print("=" * 70)

    try:
        async with get_first_authenticated() as account_data:
            auth = account_data["authed"]
            account_name = account_data["account_name"]

            manager = CollectionsManager(auth)

            print(f"\n[{account_name}] Fetching collection details...")
            target_list = await manager.get_collection_by_id(list_id)

            if not target_list:
                print(f"Collection with ID {list_id} not found")
                return False

            list_name = target_list.get("name", "Unnamed")
            users_count = target_list.get("usersCount", 0)

            print(f"Found collection: {list_name}")
            print(f"   Fans in collection: {users_count}")

            confirm = input(f"\nDelete collection '{list_name}'? (yes/no): ")

            if confirm.lower() not in ['yes', 'y']:
                print("Cancelled")
                return False

            print(f"\nDeleting collection '{list_name}'...")
            success = await manager.delete_collection(list_id)

            if success:
                print(f"Successfully deleted collection '{list_name}'!")
                return True
            else:
                print(f"Failed to delete collection")
                return False
    except RuntimeError as e:
        print(str(e))
        return False


async def main():
    """Main menu."""
    print("""
    ======================================================
             ONLYFANS COLLECTIONS MANAGER

       View and manage your fan collections/lists
    ======================================================
    """)

    print("What would you like to do?\n")
    print("1. View all collections")
    print("2. View specific collection details")
    print("3. Search which collections a fan is in")
    print("4. Create new collection")
    print("5. Add fan to collection")
    print("6. Remove fan from collection")
    print("7. Delete collection")
    print("8. Exit")

    choice = input("\nEnter your choice (1-8): ").strip()

    if choice == "1":
        await view_all_collections()

    elif choice == "2":
        list_id = input("\nEnter collection ID: ").strip()
        if not list_id.isdigit():
            print("Invalid collection ID")
            return
        await view_collection_details(int(list_id))

    elif choice == "3":
        fan_id = input("\nEnter fan ID to search: ").strip()
        if not fan_id:
            print("No fan ID provided")
            return
        await search_fan_in_collections(fan_id)

    elif choice == "4":
        name = input("\nEnter collection name: ").strip()
        if not name:
            print("No name provided")
            return
        await create_collection(name)

    elif choice == "5":
        fan_id = input("\nEnter fan ID: ").strip()
        collection_name = input("Enter collection name: ").strip()
        if not fan_id or not collection_name:
            print("Invalid input")
            return
        await add_fan_to_collection(fan_id, collection_name)

    elif choice == "6":
        fan_id = input("\nEnter fan ID: ").strip()
        collection_name = input("Enter collection name: ").strip()
        if not fan_id or not collection_name:
            print("Invalid input")
            return
        await remove_fan_from_collection(fan_id, collection_name)

    elif choice == "7":
        list_id = input("\nEnter collection ID to delete: ").strip()
        if not list_id.isdigit():
            print("Invalid collection ID")
            return
        await delete_collection(int(list_id))

    elif choice == "8":
        print("\nGoodbye!")
        return

    else:
        print("\nInvalid choice")


if __name__ == "__main__":
    asyncio.run(main())
