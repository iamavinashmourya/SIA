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
    <main className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
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

      {/* Header */}
      <div className="w-full max-w-7xl mb-6">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-purple-500/30 p-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Sia - AI Meeting Assistant
            </h1>
            {roomName && (
              <p className="text-sm text-gray-300 mt-1">Room: {roomName}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-300">
              Participant: <span className="font-medium text-purple-300">{participantName}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Main Content - Meeting Room Style */}
      <div className="w-full max-w-7xl">
        {/* Avatar Face Display - Large and Prominent */}
        <div className="mb-8">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl overflow-hidden border-2 border-purple-500/30">
            <div className="aspect-video w-full relative" style={{ minHeight: '500px', maxHeight: '600px' }}>
              <div className="absolute inset-0">
                <AvatarCanvas isTalking={isTalking} />
              </div>
              {/* Talking indicator overlay */}
              {isTalking && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-green-500/90 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-lg animate-pulse">
                  <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
                  <span className="text-sm font-medium">Sia is speaking...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-purple-500/30 p-6">
            {/* Recording Controls */}
            <div className="mb-6">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing || isTalking}
                className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all transform hover:scale-105 disabled:hover:scale-100 disabled:opacity-50 ${
                  isRecording
                    ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/50'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/50'
                }`}
              >
                {isRecording ? '⏹ Stop Recording' : '🎤 Start Recording'}
              </button>
              
              {isProcessing && (
                <p className="text-center text-gray-300 mt-4 flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Processing your request...
                </p>
              )}
            </div>

            {/* AI Response Display */}
            {aiResponse && (
              <div className="mb-6 p-4 bg-gradient-to-r from-purple-900/50 to-indigo-900/50 rounded-lg border border-purple-500/30 max-h-64 overflow-y-auto">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                    S
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-purple-300 mb-2">Sia:</h3>
                    <p className="text-gray-200 whitespace-pre-wrap leading-relaxed">{aiResponse}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Status Indicator */}
            <div className="mb-6 text-center">
              <div className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-700/50 rounded-full border border-purple-500/20">
                <div
                  className={`w-3 h-3 rounded-full transition-colors ${
                    isRecording ? 'bg-red-500 animate-pulse' : 
                    isTalking ? 'bg-green-500 animate-pulse' :
                    isProcessing ? 'bg-yellow-500 animate-pulse' : 
                    'bg-gray-400'
                  }`}
                />
                <span className="text-sm text-gray-200 font-medium">
                  {isRecording ? 'Recording...' : 
                   isTalking ? 'Sia is speaking...' :
                   isProcessing ? 'Processing...' : 
                   'Ready'}
                </span>
              </div>
            </div>

            {/* Call Host Button */}
            <div className="mt-4">
              <button
                onClick={handleCallHost}
                disabled={callingHost || (queueStatus && queueStatus.status === 'waiting')}
                className={`w-full py-2 px-4 rounded-lg font-medium transition ${
                  queueStatus && queueStatus.status === 'waiting'
                    ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400'
                }`}
              >
                {callingHost
                  ? 'Requesting...'
                  : queueStatus && queueStatus.status === 'waiting'
                  ? `📞 In Queue (Position ${queueStatus.position})`
                  : '📞 Call Host'}
              </button>
              {queueStatus && queueStatus.status === 'waiting' && (
                <p className="text-xs text-center text-gray-600 mt-2">
                  Waiting for host to respond...
                </p>
              )}
            </div>

            {/* End Meeting Button */}
            <div className="mt-4">
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to end the meeting?')) {
                    handleEndMeeting();
                  }
                }}
                className="w-full py-2 px-4 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/10 transition"
              >
                End Meeting
              </button>
            </div>
          </div>
        </div>
    </main>
  );
}

export default Meeting;
