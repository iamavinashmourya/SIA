"""
Script to generate welcome.mp3 using edge-tts
Run this once to create the welcome audio file.
"""
import asyncio
import edge_tts
from pathlib import Path
import sys

WELCOME_TEXT = "Hello, I am Sia, an AI assistant built by Avinash."
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
OUTPUT_PATH = STATIC_DIR / "welcome.mp3"

async def generate_welcome():
    """Generate welcome.mp3 file"""
    print(f"Generating welcome message: '{WELCOME_TEXT}'")
    print(f"Output: {OUTPUT_PATH}")
    
    try:
        # List available voices first to verify connection
        print("Fetching available voices...")
        voices = await edge_tts.list_voices()
        
        # Find a suitable English voice
        voice = None
        for v in voices:
            if v["Locale"].startswith("en-") and "Female" in v.get("Gender", ""):
                if "Aria" in v["ShortName"]:
                    voice = v["ShortName"]
                    break
        
        if not voice:
            # Fallback to any English female voice
            for v in voices:
                if v["Locale"].startswith("en-US") and "Female" in v.get("Gender", ""):
                    voice = v["ShortName"]
                    break
        
        if not voice:
            # Ultimate fallback
            voice = "en-US-AriaNeural"
        
        print(f"Using voice: {voice}")
        
        communicate = edge_tts.Communicate(text=WELCOME_TEXT, voice=voice)
        await communicate.save(str(OUTPUT_PATH))
        
        print(f"✓ Welcome audio generated successfully at {OUTPUT_PATH}")
    except Exception as e:
        print(f"Error generating welcome audio: {e}")
        print("\nTroubleshooting:")
        print("1. Check your internet connection")
        print("2. Edge TTS might be temporarily unavailable")
        print("3. Try again in a few moments")
        print("4. If the issue persists, you can manually download the audio from Edge TTS website")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(generate_welcome())
