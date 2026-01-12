import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getToken } from '../utils/api';

const API_BASE_URL = 'http://localhost:8000';

function JoinRoom() {
  const { inviteLink } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [checkingDevices, setCheckingDevices] = useState(false);
  const [checksDone, setChecksDone] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [speakerReady, setSpeakerReady] = useState(false);
  const [micChecking, setMicChecking] = useState(false);
  const [speakerChecking, setSpeakerChecking] = useState(false);
  const [micVisualActive, setMicVisualActive] = useState(false);
  const isHost = !!user;

  useEffect(() => {
    // Store invite link in localStorage for later use
    if (inviteLink) {
      localStorage.setItem('invite_link', inviteLink);
    }
    // Prefill name if user is logged in
    if (user?.name) {
      setName(user.name);
    }
  }, [inviteLink]);

  const runMicCheck = async () => {
    setError('');
    setMicChecking(true);
    setMicReady(false);
    setMicVisualActive(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicReady(true);
      setMicVisualActive(true);
      // stop tracks
      stream.getTracks().forEach((t) => t.stop());
      // keep visual for a second
      setTimeout(() => setMicVisualActive(false), 1200);
    } catch (err) {
      setError('Microphone not accessible. Please allow mic permissions.');
    } finally {
      setMicChecking(false);
      setChecksDone(micReady && speakerReady);
    }
  };

  const runSpeakerCheck = async () => {
    setError('');
    setSpeakerChecking(true);
    setSpeakerReady(false);
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 440;
      gainNode.gain.value = 0.05;
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      setSpeakerReady(true);
      setTimeout(() => {
        oscillator.stop();
        audioCtx.close();
      }, 500);
    } catch (err) {
      setError('Speaker test failed. Please check your output device.');
    } finally {
      setSpeakerChecking(false);
      setChecksDone(micReady && speakerReady);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setError('');
    
    // Hosts should not use the participant join flow
    if (isHost) {
      setError('You are the host for this account. Manage this meeting from the dashboard — you will get Call Host requests there.');
      return;
    }

    const participantName = user?.name || name;

    if (!participantName?.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!micReady || !speakerReady) {
      setError('Please check mic and speaker before joining.');
      return;
    }

    setLoading(true);

    try {
      const token = getToken();
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/api/participants/join`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          invite_link: inviteLink,
          name: participantName.trim(),
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to join room';
        try {
          const text = await response.text();
          if (text) {
            const errorData = JSON.parse(text);
            errorMessage = errorData.detail || errorMessage;
          } else {
            errorMessage = `Server returned ${response.status} ${response.statusText}`;
          }
        } catch (parseError) {
          errorMessage = `Server returned ${response.status} ${response.statusText}. Invalid response from server.`;
        }
        throw new Error(errorMessage);
      }

      const sessionData = await response.json();
      
      // Store session data
      localStorage.setItem('session_id', sessionData.session_id);
      localStorage.setItem('participant_name', sessionData.participant_name);
      localStorage.setItem('room_name', sessionData.room_name);
      
      // Navigate to meeting interface
      navigate('/meeting');
    } catch (err) {
      setError(err.message || 'Failed to join room. Please check the invite link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-4 relative overflow-hidden">
      {/* Glowing background accents */}
      <div className="absolute top-0 left-1/4 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)] bg-[size:24px_24px]" />

      <div className="relative max-w-md w-full bg-slate-800/90 backdrop-blur-sm rounded-2xl border border-purple-500/30 shadow-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            Join Meeting Room
          </h1>
          <p className="text-gray-300 mt-2">
            {user?.name
              ? `You're signed in as ${user.name}`
              : 'Enter your name to continue'}
          </p>
        </div>

        <form onSubmit={handleJoin} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {isHost && (
            <div className="bg-blue-500/10 border border-blue-500/50 text-blue-100 px-4 py-3 rounded-lg">
              You’re signed in as the host. Hosts don’t join via this link — manage the room from your dashboard. If a participant taps “Call Host,” you’ll see it in the dashboard queue.
            </div>
          )}

          {!user?.name && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                Your Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                placeholder="Enter your name"
                autoFocus
                disabled={isHost}
              />
              <p className="mt-1 text-xs text-gray-500">
                This will be used to identify you in the meeting
              </p>
            </div>
          )}

          {/* Device checks */}
          <div className="bg-slate-800/70 border border-purple-500/30 rounded-2xl p-5 space-y-4 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${micReady ? 'bg-green-400' : 'bg-gray-500'}`} />
                <span className="text-sm text-gray-200">Microphone</span>
              </div>
              <button
                type="button"
                onClick={runMicCheck}
                disabled={micChecking || isHost}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-slate-700/60 hover:bg-slate-600/70 text-white transition-colors disabled:opacity-60"
              >
                <svg className={`w-5 h-5 ${micReady ? 'text-green-400' : 'text-gray-300'} ${micVisualActive ? 'animate-pulse' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a2 2 0 00-2 2v5a2 2 0 104 0V4a2 2 0 00-2-2z" />
                  <path fillRule="evenodd" d="M4 8a1 1 0 011 1v1a5 5 0 0010 0V9a1 1 0 112 0v1a7 7 0 01-6 6.93V18a1 1 0 11-2 0v-1.07A7 7 0 014 10V9a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                {micChecking ? 'Checking...' : micReady ? 'Re-check mic' : 'Check mic'}
              </button>
            </div>
            {micVisualActive && (
              <div className="h-8 flex items-end gap-1">
                {[1, 2, 3, 4, 5].map((bar) => (
                  <div
                    key={bar}
                    className="w-1 bg-purple-400 rounded-full animate-[pulse_0.8s_ease-in-out_infinite]"
                    style={{ animationDelay: `${bar * 0.1}s`, height: `${6 + bar * 4}px` }}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${speakerReady ? 'bg-green-400' : 'bg-gray-500'}`} />
                <span className="text-sm text-gray-200">Speaker</span>
              </div>
              <button
                type="button"
                onClick={runSpeakerCheck}
                disabled={speakerChecking || isHost}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-slate-700/60 hover:bg-slate-600/70 text-white transition-colors disabled:opacity-60"
              >
                <svg className={`w-5 h-5 ${speakerReady ? 'text-green-400' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.383 3.076A1 1 0 0110.618 4v12a1 1 0 01-1.235.924l-4.5-1.125A1 1 0 014 14.825V5.175a1 1 0 01.883-.974l4.5-1.125z" />
                  <path d="M14 8a1 1 0 011 1 1 1 0 102 0 3 3 0 00-5.995-.176l-.005.176a3 3 0 005.884 1.094l.111-.217a1 1 0 00-1.79-.894A1 1 0 1114 9a1 1 0 010-2z" />
                </svg>
                {speakerChecking ? 'Checking...' : speakerReady ? 'Re-check speaker' : 'Check speaker'}
              </button>
            </div>

            <div className="bg-slate-700/40 rounded-xl p-3 text-xs text-gray-400">
              Click mic or speaker to test. Mic will ask permission; speaker plays a short tone.
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || isHost}
            className={`w-full py-3 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              loading ? 'bg-slate-600 text-white' : 'btn-animated-gradient text-white'
            }`}
          >
            {loading ? 'Joining...' : isHost ? 'Hosts join from dashboard' : 'Join Meeting'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-gray-400">
            By joining, you agree to participate in the meeting
          </p>
          {isHost && (
            <button
              type="button"
              onClick={() => navigate('/dashboard/rooms')}
              className="text-sm text-purple-200 underline underline-offset-4 hover:text-white"
            >
              Open host dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default JoinRoom;
