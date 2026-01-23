import base64
import os
import traceback

from dotenv import load_dotenv

from barfindr.encryption import base64url_decode, encryption_service

# Load environment variables from .env file
load_dotenv()

# Ensure the encryption key is available
if not os.getenv("VITE_CRYPTO_KEY"):
    os.environ["VITE_CRYPTO_KEY"] = os.getenv("ENCRYPTION_KEY")


def test_encryption():
    # Encrypted Spotify refresh token
    encrypted_token = "REDACTED"

    # Expected decrypted token
    expected_token = "REDACTED"

    try:
        # Decrypt the token
        decrypted = encryption_service.decrypt_token(encrypted_token)

        # Convert decrypted bytes to string
        decrypted_str = decrypted.decode()

        print("Encrypted Token:", encrypted_token)
        print("Decrypted Token:", decrypted_str)
        print("Expected Token: ", expected_token)
        print("Decryption Match:", decrypted_str == expected_token)

        # Additional verification
        print("\nDecryption Details:")
        print("Decrypted Token Length:", len(decrypted_str))
        print("Decrypted Token Hex:", decrypted.hex())

        # Verify Base64URL decoding
        base64url_decoded = base64url_decode(decrypted_str)
        print("\nBase64URL Decoding:")
        print("Decoded Hex:", base64url_decoded.hex())
        print("Decoded Length:", len(base64url_decoded))

    except Exception as e:
        print(f"Decryption Error: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    test_encryption()
