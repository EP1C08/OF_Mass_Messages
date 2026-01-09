"""
View Vault & Lists - Display vault folders and collections per creator.

Shows:
- Vault folders from OF Message Sender API (media)
- Collections/lists from local authentication (Fans, Following, etc.)
"""
import asyncio
import os
from dotenv import load_dotenv

from modules import VaultManager, authenticate_all, close_session, CollectionsManager

load_dotenv()


def format_media_counts(folder: dict) -> str:
    """Format media counts as (Xp/Xg/Xv).

    :param folder: Folder dictionary with photos_count, gifs_count, videos_count.
    :return: Formatted string like '150p/13g/25v'.
    """
    photos = folder.get("photos_count", 0)
    gifs = folder.get("gifs_count", 0)
    videos = folder.get("videos_count", 0)
    return f"{photos}p/{gifs}g/{videos}v"


async def view_vault_and_lists():
    """View vault folders and lists from all authenticated models."""
    print("Connecting to server...")

    # Initialize vault manager
    try:
        vault_manager = VaultManager()
    except ValueError as e:
        print(f"Error: {e}")
        print("Please set VAULT_API_KEY in your .env file")
        return

    # Health check
    health = await vault_manager.health_check()
    if not health:
        print("Failed to connect to vault API server")
        await vault_manager.close()
        return

    # Get models from API
    models = await vault_manager.get_models()
    if not models:
        print("No models found in vault API")
        await vault_manager.close()
        return

    # Count authenticated models
    auth_models = [m for m in models if m.get("authenticated")]
    print(f"Connected - {len(auth_models)} models\n")

    # Display models table
    print(f"{'Model':<15} Status")
    print("-" * 30)
    for model in models:
        label = model.get("label", model.get("model_id", "Unknown"))
        is_auth = model.get("authenticated", False)
        status = "active" if is_auth else "inactive"
        status_icon = "" if is_auth else ""
        print(f"{label:<15} {status_icon} {status}")

    print("\nLoading vault & lists for all models...")

    # Authenticate locally to get lists
    authenticated = await authenticate_all()
    successful_auth = [a for a in authenticated if a.get("success", True) and a.get("authed")]

    # Create lookup by model_id
    auth_by_model_id = {}
    for acc in successful_auth:
        auth = acc.get("authed")
        if auth:
            auth_by_model_id[str(auth.id)] = acc

    # Load vault folders and lists for each model
    model_data = {}

    for model in models:
        model_id = model.get("model_id")
        label = model.get("label", model_id)
        is_auth = model.get("authenticated", False)

        if not is_auth:
            continue

        # Get vault folders count
        folders = await vault_manager.get_vault_folders(model_id)
        vault_count = len(folders)

        # Get lists count from local auth
        lists_count = 0
        if model_id in auth_by_model_id:
            acc = auth_by_model_id[model_id]
            auth = acc.get("authed")
            coll_manager = CollectionsManager(auth)
            lists = await coll_manager.get_all_collections()
            lists_count = len(lists) if lists else 0

        model_data[model_id] = {
            "label": label,
            "folders": folders,
            "vault_count": vault_count,
            "lists_count": lists_count
        }

        print(f"  {label}... {vault_count} vaults, {lists_count} lists")

    # Now show detailed view per model
    print("\n" + "=" * 60)
    print("VAULT FOLDERS PER CREATOR")
    print("=" * 60)

    for model_id, data in model_data.items():
        label = data["label"]
        folders = data["folders"]

        print(f"\n[{label}] (model_id: {model_id})")

        if not folders:
            print("  No vault folders found")
            continue

        # Sort folders by name
        folders_sorted = sorted(folders, key=lambda f: f.get("name", "").lower())

        for folder in folders_sorted:
            name = folder.get("name", "Unnamed")
            counts = format_media_counts(folder)
            print(f"  {name} ({counts})")

    # Show aggregated lists
    print("\n" + "=" * 60)
    print("COLLECTIONS (AGGREGATED)")
    print("=" * 60)

    # Aggregate all lists across creators
    all_collections = []
    for model_id in auth_by_model_id:
        acc = auth_by_model_id[model_id]
        auth = acc.get("authed")
        account_name = acc.get("account_name", "Unknown")

        coll_manager = CollectionsManager(auth)
        lists = await coll_manager.get_all_collections()

        if lists:
            for list_item in lists:
                all_collections.append({
                    "account": account_name,
                    "name": list_item.get("name", "Unnamed"),
                    "usersCount": list_item.get("usersCount", 0),
                    "id": list_item.get("id")
                })

    # Aggregate by name
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

    # Sort: Fans first, Following second, then by count
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

    print()
    for coll in aggregated_list:
        name = coll["name"]
        count = coll["usersCount"]
        print(f"  {name} ({count:,} total)")

    # Cleanup
    await vault_manager.close()
    for acc in authenticated:
        if acc.get("authed"):
            await close_session(acc["authed"])


async def view_folder_media(model_id: str, list_id: int, limit: int = 20):
    """View media items in a specific vault folder.

    :param model_id: OnlyFans creator/model ID.
    :param list_id: Vault folder ID.
    :param limit: Number of items to display.
    """
    print(f"Loading media from folder {list_id} for model {model_id}...\n")

    try:
        manager = VaultManager()
    except ValueError as e:
        print(f"Error: {e}")
        return

    try:
        data = await manager.get_vault_media(model_id, list_id, limit=limit)

        media_items = data.get("media", [])
        total = data.get("total_count", 0)
        has_more = data.get("has_more", False)

        print(f"Showing {len(media_items)} of {total} items")
        print("-" * 60)

        for item in media_items:
            media_id = item.get("id")
            media_type = item.get("type", "unknown")
            duration = item.get("duration", 0)
            created = item.get("created_at", "")[:10]  # Just the date

            type_icon = {
                "photo": "",
                "video": "",
                "gif": "",
                "audio": ""
            }.get(media_type, "")

            duration_str = f" ({duration}s)" if duration > 0 else ""
            print(f"  {type_icon} {media_type:<6} ID: {media_id:<12} {duration_str} [{created}]")

        if has_more:
            print(f"\n... and {total - len(media_items)} more items")

    finally:
        await manager.close()


async def main():
    """Main menu."""
    print("""
    ======================================================
             VAULT & LISTS VIEWER

       View vault folders and collections per creator
    ======================================================
    """)

    print("What would you like to do?\n")
    print("1. View all vault folders & lists")
    print("2. View media in a specific folder")
    print("3. Exit")

    choice = input("\nEnter your choice (1-3): ").strip()

    if choice == "1":
        await view_vault_and_lists()

    elif choice == "2":
        model_id = input("\nEnter model ID: ").strip()
        list_id = input("Enter folder/list ID: ").strip()

        if not model_id or not list_id.isdigit():
            print("Invalid input")
            return

        limit_input = input("Number of items to show (default 20): ").strip()
        limit = int(limit_input) if limit_input.isdigit() else 20

        await view_folder_media(model_id, int(list_id), limit)

    elif choice == "3":
        print("\nGoodbye!")
        return

    else:
        print("\nInvalid choice")


if __name__ == "__main__":
    asyncio.run(main())
