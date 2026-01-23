import base64
import hashlib
import os
from pathlib import Path
from typing import Optional, Union

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv

# Get the directory of the current file
current_dir = Path(__file__).resolve().parent
# Go up to the project root
project_root = current_dir.parent.parent
# Load .env file from project root
load_dotenv(os.path.join(project_root, ".env"))


def base64url_encode(input_bytes: Union[str, bytes]) -> str:
    """
    Encode bytes to Base64URL string
    """
    if isinstance(input_bytes, str):
        input_bytes = input_bytes.encode()

    encoded = base64.b64encode(input_bytes)
    return encoded.decode("utf-8").replace("+", "-").replace("/", "_").rstrip("=")


def base64url_decode(input_str: str) -> bytes:
    """
    Decode Base64URL encoded string
    """
    # Add padding if needed
    padding = 4 - (len(input_str) % 4)
    if padding != 4:
        input_str += "=" * padding

    # Replace URL-safe characters
    input_str = input_str.replace("-", "+").replace("_", "/")

    return base64.b64decode(input_str)


def derive_key(raw_key: str) -> bytes:
    """
    Derive a 32-byte key using the same method as the TypeScript implementation
    """
    # Create SHA-256 hash of the key
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    # Convert hex to bytes and take first 32 bytes
    return bytes.fromhex(key_hash)[:32]


class EncryptionService:
    _instance = None

    def __new__(cls):
        if not cls._instance:
            cls._instance = super(EncryptionService, cls).__new__(cls)
        return cls._instance

    def __init__(self, key: Optional[str] = None):
        if not hasattr(self, "initialized"):
            # Get key from environment or parameter
            raw_key = key or os.getenv("ENCRYPTION_KEY")

            if not raw_key:
                raise ValueError("Encryption key is missing")

            # Derive the key using the same method as TypeScript
            self.key = derive_key(raw_key)
            self.initialized = True

    def encrypt_token(self, token_bytes: bytes) -> str:
        """
        Encrypts a byte string using AES-256-GCM
        Returns a string in format: iv.authTag.encryptedData (all base64 encoded)
        """
        if not token_bytes:
            raise ValueError("Cannot encrypt empty value")

        try:
            # Generate a random 16-byte IV
            iv = os.urandom(16)

            # Create cipher and encrypt
            aesgcm = AESGCM(self.key)
            encrypted_data = aesgcm.encrypt(iv, token_bytes, None)

            # In AESGCM, the auth tag is the last 16 bytes
            ciphertext = encrypted_data[:-16]
            auth_tag = encrypted_data[-16:]

            # Encode components to base64
            iv_b64 = base64.b64encode(iv).decode()
            auth_tag_b64 = base64.b64encode(auth_tag).decode()
            ciphertext_b64 = base64.b64encode(ciphertext).decode()

            # Return in the same format as TypeScript
            return f"{iv_b64}.{auth_tag_b64}.{ciphertext_b64}"

        except Exception as e:
            import structlog

            logger = structlog.get_logger()
            logger.error("Encryption error", error=str(e))
            raise ValueError(f"Failed to encrypt data: {str(e)}")

    def decrypt_token(self, encrypted_text: str) -> bytes:
        """
        Decrypts a string value encrypted with encrypt_token
        Handles both traditional encrypted tokens and Base64URL encoded tokens
        """
        if not encrypted_text:
            raise ValueError("Cannot decrypt empty value")

        try:
            # If the token looks like a Base64URL encoded token
            if "." not in encrypted_text:
                # If it's a pure Base64URL token, return as-is
                return base64url_decode(encrypted_text)

            # Split the components
            parts = encrypted_text.split(".")

            if len(parts) != 3:
                raise ValueError("Invalid encrypted format")

            iv_b64, auth_tag_b64, ciphertext_b64 = parts

            # Decode from base64
            iv = base64.b64decode(iv_b64)
            auth_tag = base64.b64decode(auth_tag_b64)
            ciphertext = base64.b64decode(ciphertext_b64)

            # Combine ciphertext and auth tag
            encrypted_data = ciphertext + auth_tag

            # Decrypt
            aesgcm = AESGCM(self.key)
            decrypted = aesgcm.decrypt(iv, encrypted_data, None)

            return decrypted

        except Exception as e:
            import structlog

            logger = structlog.get_logger()
            logger.error("Decryption error", error=str(e))
            raise ValueError(f"Failed to decrypt data: {str(e)}")

    def prepare_token_for_encryption(self, token: str) -> bytes:
        """
        Prepare a token for encryption by converting to Base64URL encoded bytes
        """
        # Convert to Base64URL encoded bytes
        return base64url_encode(token.encode()).encode()


# Create a singleton instance
encryption_service = EncryptionService()
