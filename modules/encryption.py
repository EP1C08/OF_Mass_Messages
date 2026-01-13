import json
import logging
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


class EncryptionManager:

    def __init__(self, encryption_key: Optional[str] = None):
        if encryption_key is None:
            encryption_key = os.getenv("ENCRYPTION_KEY")

        if not encryption_key:
            raise ValueError("ENCRYPTION_KEY must be provided or set in environment variables")

        try:
            self.cipher = Fernet(encryption_key.encode())
            logger.info("Encryption manager initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Fernet cipher: {e}")
            raise

    def decrypt(self, encrypted_data: str) -> Optional[str]:
        if not encrypted_data:
            return None

        try:
            decrypted_bytes = self.cipher.decrypt(encrypted_data.encode())
            return decrypted_bytes.decode('utf-8')
        except InvalidToken:
            logger.error("Invalid encryption token - data may be corrupted or key is incorrect")
            return None
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            return None

    def decrypt_json(self, encrypted_json: str) -> Optional[dict]:
        decrypted_str = self.decrypt(encrypted_json)
        if not decrypted_str:
            return None

        try:
            return json.loads(decrypted_str)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse decrypted JSON: {e}")
            return None


def get_encryption_manager() -> EncryptionManager:
    return EncryptionManager()
