import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createHostWebSocket } from '../utils/websocket';
import { useAuth } from '../contexts/AuthContext';
import { queueAPI } from '../utils/api';

const API_BASE_URL = 'http://localhost:8000';

function HostIntervention() {
  const { queueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [participantInfo, setParticipantInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!queueId) {
      navigate('/dashboard/queue');
      return;
    }
    
    loadParticipantInfo();
    
    // Set up WebSocket for real-time messaging
    if (user?.id) {
      wsRef.current = createHostWebSocket(
        user.id,
        (message) => {
          if (message.type === 'intervention_message') {
            setMessages(prev => [...prev, {
              id: Date.now(),
              text: message.text,
              sender: message.sender === 'system' ? 'system' : 'participant',
              timestamp: new Date(message.timestamp || Date.now())
            }]);
          }
        },
        (error) => {
          console.error('WebSocket error:', error);
          setWsConnected(false);
        }
      );
      wsRef.current.connect();
      
      // Check connection status periodically
      const checkConnection = setInterval(() => {
        if (wsRef.current?.ws) {
          const isConnected = wsRef.current.ws.readyState === WebSocket.OPEN;
          setWsConnected(isConnected);
        }
      }, 1000);

      return () => {
        clearInterval(checkConnection);
        if (wsRef.current) {
          wsRef.current.disconnect();
        }
      };
    }
  }, [user, queueId, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadParticipantInfo = async () => {
    try {
      setLoading(true);
      // Get queue item directly by ID (works for accepted items too)
      const response = await fetch(`${API_BASE_URL}/api/queue/item/${queueId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const item = await response.json();
        setParticipantInfo({
          name: item.participant_name,
          room: item.room_name,
          requestedAt: item.requested_at,
          session_id: item.session_id,
          participant_id: item.participant_id
        });
      } else if (response.status === 404) {
        // If queue item not found, try getting from current queue
        const queueResponse = await fetch(`${API_BASE_URL}/api/dashboard/queue`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (queueResponse.ok) {
          const queue = await queueResponse.json();
          const item = queue.find(q => q.id === queueId);
          if (item) {
            setParticipantInfo({
              name: item.participant_name,
              room: item.room_name,
              requestedAt: item.requested_at,
              session_id: null, // Will need to get from participant
              participant_id: item.participant_id
            });
          } else {
            alert('Queue item not found. Redirecting to queue page.');
            navigate('/dashboard/queue');
          }
        }
      } else {
        throw new Error('Failed to load queue item');
      }
    } catch (error) {
      console.error('Error loading participant info:', error);
      alert('Failed to load participant info. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !wsRef.current || !wsConnected) return;

    const message = {
      id: Date.now(),
      text: messageText.trim(),
      sender: 'host',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, message]);
    setMessageText('');

    // Send via WebSocket
    if (wsRef.current && wsRef.current.ws && wsRef.current.ws.readyState === WebSocket.OPEN) {
      // Send message with session_id if available, otherwise use queue_id for backend routing
      wsRef.current.send({
        type: 'intervention_message',
        queue_id: queueId,
        text: message.text,
        sender: 'host',
        target_session_id: participantInfo?.session_id || null
      });
    } else {
      alert('WebSocket not connected. Please refresh the page.');
      // Try to reconnect
      if (wsRef.current && user?.id) {
        wsRef.current.connect();
      }
    }
  };

  const handleEndIntervention = async () => {
    if (confirm('End intervention? The participant will be notified.')) {
      // Mark queue as completed
      try {
        await fetch(`${API_BASE_URL}/api/queue/${queueId}/complete`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
      } catch (error) {
        console.error('Error ending intervention:', error);
      }
      navigate('/dashboard/queue');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Host Intervention</h1>
              {participantInfo && (
                <p className="text-gray-600 mt-1">
                  Communicating with <span className="font-semibold">{participantInfo.name}</span> 
                  {' '}in room <span className="font-semibold">{participantInfo.room}</span>
                </p>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 ${wsConnected ? 'text-green-600' : 'text-red-600'}`}>
                <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm">{wsConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              <button
                onClick={handleEndIntervention}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                End Intervention
              </button>
            </div>
          </div>
        </div>

        {/* Chat Interface */}
        <div className="bg-white rounded-lg shadow-lg flex flex-col" style={{ height: '600px' }}>
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-20">
                <p className="text-lg">Start the conversation</p>
                <p className="text-sm mt-2">Send a message to {participantInfo?.name}</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'host' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      msg.sender === 'host'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200 text-gray-900'
                    }`}
                  >
                    <p className="text-sm">{msg.text}</p>
                    <p className={`text-xs mt-1 ${
                      msg.sender === 'host' ? 'text-indigo-200' : 'text-gray-500'
                    }`}>
                      {msg.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t p-4">
            <div className="flex space-x-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type your message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={!wsConnected}
              />
              <button
                onClick={sendMessage}
                disabled={!messageText.trim() || !wsConnected}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-900 mb-2">Instructions:</h3>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            <li>Communicate with the participant via text messages</li>
            <li>Messages are sent in real-time via WebSocket</li>
            <li>Click "End Intervention" when finished</li>
            <li>The participant will be notified when you end the intervention</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default HostIntervention;
