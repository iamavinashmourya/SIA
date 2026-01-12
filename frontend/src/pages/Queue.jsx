import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, queueAPI } from '../utils/api';
import QueueNotification from '../components/QueueNotification';
import { createHostWebSocket } from '../utils/websocket';
import { useAuth } from '../contexts/AuthContext';

function Queue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(null);
  const [notification, setNotification] = useState(null);
  const wsRef = useRef(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadQueue();
    
    // Set up WebSocket connection for real-time updates
    if (user?.id) {
      wsRef.current = createHostWebSocket(
        user.id,
        (message) => {
          if (message.type === 'queue_update') {
            // Reload queue when update is received
            loadQueue();
            
            // Show notification for new requests
            if (message.action === 'new' && message.queue_item) {
              setNotification(message.queue_item);
            }
          }
        },
        (error) => {
          // Silently handle errors to avoid console spam
          // Only log if it's a critical error
        }
      );
      wsRef.current.connect();
    }
    
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, [user]);

  // Show notification for new queue items
  useEffect(() => {
    if (queue.length > 0) {
      const firstItem = queue[0];
      // Show notification if it's a new request (position 1 and not already showing)
      if (firstItem.position === 1 && (!notification || notification.id !== firstItem.id)) {
        setNotification(firstItem);
      }
    }
  }, [queue]);

  const handleAccept = async (queueId) => {
    if (!confirm('Accept this request? You will be redirected to communicate with the participant.')) return;
    
    setProcessing(queueId);
    try {
      const response = await queueAPI.acceptRequest(queueId);
      console.log('Accept response:', response);
      
      // Small delay to ensure state is updated, then navigate
      setTimeout(() => {
        navigate(`/dashboard/intervention/${queueId}`, { replace: true });
      }, 100);
    } catch (err) {
      console.error('Error accepting request:', err);
      alert(err.message || 'Failed to accept request');
      setProcessing(null);
    }
  };

  const handleDecline = async (queueId) => {
    if (!confirm('Decline this request?')) return;
    
    setProcessing(queueId);
    try {
      await queueAPI.declineRequest(queueId);
      await loadQueue(); // Refresh queue
      if (notification && notification.id === queueId) {
        setNotification(null);
      }
    } catch (err) {
      alert(err.message || 'Failed to decline request');
    } finally {
      setProcessing(null);
    }
  };

  const handleNotificationAccept = (queueId) => {
    setNotification(null);
    loadQueue();
  };

  const handleNotificationDecline = (queueId) => {
    setNotification(null);
    loadQueue();
  };

  const handleCloseNotification = () => {
    setNotification(null);
  };

  const loadQueue = async () => {
    try {
      setLoading(true);
      const data = await dashboardAPI.getQueue();
      setQueue(data);
    } catch (err) {
      setError(err.message || 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  };

  if (loading && queue.length === 0) {
    return (
      <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30 text-center">
        <p className="text-gray-300">Loading queue...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Notification for new requests */}
      {notification && notification.position === 1 && (
        <QueueNotification
          queueItem={notification}
          onAccept={handleNotificationAccept}
          onDecline={handleNotificationDecline}
          onClose={handleCloseNotification}
        />
      )}

      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">
          <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Queue Management
          </span>
        </h1>
        <button
          onClick={loadQueue}
          className="btn-animated-gradient text-white px-6 py-3 rounded-lg font-semibold"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {queue.length === 0 ? (
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30 text-center">
          <div className="text-6xl mb-4">✅</div>
          <p className="text-gray-300 text-lg">No pending queue requests</p>
          <p className="text-gray-500 text-sm mt-2">All participants are being served</p>
        </div>
      ) : (
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl border border-purple-500/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-purple-500/20">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Participant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Room
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Requested At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-slate-800/50 divide-y divide-purple-500/20">
                {queue.map((item) => (
                  <tr key={item.id} className="hover:bg-purple-600/10 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium">
                        {item.position}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">
                        {item.participant_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">{item.room_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {new Date(item.requested_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleAccept(item.id)}
                        disabled={processing === item.id}
                        className="text-purple-400 hover:text-purple-300 mr-4 font-medium disabled:opacity-50 transition-colors"
                      >
                        {processing === item.id ? 'Processing...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleDecline(item.id)}
                        disabled={processing === item.id}
                        className="text-red-400 hover:text-red-300 font-medium disabled:opacity-50 transition-colors"
                      >
                        Decline
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Queue;
