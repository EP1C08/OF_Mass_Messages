"""
OF Mass Messages - Modules Package
"""
from modules.auth import authenticate_from_db, authenticate_single, authenticate_all, close_session
from modules.db_credential_loader import DatabaseCredentialLoader, load_credentials_from_db
from modules.encryption import EncryptionManager
from modules.gologin_manager import GoLoginManager, get_gologin_credentials, get_gologin_proxy
from modules.mass_message import MassMessenger, Recipient, MessageResult
from modules.collections import CollectionsManager
from modules.vault_manager import VaultManager, get_vault_manager

__all__ = [
    "authenticate_from_db",
    "authenticate_single",
    "authenticate_all",
    "close_session",
    "DatabaseCredentialLoader",
    "load_credentials_from_db",
    "EncryptionManager",
    "GoLoginManager",
    "get_gologin_credentials",
    "get_gologin_proxy",
    "MassMessenger",
    "Recipient",
    "MessageResult",
    "CollectionsManager",
    "VaultManager",
    "get_vault_manager",
]
