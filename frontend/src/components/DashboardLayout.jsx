import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function DashboardLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

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

      {/* Header */}
      <header className="relative z-50 bg-slate-800/90 backdrop-blur-sm border-b border-purple-500/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold">
                <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  SIA
                </span>
              </h1>
              <span className="ml-4 text-sm text-gray-400">Host Dashboard</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-300">
                Welcome, <span className="font-medium text-white">{user?.name}</span>
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-purple-600/30 rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="w-64 flex-shrink-0">
            <nav className="bg-slate-800/90 backdrop-blur-sm rounded-2xl p-4 border border-purple-500/30">
              <ul className="space-y-2">
                <li>
                  <Link
                    to="/dashboard"
                    className={`block px-4 py-3 rounded-lg transition-colors ${
                      isActive('/dashboard')
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium'
                        : 'text-gray-300 hover:bg-purple-600/20 hover:text-white'
                    }`}
                  >
                    Overview
                  </Link>
                </li>
                <li>
                  <Link
                    to="/dashboard/rooms"
                    className={`block px-4 py-3 rounded-lg transition-colors ${
                      isActive('/dashboard/rooms')
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium'
                        : 'text-gray-300 hover:bg-purple-600/20 hover:text-white'
                    }`}
                  >
                    Rooms
                  </Link>
                </li>
                <li>
                  <Link
                    to="/dashboard/queue"
                    className={`block px-4 py-3 rounded-lg transition-colors ${
                      isActive('/dashboard/queue')
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium'
                        : 'text-gray-300 hover:bg-purple-600/20 hover:text-white'
                    }`}
                  >
                    Queue
                  </Link>
                </li>
                <li>
                  <Link
                    to="/dashboard/transcripts"
                    className={`block px-4 py-3 rounded-lg transition-colors ${
                      isActive('/dashboard/transcripts')
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium'
                        : 'text-gray-300 hover:bg-purple-600/20 hover:text-white'
                    }`}
                  >
                    Transcripts
                  </Link>
                </li>
              </ul>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export default DashboardLayout;
