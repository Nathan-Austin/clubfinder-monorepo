# Create a test script: test_task.py
import asyncio

from src.barfindr.tasks import spotify_genre_polling


async def test_task():
    print("Testing Spotify polling task...")

    try:
        # Run the task manually
        await spotify_genre_polling()
        print("Task completed successfully")
    except Exception as e:
        print(f"Task failed: {str(e)}")


if __name__ == "__main__":
    asyncio.run(test_task())
