/**
 * WebRTC utilities for real-time audio streaming
 * 
 * Note: This is a basic implementation. For production use with server-side processing,
 * you may need a media server (Janus, Kurento, Mediasoup) or use WebRTC DataChannels
 * for signaling while using HTTP for audio upload.
 */

class WebRTCClient {
  constructor(sessionId, onAudioStream, onError) {
    this.sessionId = sessionId;
    this.onAudioStream = onAudioStream;
    this.onError = onError;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.ws = null; // WebSocket for signaling
    this.isInitiator = false;
    
    // ICE servers configuration
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  /**
   * Initialize WebRTC connection
   * @param {WebSocket} websocket - WebSocket connection for signaling
   * @param {boolean} isInitiator - Whether this client initiates the connection
   */
  async initialize(websocket, isInitiator = false) {
    this.ws = websocket;
    this.isInitiator = isInitiator;

    // Create RTCPeerConnection
    this.peerConnection = new RTCPeerConnection(this.iceServers);

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'webrtc_ice_candidate',
          candidate: event.candidate,
          target_id: this.isInitiator ? 'server' : null
        }));
      }
    };

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      if (this.onAudioStream) {
        this.onAudioStream(this.remoteStream);
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log('WebRTC connection state:', this.peerConnection.connectionState);
      if (this.peerConnection.connectionState === 'failed') {
        if (this.onError) {
          this.onError(new Error('WebRTC connection failed'));
        }
      }
    };

    // Get local audio stream
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true,
        video: false 
      });
      
      // Add tracks to peer connection
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // If initiator, create and send offer
      if (isInitiator) {
        await this.createOffer();
      }
    } catch (error) {
      console.error('Error accessing microphone:', error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Create and send SDP offer
   */
  async createOffer() {
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      
      await this.peerConnection.setLocalDescription(offer);
      
      this.ws.send(JSON.stringify({
        type: 'webrtc_offer',
        offer: offer,
        target_id: 'server'
      }));
    } catch (error) {
      console.error('Error creating offer:', error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Handle incoming SDP offer
   */
  async handleOffer(offer) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      this.ws.send(JSON.stringify({
        type: 'webrtc_answer',
        answer: answer,
        target_id: this.isInitiator ? 'server' : null
      }));
    } catch (error) {
      console.error('Error handling offer:', error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Handle incoming SDP answer
   */
  async handleAnswer(answer) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async handleIceCandidate(candidate) {
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Close WebRTC connection
   */
  close() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
  }

  /**
   * Get local audio stream
   */
  getLocalStream() {
    return this.localStream;
  }

  /**
   * Get remote audio stream
   */
  getRemoteStream() {
    return this.remoteStream;
  }
}

/**
 * Create a WebRTC client for a participant session
 * @param {string} sessionId - Session ID
 * @param {WebSocket} websocket - WebSocket connection for signaling
 * @param {function} onAudioStream - Callback when remote audio stream is received
 * @param {function} onError - Callback for errors
 * @param {boolean} isInitiator - Whether to initiate the connection
 * @returns {WebRTCClient} WebRTC client instance
 */
export function createWebRTCClient(sessionId, websocket, onAudioStream, onError, isInitiator = true) {
  const client = new WebRTCClient(sessionId, onAudioStream, onError);
  client.initialize(websocket, isInitiator);
  return client;
}

/**
 * Process WebRTC signaling messages
 * @param {WebRTCClient} webrtcClient - WebRTC client instance
 * @param {object} message - WebSocket message
 */
export function handleWebRTCSignaling(webrtcClient, message) {
  switch (message.type) {
    case 'webrtc_offer':
      webrtcClient.handleOffer(message.offer);
      break;
    case 'webrtc_answer':
      webrtcClient.handleAnswer(message.answer);
      break;
    case 'webrtc_ice_candidate':
      webrtcClient.handleIceCandidate(message.candidate);
      break;
    default:
      console.warn('Unknown WebRTC message type:', message.type);
  }
}
