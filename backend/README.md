# Sia AI Meeting Assistant - Backend

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up Supabase:
   - Create a Supabase account at https://supabase.com
   - Create a new project
   - Run the SQL schema from `supabase_setup.sql` in Supabase SQL Editor
   - Get your project URL and service role key
   - See `supabase_setup.md` for detailed instructions

3. Set up environment variables:
```bash
# Use the helper script (recommended):
python create_env.py

# Add to .env file:
# GROQ_API_KEY=your_groq_api_key
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_KEY=your-service-role-key
# SUPABASE_ANON_KEY=your-anon-key
```

Get your free Groq API key from: https://console.groq.com/

4. Test Supabase connection:
```bash
python test_supabase.py
```

5. Generate welcome audio:
```bash
python generate_welcome.py
```

6. Run the server:
```bash
python main.py
```

The server will run on `http://localhost:8000`

## Database Schema

See `supabase_setup.sql` for the complete database schema including:
- hosts (admin users)
- rooms (meeting rooms)
- participants (room participants)
- sessions (meeting sessions)
- queue (call host queue)

## API Endpoints

### Current Endpoints
- `GET /` - Health check
- `POST /process-audio` - Process audio input and return AI response
- `GET /static/reply.mp3` - Get generated audio response
- `GET /static/welcome.mp3` - Get welcome audio

### Upcoming Endpoints (In Development)
- `POST /api/auth/register` - Host registration
- `POST /api/auth/login` - Host login
- `POST /api/rooms` - Create meeting room
- `GET /api/rooms` - List host's rooms
- `POST /api/rooms/{room_id}/join` - Join room as participant
- `POST /api/sessions/{session_id}/call-host` - Request host intervention
- `GET /api/dashboard/queue` - Get queue for host dashboard
