import os
import logging
from typing import Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from groq import Groq
import edge_tts
import tempfile
import shutil
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables - handle encoding issues
try:
    from dotenv import load_dotenv
    # Try to load .env file, but don't fail if it doesn't exist or has encoding issues
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        try:
            load_dotenv(dotenv_path=env_path, encoding='utf-8')
        except UnicodeDecodeError:
            # If UTF-8 fails, try to read and rewrite the file
            try:
                print("Detected encoding issue in .env file. Converting to UTF-8...")
                with open(env_path, 'r', encoding='utf-16') as f:
                    content = f.read()
                # Strip BOM if present
                if content.startswith('\ufeff'):
                    content = content[1:]
                # Remove trailing whitespace
                content = content.strip()
                # Write as UTF-8
                with open(env_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                    if not content.endswith('\n'):
                        f.write('\n')
                print("✓ Converted .env file to UTF-8 encoding")
                load_dotenv(dotenv_path=env_path, encoding='utf-8')
            except Exception as e:
                print(f"Warning: Could not load .env file: {e}")
                print("Please run: python fix_env_encoding.py")
    else:
        load_dotenv()  # Try default location
except ImportError:
    print("Warning: python-dotenv not installed. Using environment variables only.")

app = FastAPI(title="Sia AI Meeting Assistant", version="1.0.0")

# CORS middleware - allow both ports 3000 and 3001
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from routes import auth, rooms, dashboard, participants, queue, websocket

app.include_router(auth.router)
app.include_router(rooms.router)
app.include_router(dashboard.router)
app.include_router(participants.router)
app.include_router(queue.router)
app.include_router(websocket.router)

# Create static directory for audio files
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# System prompt for the AI
SYSTEM_PROMPT = "You are Sia, an AI Project Manager built by Avinash. Be concise and professional."

# Groq client will be initialized lazily
def get_groq_client():
    """Get or create Groq client instance"""
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set in environment variables")
    return Groq(api_key=api_key)

@app.get("/")
async def root():
    return {"message": "Sia AI Meeting Assistant API"}

@app.post("/process-audio")
async def process_audio(
    audio: UploadFile = File(...), 
    session_id: Optional[str] = Query(None, description="Session ID for dynamic context")
):
    """
    Process audio input:
    1. Transcribe with Groq Whisper
    2. Get AI response from Groq Llama (with dynamic context if session_id provided)
    3. Generate TTS with edge-tts
    4. Return audio URL and text
    
    Args:
        audio: Audio file to process
        session_id: Optional session ID for dynamic context (if provided, uses context engine)
    """
    try:
        # Initialize Groq client
        groq_client = get_groq_client()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    try:
        # Save uploaded audio to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
            shutil.copyfileobj(audio.file, temp_audio)
            temp_audio_path = temp_audio.name
        
        # Step 1: Transcribe with Groq Whisper
        user_text = ""
        try:
            logger.info(f"Transcribing audio file: {temp_audio_path}")
            with open(temp_audio_path, "rb") as audio_file:
                transcription = groq_client.audio.transcriptions.create(
                    file=(audio.filename or "audio.webm", audio_file, audio.content_type or "audio/webm"),
                    model="whisper-large-v3",
                    language="en"
                )
            user_text = transcription.text
            logger.info(f"Transcription successful: {user_text[:50]}...")
        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
        finally:
            # Clean up temp file
            if os.path.exists(temp_audio_path):
                os.unlink(temp_audio_path)
        
        # Step 2: Get AI response from Groq Llama
        try:
            # Use context engine if session_id is provided, otherwise use default prompt
            if session_id:
                from context_engine import get_dynamic_prompt
                dynamic_prompt = get_dynamic_prompt(session_id)
                if dynamic_prompt:
                    system_prompt_to_use = dynamic_prompt
                    logger.info(f"Using dynamic prompt for session: {session_id}")
                else:
                    # Fallback to default if context not found
                    system_prompt_to_use = f"{SYSTEM_PROMPT}\n\nWhen the conversation naturally ends and the user says goodbye, append [END_MEETING] to the end of your response."
                    logger.warning(f"Could not get dynamic prompt for session {session_id}, using default")
            else:
                # Default prompt for backward compatibility
                system_prompt_to_use = f"{SYSTEM_PROMPT}\n\nWhen the conversation naturally ends and the user says goodbye, append [END_MEETING] to the end of your response."
                logger.info("Using default prompt (no session_id provided)")
            
            messages = [
                {"role": "system", "content": system_prompt_to_use},
                {"role": "user", "content": user_text}
            ]
            
            logger.info("Getting AI response from Groq...")
            chat_completion = groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=messages,
                temperature=0.7,
                max_tokens=500
            )
            ai_response = chat_completion.choices[0].message.content
            logger.info(f"AI response received: {ai_response[:50]}...")
        except Exception as e:
            logger.error(f"AI response failed: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"AI response failed: {str(e)}")
        
        # Step 3: Check for end meeting tag
        end_meeting = False
        if "[END_MEETING]" in ai_response:
            end_meeting = True
            ai_response = ai_response.replace("[END_MEETING]", "").strip()
        
        # Step 4: Generate TTS with edge-tts
        try:
            # Detect language and select appropriate voice
            # Check if text contains Devanagari script (Hindi) - Unicode range U+0900 to U+097F
            has_devanagari = any('\u0900' <= char <= '\u097F' for char in ai_response)
            
            if has_devanagari:
                # Use Hindi voice for Hindi text
                voice = "hi-IN-MadhurNeural"  # Hindi male voice
                logger.info("Detected Hindi text, using Hindi voice: hi-IN-MadhurNeural")
            else:
                # Use English voice for English text
                voice = "en-US-AriaNeural"  # English female voice
                logger.info("Detected English text, using English voice: en-US-AriaNeural")
            
            output_path = STATIC_DIR / "reply.mp3"
            
            logger.info(f"Generating TTS for: {ai_response[:50]}...")
            communicate = edge_tts.Communicate(text=ai_response, voice=voice)
            await communicate.save(str(output_path))
            logger.info(f"TTS generated successfully: {output_path}")
        except Exception as e:
            logger.error(f"TTS failed: {str(e)}", exc_info=True)
            # If Hindi voice fails, try English voice as fallback
            if has_devanagari:
                logger.info("TTS failed with Hindi voice, trying English voice as fallback...")
                try:
                    voice = "en-US-AriaNeural"
                    communicate = edge_tts.Communicate(text=ai_response, voice=voice)
                    await communicate.save(str(output_path))
                    logger.info(f"TTS generated successfully with fallback English voice: {output_path}")
                except Exception as fallback_error:
                    logger.error(f"Fallback TTS also failed: {str(fallback_error)}")
                    raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")
            else:
                raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")
        
        # Return response
        return {
            "audio_url": f"http://localhost:8000/static/reply.mp3",
            "text": ai_response,
            "end_meeting": end_meeting
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in process_audio: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
