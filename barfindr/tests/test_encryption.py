import os
from dotenv import load_dotenv
from barfindr.encryption import encryption_service, base64url_decode
import base64
import traceback

# Load environment variables from .env file
load_dotenv()

# Ensure the encryption key is available
if not os.getenv("VITE_CRYPTO_KEY"):
    os.environ["VITE_CRYPTO_KEY"] = os.getenv("ENCRYPTION_KEY")


def test_encryption():
    # Encrypted Spotify refresh token
    encrypted_token = "mWppR+GO9hBrAJ9FGtIF1A==.LTEX9HTUKhcwTPD2v6kvhA==.d6QFz5yz9FEmWMn7bSITvmRZ/FdfqEByCG297WRgtLIPqAf7OpgQY5d4E4zq7pLNP24FSeS2a8EDFoqDQOIT++fUIHKEhm5M5MQQPIUzdWC98bg2XHuglUomvFic8zq3PX2AoVRW+E5kItvG5Xx/36kRaeDuD827ezlCDKIHGRIXQB8="

    # Expected decrypted token
    expected_token = "AQB7qCqLipZmxW3oE9YX7xQx0CReJBzIVT3G5gZEP9yHb7CHnjZxLNA67xFNe2al_jhB4HSUr-BQwIiQgRi_koWovIMzNqxVmTX0P6t23MR-s_d0fRr1rQnIaficgOVIgHk"

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
