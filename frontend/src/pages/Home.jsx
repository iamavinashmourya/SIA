import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [joinCode, setJoinCode] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleCreateMeeting = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  const handleJoinMeeting = () => {
    if (!joinCode.trim()) {
      alert('Please enter a join link or code');
      return;
    }
    
    // Remove any leading/trailing slashes and whitespace
    const cleanCode = joinCode.trim().replace(/^\/+|\/+$/g, '');
    
    // If it's a full URL, extract the code
    let inviteLink = cleanCode;
    if (cleanCode.includes('/join/')) {
      inviteLink = cleanCode.split('/join/')[1];
    } else if (cleanCode.includes('join/')) {
      inviteLink = cleanCode.split('join/')[1];
    }
    
    navigate(`/join/${inviteLink}`);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Gradient Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Glowing orbs for depth */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-1/3 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000"></div>
        
        {/* Grid overlay for texture */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      {/* Navbar */}
      <nav className="relative z-50 w-full px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="text-2xl font-bold">
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              SIA
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            {!user ? (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 text-white hover:text-purple-300 transition-colors"
                >
                  Login
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all"
                >
                  Sign Up
                </button>
              </>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold hover:ring-2 hover:ring-purple-400 transition-all"
                >
                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </button>
                
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-slate-800/95 backdrop-blur-sm rounded-lg shadow-xl border border-purple-500/30 overflow-hidden">
                    <button
                      onClick={() => {
                        navigate('/dashboard');
                        setShowUserMenu(false);
                      }}
                      className="w-full px-4 py-3 text-left text-white hover:bg-purple-600/30 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      Dashboard
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-80px)] px-4 py-12">
        <div className="max-w-6xl w-full">
          {/* Hero Title */}
          <div className="text-center mb-16">
            <h1 className="text-6xl md:text-7xl font-bold mb-4">
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent animate-gradient">
                Welcome to Sia
              </span>
            </h1>
            <p className="text-xl text-gray-300 mt-4">
              AI-Powered Meeting Assistant
            </p>
          </div>

          {/* Two Section Layout */}
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Create Meeting Section */}
            <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30 h-full flex flex-col items-center justify-center min-h-[300px] hover:border-purple-500/50 transition-colors">
              <div className="mb-6">
                <div className="w-20 h-20 mx-auto bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-4 text-center">Create Meeting</h2>
              <p className="text-gray-400 text-center mb-6">
                Set up a new meeting room and invite your team members
              </p>
              <button
                onClick={handleCreateMeeting}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105"
              >
                Create Meeting
              </button>
            </div>

            {/* Join Meeting Section */}
            <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/30 h-full flex flex-col justify-center min-h-[300px] hover:border-blue-500/50 transition-colors">
              <div className="mb-6">
                <div className="w-20 h-20 mx-auto bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-4 text-center">Join Meeting</h2>
              <p className="text-gray-400 text-center mb-6">
                Enter your invite link or code to join a meeting
              </p>
              <div className="space-y-4">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleJoinMeeting()}
                  placeholder="Enter link or join code"
                  className="w-full px-4 py-3 bg-slate-700/50 border border-blue-500/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleJoinMeeting}
                  className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-cyan-700 transition-all transform hover:scale-105"
                >
                  Join Meeting
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close user menu */}
      {showUserMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </div>
  );
}

export default Home;
