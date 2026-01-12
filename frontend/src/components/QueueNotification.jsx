import { useState, useEffect } from 'react';
import { queueAPI } from '../utils/api';

function QueueNotification({ queueItem, onAccept, onDecline, onClose }) {
  const [countdown, setCountdown] = useState(30);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    // Start 30-second countdown
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Play notification sound
    const audio = new Audio('data:audio/wav;base64,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');
    audio.play().catch(() => {}); // Ignore audio errors

    return () => {
      clearInterval(timer);
      audio.pause();
    };
  }, []);

  const handleAccept = async () => {
    setProcessing(true);
    try {
      await queueAPI.acceptRequest(queueItem.id);
      onAccept && onAccept(queueItem.id);
      onClose && onClose();
    } catch (error) {
      alert(error.message || 'Failed to accept request');
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    setProcessing(true);
    try {
      await queueAPI.declineRequest(queueItem.id);
      onDecline && onDecline(queueItem.id);
      onClose && onClose();
    } catch (error) {
      alert(error.message || 'Failed to decline request');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed top-4 right-4 bg-white rounded-lg shadow-2xl border-2 border-indigo-500 p-6 max-w-md z-50 animate-slide-in">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900 mb-1">📞 Call Host Request</h3>
          <p className="text-sm text-gray-600">
            <span className="font-medium">{queueItem.participant_name}</span> from{' '}
            <span className="font-medium">{queueItem.room_name}</span> is requesting your help
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 ml-4"
        >
          ✕
        </button>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Time remaining:</span>
          <span className={`text-lg font-bold ${countdown <= 10 ? 'text-red-600' : 'text-indigo-600'}`}>
            {countdown}s
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              countdown <= 10 ? 'bg-red-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${(countdown / 30) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex space-x-3">
        <button
          onClick={handleAccept}
          disabled={processing || countdown === 0}
          className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? 'Processing...' : 'Accept'}
        </button>
        <button
          onClick={handleDecline}
          disabled={processing || countdown === 0}
          className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Decline
        </button>
      </div>

      {countdown === 0 && (
        <p className="text-xs text-red-600 mt-2 text-center">
          Request expired. Participant will be notified.
        </p>
      )}
    </div>
  );
}

export default QueueNotification;
