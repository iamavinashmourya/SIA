## SIA

## Overview
SIA is a full-stack AI meeting assistant that lets hosts manage rooms and participants join via invite links. It supports real-time queueing, WebRTC signaling groundwork, and an animated 3D avatar meeting UI.

> **⚠️ Project Status**: This project is currently **not complete** and is **on hold** for the time being. Development will continue soon. Thank you for your interest and patience!

## Features
- Host dashboard: create/manage rooms, view queue, transcripts.
- Participant join via invite link with session creation and isolation.
- WebSocket updates for queue and signaling.
- 3D avatar meeting UI with face-focused view and talking animations.
- Call Host flow: participants can request host intervention.

## Setup
### Prerequisites
- Node.js (18+ recommended)
- Python 3.10+
- Supabase project + service key/DB URL
- FFmpeg (if doing audio processing)

## Backend
1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add your GROQ_API_KEY
```

Get your free Groq API key from: https://console.groq.com/

4. Generate welcome audio:
```bash
python generate_welcome.py
```

5. Run the server:
```bash
python main.py
```

The backend will run on `http://localhost:8000`

### Frontend

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000` (Vite dev server)


### Environment
Set environment variables (example):
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `JWT_SECRET_KEY`
- any audio/transcription keys if applicable

## Running
1. Start backend: `python main.py` (from `backend/`).
2. Start frontend: `npm run dev` (from `frontend/`).
3. Use the dashboard to create a room; copy the invite link.
4. Open the invite link in another browser to join as participant.
5. Use “Call Host” to place a queue request; host sees it in the dashboard.


## Notes
- Hosts cannot join their own rooms via participant link; they use the dashboard/call flow.
- Avatar view is face-focused with talking animations when audio plays.
- WebRTC signaling helpers are scaffolded; media pipeline may need completion for live calls.

## Usage
1. Open `http://localhost:3000` in your browser
2. Allow microphone access when prompted
3. Click "Start Recording" and speak
4. Click "Stop Recording" when finished
5. Sia will process your audio and respond with voice
6. Say "Goodbye" to end the meeting

## Features

- ✅ Voice-to-Voice conversation
- ✅ Real-time audio transcription (Groq Whisper)
- ✅ AI responses (Groq Llama 3.1 8B Instant)
- ✅ Text-to-Speech (Edge TTS - Free)
- ✅ 3D Avatar placeholder
- ✅ Auto-play welcome message
- ✅ End meeting detection

## Tech Stack

### Frontend
- **React 18** - UI framework
- **React Router DOM** - Client-side routing
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **PostCSS + Autoprefixer** - CSS processing
- **Three.js** - 3D graphics library
- **GLTFLoader** - 3D model loading
- **WebSockets** - Real-time bidirectional communication
- **WebRTC** - Peer-to-peer communication (signaling ready)
- **MediaRecorder API** - Browser audio recording

### Backend
- **FastAPI** - Modern Python web framework
- **Uvicorn** - ASGI server
- **Supabase** - PostgreSQL database + real-time features
- **Python-JOSE** - JWT token handling
- **Passlib + Bcrypt** - Password hashing
- **WebSockets** - Real-time server-client communication
- **Python-multipart** - File upload handling
- **aiofiles** - Async file operations
- **httpx** - Async HTTP client
- **python-dotenv** - Environment variable management
- **email-validator** - Email validation

### AI & Audio
- **Groq API** - AI inference platform
  - **Whisper Large V3** - Speech-to-text transcription
  - **Llama 3.1 8B Instant** - Language model for responses
- **Edge TTS** - Free text-to-speech synthesis

### Database & Storage
- **Supabase (PostgreSQL)** - Primary database
- **Supabase Storage** - File storage (if used)

---

## Thank You

Thank you for checking out SIA! Your interest and support are greatly appreciated. 🙏

**Note**: This project is still in development and will be continued soon. Stay tuned for updates!

