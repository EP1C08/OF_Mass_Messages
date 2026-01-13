"""Firebase/Firestore client initialization."""
import os
import logging
from pathlib import Path
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import AsyncClient
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

_firestore_client: Optional[AsyncClient] = None
_credentials_path: Optional[str] = None

# Project root directory (parent of modules/)
PROJECT_ROOT = Path(__file__).parent.parent


def _get_credentials_path() -> Optional[str]:
    """Get resolved credentials path."""
    cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
    if not cred_path:
        return None

    cred_path_obj = Path(cred_path)
    if not cred_path_obj.is_absolute():
        cred_path_obj = PROJECT_ROOT / cred_path

    return str(cred_path_obj.resolve())


def initialize_firebase() -> None:
    """Initialize Firebase Admin SDK.

    Uses FIREBASE_SERVICE_ACCOUNT_PATH env var for explicit path,
    or falls back to Application Default Credentials.
    """
    global _credentials_path

    if firebase_admin._apps:
        logger.debug("Firebase already initialized")
        return

    _credentials_path = _get_credentials_path()

    if _credentials_path:
        if not os.path.exists(_credentials_path):
            raise FileNotFoundError(f"Firebase service account file not found: {_credentials_path}")
        cred = credentials.Certificate(_credentials_path)
        firebase_admin.initialize_app(cred)
        logger.info(f"Firebase initialized with service account: {_credentials_path}")
    else:
        # Use Application Default Credentials
        firebase_admin.initialize_app()
        logger.info("Firebase initialized with Application Default Credentials")


def get_firestore_client() -> AsyncClient:
    """Get async Firestore client.

    Returns:
        AsyncClient: Firestore async client instance
    """
    global _firestore_client

    if _firestore_client is None:
        initialize_firebase()

        # Create AsyncClient with explicit credentials if available
        if _credentials_path:
            creds = service_account.Credentials.from_service_account_file(_credentials_path)
            _firestore_client = AsyncClient(credentials=creds)
        else:
            _firestore_client = AsyncClient()

        logger.info("Firestore async client created")

    return _firestore_client


async def close_firestore_client() -> None:
    """Close the Firestore client connection."""
    global _firestore_client

    if _firestore_client is not None:
        # AsyncClient doesn't have an explicit close, but we reset the reference
        _firestore_client = None
        logger.info("Firestore client reference cleared")
