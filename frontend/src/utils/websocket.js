/**
 * WebSocket client utilities for real-time communication
 */

const WS_BASE_URL = 'ws://localhost:8000';

class WebSocketClient {
  constructor(url, onMessage, onError, onOpen, onClose) {
    this.url = url;
    this.ws = null;
    this.onMessage = onMessage;
    this.onError = onError;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.shouldReconnect = true;
  }

  connect() {
    // Don't connect if already connected or connecting
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected:', this.url);
        this.reconnectAttempts = 0;
        if (this.onOpen) this.onOpen();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (this.onMessage) this.onMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        // Only log error, don't spam console
        if (this.ws.readyState === WebSocket.CLOSED) {
          console.error('WebSocket error:', error);
          if (this.onError) this.onError(error);
        }
      };

      this.ws.onclose = (event) => {
        // Only log if not a normal closure
        if (event.code !== 1000) {
          console.log('WebSocket closed:', this.url, 'Code:', event.code);
        }
        if (this.onClose) this.onClose();
        
        // Attempt to reconnect only if we should and connection was not intentionally closed
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts && event.code !== 1000) {
          this.reconnectAttempts++;
          const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30s delay
          console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => {
            if (this.shouldReconnect) {
              this.connect();
            }
          }, delay);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      if (this.onError) this.onError(error);
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not open. Cannot send message.');
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      // Close with normal closure code to prevent reconnection
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Normal closure');
      }
      this.ws = null;
    }
  }

  ping() {
    this.send({ type: 'ping' });
  }
}

/**
 * Create a WebSocket connection for a host
 * @param {string} hostId - Host ID
 * @param {function} onMessage - Callback for received messages
 * @param {function} onError - Callback for errors
 * @returns {WebSocketClient} WebSocket client instance
 */
export function createHostWebSocket(hostId, onMessage, onError) {
  const url = `${WS_BASE_URL}/ws/host/${hostId}`;
  
  return new WebSocketClient(
    url,
    onMessage,
    onError,
    () => console.log('Host WebSocket connected'),
    () => console.log('Host WebSocket disconnected')
  );
}

/**
 * Create a WebSocket connection for a participant
 * @param {string} sessionId - Session ID
 * @param {function} onMessage - Callback for received messages
 * @param {function} onError - Callback for errors
 * @returns {WebSocketClient} WebSocket client instance
 */
export function createParticipantWebSocket(sessionId, onMessage, onError) {
  const url = `${WS_BASE_URL}/ws/participant/${sessionId}`;
  
  return new WebSocketClient(
    url,
    onMessage,
    onError,
    () => console.log('Participant WebSocket connected'),
    () => console.log('Participant WebSocket disconnected')
  );
}
