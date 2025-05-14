import { io } from 'socket.io-client';

// Create socket instance
let socket = null;

// Base URL for API requests
const API_BASE_URL = 'http://localhost:3333/api';

// Connect to websocket
export const connectSocket = (onConnect, onDisconnect, onLogEvent, onStatusUpdate) => {
  // Close existing connection if any
  if (socket) {
    socket.disconnect();
  }

  // Create new connection
  socket = io('http://localhost:3333', {
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  // Set up event handlers
  socket.on('connect', () => {
    console.log('Socket connected');
    if (onConnect) onConnect();
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    if (onDisconnect) onDisconnect(reason);
  });

  socket.on('log', (data) => {
    if (onLogEvent) onLogEvent(data);
  });

  socket.on('status', (data) => {
    if (onStatusUpdate) onStatusUpdate(data);
  });

  return socket;
};

// API functions
export const fetchLogs = async (limit = 100) => {
  try {
    const response = await fetch(`${API_BASE_URL}/logs?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching logs:', error);
    throw error;
  }
};

export const fetchProxyStatus = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/status`);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching proxy status:', error);
    throw error;
  }
};

export const fetchProxyConfig = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/config`);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching proxy config:', error);
    throw error;
  }
};

export const restartProxy = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/restart`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error restarting proxy:', error);
    throw error;
  }
};

export const setProxyMode = async (mode) => {
  try {
    const response = await fetch(`${API_BASE_URL}/mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error setting proxy mode:', error);
    throw error;
  }
}; 