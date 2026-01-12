import { useState, useEffect } from 'react';
import { roomsAPI } from '../utils/api';
import { useSearchParams } from 'react-router-dom';

function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [searchParams] = useSearchParams();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    context: '',
    tone: 'professional',
    knowledge_base: '',
  });

  useEffect(() => {
    loadRooms();
    if (searchParams.get('action') === 'create') {
      setShowCreateModal(true);
    }
  }, []);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const data = await roomsAPI.list();
      setRooms(data);
    } catch (err) {
      setError(err.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    try {
      // Parse knowledge base JSON
      let knowledgeBase = {};
      if (formData.knowledge_base.trim()) {
        try {
          knowledgeBase = JSON.parse(formData.knowledge_base);
        } catch {
          throw new Error('Invalid JSON in knowledge base');
        }
      }

      await roomsAPI.create({
        name: formData.name,
        context: formData.context || null,
        knowledge_base: knowledgeBase,
        tone: formData.tone,
      });

      setShowCreateModal(false);
      resetForm();
      loadRooms();
    } catch (err) {
      setError(err.message || 'Failed to create room');
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!confirm('Are you sure you want to delete this room?')) return;

    try {
      await roomsAPI.delete(roomId);
      loadRooms();
    } catch (err) {
      setError(err.message || 'Failed to delete room');
    }
  };

  const handleCopyInviteLink = async (roomId) => {
    try {
      const data = await roomsAPI.getInviteLink(roomId);
      await navigator.clipboard.writeText(data.full_url);
      alert('Invite link copied to clipboard!');
    } catch (err) {
      setError(err.message || 'Failed to get invite link');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      context: '',
      tone: 'professional',
      knowledge_base: '',
    });
    setEditingRoom(null);
  };

  if (loading) {
    return (
      <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30 text-center">
        <p className="text-gray-300">Loading rooms...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">
          <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Room Management
          </span>
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-animated-gradient text-white px-6 py-3 rounded-lg font-semibold"
        >
          + Create Room
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {rooms.length === 0 ? (
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30 text-center">
          <p className="text-gray-300 mb-4">No rooms yet. Create your first room to get started!</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-animated-gradient text-white px-6 py-3 rounded-lg font-semibold"
          >
            Create Room
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <div key={room.id} className="bg-slate-800/90 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/30 hover:border-purple-500/50 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-white">{room.name}</h3>
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    room.active
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                  }`}
                >
                  {room.active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                {room.context || 'No context provided'}
              </p>

              <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                <span>Tone: <span className="text-purple-400">{room.tone}</span></span>
                <span>{new Date(room.created_at).toLocaleDateString()}</span>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => handleCopyInviteLink(room.id)}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-3 py-2 rounded-lg hover:from-purple-700 hover:to-pink-700 text-sm font-medium transition-all"
                >
                  Copy Link
                </button>
                <button
                  onClick={() => handleDeleteRoom(room.id)}
                  className="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 text-sm font-medium transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-purple-500/30">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-white mb-4">Create New Room</h2>
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Room Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="Hackathon Project - Team Codeon"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Project Context
                  </label>
                  <textarea
                    value={formData.context}
                    onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="We are building an app using React. Kashyap needs to handle the backend..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Tone
                  </label>
                  <select
                    value={formData.tone}
                    onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  >
                    <option value="professional">Professional</option>
                    <option value="strict">Strict</option>
                    <option value="casual">Casual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Knowledge Base (JSON)
                  </label>
                  <textarea
                    value={formData.knowledge_base}
                    onChange={(e) => setFormData({ ...formData, knowledge_base: e.target.value })}
                    rows={8}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all font-mono text-sm"
                    placeholder='{\n  "kashyap": {\n    "task": "Handle backend development",\n    "requirements": ["Node.js", "VS Code"]\n  }\n}'
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    JSON format: participant names as keys, task info as values
                  </p>
                </div>

                <div className="flex justify-end space-x-4 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-purple-500/30 rounded-lg text-gray-300 hover:bg-purple-600/20 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-animated-gradient text-white px-6 py-3 rounded-lg font-semibold"
                  >
                    Create Room
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Rooms;
