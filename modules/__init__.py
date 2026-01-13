"""
OF Mass Messages - Modules Package
"""
from modules.auth import authenticate_from_db, authenticate_single, authenticate_all, close_session
from modules.db_credential_loader import DatabaseCredentialLoader, load_credentials_from_db, list_models_from_db
from modules.encryption import EncryptionManager
from modules.gologin_manager import GoLoginManager, get_gologin_credentials, get_gologin_proxy
from modules.mass_message import MassMessenger, Recipient, MessageResult
from modules.collections import CollectionsManager
from modules.vault_manager import VaultManager, get_vault_manager
from modules.firebase_client import get_firestore_client, initialize_firebase
from modules.scheduled_message_service import ScheduledMessageService
from modules.scheduler import start_scheduler, stop_scheduler, schedule_message_job, cancel_message_job

__all__ = [
    # Auth
    "authenticate_from_db",
    "authenticate_single",
    "authenticate_all",
    "close_session",
    # Database
    "DatabaseCredentialLoader",
    "load_credentials_from_db",
    "list_models_from_db",
    # Encryption
    "EncryptionManager",
    # GoLogin
    "GoLoginManager",
    "get_gologin_credentials",
    "get_gologin_proxy",
    # Messaging
    "MassMessenger",
    "Recipient",
    "MessageResult",
    # Collections
    "CollectionsManager",
    # Vault
    "VaultManager",
    "get_vault_manager",
    # Firebase
    "get_firestore_client",
    "initialize_firebase",
    # Scheduled Messages
    "ScheduledMessageService",
    "start_scheduler",
    "stop_scheduler",
    "schedule_message_job",
    "cancel_message_job",
]
