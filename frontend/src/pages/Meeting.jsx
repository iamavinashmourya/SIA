import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AvatarCanvas from '../components/AvatarCanvas';
import { queueAPI } from '../utils/api';
import { createParticipantWebSocket } from '../utils/websocket';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = 'http://localhost:8000';

function Meeting() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [showEndMeeting, setShowEndMeeting] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [participantName, setParticipantName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [queueStatus, setQueueStatus] = useState(null);
  const [callingHost, setCallingHost] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const wsRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    // If a host is logged in, they should not use the participant meeting UI.
    // Redirect them back to the dashboard and clear any stray participant session data.
    if (user) {
      localStorage.removeItem('session_id');
      localStorage.removeItem('participant_name');
      localStorage.removeItem('room_name');
      localStorage.removeItem('invite_link');
      navigate('/dashboard/rooms');
      return;
    }

    // Check if user has a session
    const storedSessionId = localStorage.getItem('session_id');
    const storedName = localStorage.getItem('participant_name');
    const storedRoomName = localStorage.getItem('room_name');

    if (!storedSessionId) {
      // No session found, redirect to home
      navigate('/');
      return;
    }

    setSessionId(storedSessionId);
    setParticipantName(storedName || '');
    setRoomName(storedRoomName || '');

    // Play welcome message
    const welcomeAudio = new Audio(`${API_BASE_URL}/static/welcome.mp3`);
    welcomeAudio.play().catch(err => {
      console.error('Failed to play welcome audio:', err);
    });

    return () => {
      welcomeAudio.pause();
    };
  }, [navigate, user]);

  // Set up WebSocket connection for real-time queue updates
  useEffect(() => {
    if (sessionId) {
      // Initial queue status check
      checkQueueStatus();
      
      // Set up WebSocket for real-time updates
      wsRef.current = createParticipantWebSocket(
        sessionId,
        (message) => {
          if (message.type === 'queue_status') {
            setQueueStatus(message.status);
          } else if (message.type === 'connected') {
            console.log('WebSocket connected for session:', sessionId);
          } else if (message.type === 'intervention_message') {
            // Show host message notification
            const notification = document.createElement('div');
            notification.className = 'fixed top-4 right-4 bg-indigo-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-md';
            notification.innerHTML = `
              <div class="font-semibold mb-1">Host Message</div>
              <div>${message.text}</div>
            `;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 5000);
          }
        },
        (error) => {
          console.error('WebSocket error:', error);
        }
      );
      wsRef.current.connect();
    }
    
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, [sessionId]);

  const checkQueueStatus = async () => {
    if (!sessionId) return;
    
    try {
      const status = await queueAPI.getQueueStatus(sessionId);
      setQueueStatus(status);
    } catch (error) {
      console.error('Error checking queue status:', error);
    }
  };

  const handleCallHost = async () => {
    if (!sessionId) {
      alert('Session not found. Please join a room first.');
      return;
    }

    if (queueStatus && queueStatus.status === 'waiting') {
      alert(`You are already in the queue at position ${queueStatus.position}`);
      return;
    }

    setCallingHost(true);
    try {
      const result = await queueAPI.callHost(sessionId);
      setQueueStatus(result);
      alert(`Request sent! You are in the queue at position ${result.position}`);
    } catch (error) {
      alert(error.message || 'Failed to call host. Please try again.');
    } finally {
      setCallingHost(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob) => {
    if (!sessionId) {
      alert('Session not found. Please join a room first.');
      return;
    }

    setIsProcessing(true);
    setAiResponse('');

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      // Include session_id in the URL for context-aware responses
      const url = `${API_BASE_URL}/process-audio?session_id=${sessionId}`;
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Update UI with response
      setAiResponse(data.text || '');
      
      // Handle end meeting flag
      if (data.end_meeting) {
        setShowEndMeeting(true);
      }

      // Play the audio response
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      const audio = new Audio(data.audio_url + '?t=' + Date.now());
      audioRef.current = audio;
      
      // Start talking animation when audio starts
      audio.onplay = () => {
        setIsTalking(true);
      };
      
      audio.onended = () => {
        setIsTalking(false);
        if (data.end_meeting) {
          setShowEndMeeting(true);
        }
        setIsProcessing(false);
      };
      
      audio.onpause = () => {
        setIsTalking(false);
      };
      
      audio.onerror = () => {
        console.error('Error playing audio');
        setIsTalking(false);
        setIsProcessing(false);
      };
      
      await audio.play();
    } catch (error) {
      console.error('Error processing audio:', error);
      alert('Failed to process audio. Make sure the backend is running.');
      setIsProcessing(false);
    }
  };

  const handleEndMeeting = async () => {
    if (sessionId) {
      try {
        await fetch(`${API_BASE_URL}/api/participants/session/${sessionId}/end`, {
          method: 'POST',
        });
      } catch (error) {
        console.error('Error ending session:', error);
      }
    }

    // Clear session data
    localStorage.removeItem('session_id');
    localStorage.removeItem('participant_name');
    localStorage.removeItem('room_name');
    localStorage.removeItem('invite_link');

    setShowEndMeeting(false);
    navigate('/');
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen flex flex-col bg-gray-900 overflow-hidden">
      {/* End Meeting Overlay */}
      {showEndMeeting && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4 text-center">Meeting Ended</h2>
            <p className="text-gray-600 text-center mb-6">
              Thank you for using Sia, {participantName}. The conversation has ended.
            </p>
            <button
              onClick={handleEndMeeting}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition font-medium"
            >
              Return to Home
            </button>
          </div>
        </div>
      )}

      {/* Top Bar - Minimal like Zoom/Meet */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-transparent">
        <div className="flex justify-between items-center p-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <span className="text-white text-sm font-medium">{roomName || 'Meeting'}</span>
            </div>
            {isTalking && (
              <div className="bg-green-500/90 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="text-white text-xs font-medium">Sia is speaking</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <span className="text-white text-xs">{participantName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Video/Avatar Area - Full Screen */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {/* Avatar/Video Container - Centered */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full h-full max-w-5xl relative" style={{ minHeight: '400px' }}>
            <AvatarCanvas isTalking={isTalking} />
          </div>
        </div>
        
        {/* Participant Name Overlay (Bottom Left) */}
        <div className="absolute bottom-20 left-4 bg-black/60 backdrop-blur-sm px-3 py-2 rounded-lg z-20">
          <span className="text-white text-sm font-medium">Sia (AI Assistant)</span>
        </div>

        {/* AI Response Chat Bubble (Bottom Right) */}
        {aiResponse && (
          <div className="absolute bottom-20 right-4 max-w-md bg-white/95 backdrop-blur-sm rounded-lg shadow-xl p-4 animate-slide-up z-20">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                S
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-1">Sia</div>
                <p className="text-gray-800 text-sm leading-relaxed">{aiResponse}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Control Bar - Zoom/Meet Style */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gray-800/95 backdrop-blur-sm border-t border-gray-700">
        <div className="flex items-center justify-center gap-2 px-4 py-3">
          {/* Microphone Toggle */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing || isTalking}
            className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isRecording ? 'Mute' : 'Unmute'}
          >
            {isRecording ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110.618 4v12a1 1 0 01-1.235.924l-4.5-1.125A1 1 0 014 14.825V5.175a1 1 0 01.883-.974l4.5-1.125z" clipRule="evenodd" />
                <path d="M14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-1.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 rounded-full">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
              <span className="text-yellow-300 text-xs">Processing...</span>
            </div>
          )}

          {/* Call Host Button */}
          <button
            onClick={handleCallHost}
            disabled={callingHost || (queueStatus && queueStatus.status === 'waiting')}
            className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
              queueStatus && queueStatus.status === 'waiting'
                ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Call Host"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
          </button>

          {/* Participants/Info Button */}
          <button
            className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-all"
            title="Meeting Info"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
          </button>

          {/* End Call Button - Red and Prominent */}
          <button
            onClick={() => {
              if (confirm('Are you sure you want to end the meeting?')) {
                handleEndMeeting();
              }
            }}
            className="flex items-center justify-center w-14 h-12 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all font-medium px-4"
            title="End Meeting"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Queue Status Bar */}
        {queueStatus && queueStatus.status === 'waiting' && (
          <div className="px-4 pb-2">
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg px-3 py-2 text-center">
              <span className="text-yellow-300 text-xs">
                In queue - Position {queueStatus.position} • Waiting for host...
              </span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default Meeting;
