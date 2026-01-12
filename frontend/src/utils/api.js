/**
 * API utility functions for backend communication
 */
const API_BASE_URL = 'http://localhost:8000';

/**
 * Get stored auth token
 */
export const getToken = () => {
  return localStorage.getItem('auth_token');
};

/**
 * Set auth token
 */
export const setToken = (token) => {
  localStorage.setItem('auth_token', token);
};

/**
 * Remove auth token
 */
export const removeToken = () => {
  localStorage.removeItem('auth_token');
};

/**
 * Make authenticated API request
 */
export const apiRequest = async (endpoint, options = {}) => {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }

  return response.json();
};

/**
 * Authentication API
 */
export const authAPI = {
  register: async (email, password, name) => {
    return apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  },

  login: async (email, password) => {
    return apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
};

/**
 * Rooms API
 */
export const roomsAPI = {
  list: async () => {
    return apiRequest('/api/rooms');
  },

  get: async (roomId) => {
    return apiRequest(`/api/rooms/${roomId}`);
  },

  create: async (roomData) => {
    return apiRequest('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(roomData),
    });
  },

  update: async (roomId, roomData) => {
    return apiRequest(`/api/rooms/${roomId}`, {
      method: 'PATCH',
      body: JSON.stringify(roomData),
    });
  },

  delete: async (roomId) => {
    return apiRequest(`/api/rooms/${roomId}`, {
      method: 'DELETE',
    });
  },

  getInviteLink: async (roomId) => {
    return apiRequest(`/api/rooms/${roomId}/invite-link`);
  },
};

/**
 * Dashboard API
 */
export const dashboardAPI = {
  getMe: async () => {
    return apiRequest('/api/dashboard/me');
  },

  getStats: async () => {
    return apiRequest('/api/dashboard/stats');
  },

  getQueue: async () => {
    return apiRequest('/api/dashboard/queue');
  },
};

/**
 * Queue API (Call Host)
 */
export const queueAPI = {
  callHost: async (sessionId) => {
    return apiRequest('/api/queue/call-host', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
  },

  getQueueStatus: async (sessionId) => {
    return apiRequest(`/api/queue/status/${sessionId}`);
  },

  acceptRequest: async (queueId) => {
    return apiRequest(`/api/queue/${queueId}/accept`, {
      method: 'POST',
    });
  },

  declineRequest: async (queueId) => {
    return apiRequest(`/api/queue/${queueId}/decline`, {
      method: 'POST',
    });
  },
};
