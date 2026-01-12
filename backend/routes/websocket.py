"""
WebSocket routes for real-time communication
"""
import json
import logging
from datetime import datetime
from typing import Dict, Set
from fastapi import WebSocket, WebSocketDisconnect, HTTPException
from fastapi.routing import APIRouter
from database import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])

# Connection management
class ConnectionManager:
    """Manages WebSocket connections"""
    
    def __init__(self):
        # Store connections by type and identifier
        # Format: {type: {identifier: websocket}}
        # Types: "host", "participant"
        self.connections: Dict[str, Dict[str, WebSocket]] = {
            "host": {},  # host_id -> WebSocket
            "participant": {}  # session_id -> WebSocket
        }
        # Room subscriptions: {room_id: Set[session_id or host_id]}
        self.room_subscriptions: Dict[str, Set[str]] = {}
    
    async def connect(self, websocket: WebSocket, connection_type: str, identifier: str):
        """Connect a WebSocket client"""
        await websocket.accept()
        if connection_type not in self.connections:
            self.connections[connection_type] = {}
        self.connections[connection_type][identifier] = websocket
        logger.info(f"WebSocket connected: {connection_type}:{identifier}")
    
    def disconnect(self, connection_type: str, identifier: str):
        """Disconnect a WebSocket client"""
        if connection_type in self.connections:
            self.connections[connection_type].pop(identifier, None)
        # Remove from room subscriptions
        for room_id, subscribers in self.room_subscriptions.items():
            subscribers.discard(identifier)
        logger.info(f"WebSocket disconnected: {connection_type}:{identifier}")
    
    async def send_personal_message(self, message: dict, connection_type: str, identifier: str):
        """Send message to a specific connection"""
        if connection_type in self.connections:
            websocket = self.connections[connection_type].get(identifier)
            if websocket:
                try:
                    await websocket.send_json(message)
                    return True
                except Exception as e:
                    logger.error(f"Error sending message to {connection_type}:{identifier}: {e}")
                    return False
        return False
    
    async def broadcast_to_room(self, message: dict, room_id: str, exclude: str = None):
        """Broadcast message to all subscribers of a room"""
        subscribers = self.room_subscriptions.get(room_id, set())
        sent_count = 0
        
        for subscriber_id in subscribers:
            if subscriber_id == exclude:
                continue
            
            # Try to find subscriber in host or participant connections
            sent = False
            if subscriber_id in self.connections.get("host", {}):
                sent = await self.send_personal_message(
                    message, "host", subscriber_id
                )
            elif subscriber_id in self.connections.get("participant", {}):
                sent = await self.send_personal_message(
                    message, "participant", subscriber_id
                )
            
            if sent:
                sent_count += 1
        
        logger.info(f"Broadcasted to {sent_count} subscribers in room {room_id}")
        return sent_count
    
    def subscribe_to_room(self, room_id: str, identifier: str):
        """Subscribe a connection to a room"""
        if room_id not in self.room_subscriptions:
            self.room_subscriptions[room_id] = set()
        self.room_subscriptions[room_id].add(identifier)
        logger.info(f"{identifier} subscribed to room {room_id}")
    
    def unsubscribe_from_room(self, room_id: str, identifier: str):
        """Unsubscribe a connection from a room"""
        if room_id in self.room_subscriptions:
            self.room_subscriptions[room_id].discard(identifier)
        logger.info(f"{identifier} unsubscribed from room {room_id}")


# Global connection manager
manager = ConnectionManager()


@router.websocket("/host/{host_id}")
async def websocket_host(websocket: WebSocket, host_id: str):
    """
    WebSocket endpoint for host connections
    Provides real-time updates for:
    - New queue requests
    - Queue status changes
    - Room updates
    """
    await manager.connect(websocket, "host", host_id)
    
    try:
        # Verify host exists
        supabase = get_supabase_client()
        host_response = supabase.table("hosts")\
            .select("id")\
            .eq("id", host_id)\
            .execute()
        
        if not host_response.data:
            await websocket.close(code=1008, reason="Host not found")
            return
        
        # Subscribe to all host's rooms
        rooms_response = supabase.table("rooms")\
            .select("id")\
            .eq("host_id", host_id)\
            .eq("active", True)\
            .execute()
        
        for room in rooms_response.data or []:
            manager.subscribe_to_room(room["id"], host_id)
        
        # Send welcome message
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket connected",
            "host_id": host_id
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                message_type = message.get("type")
                
                if message_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif message_type == "subscribe_room":
                    room_id = message.get("room_id")
                    if room_id:
                        manager.subscribe_to_room(room_id, host_id)
                        await websocket.send_json({
                            "type": "subscribed",
                            "room_id": room_id
                        })
                elif message_type == "unsubscribe_room":
                    room_id = message.get("room_id")
                    if room_id:
                        manager.unsubscribe_from_room(room_id, host_id)
                        await websocket.send_json({
                            "type": "unsubscribed",
                            "room_id": room_id
                        })
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from host {host_id}: {data}")
            except Exception as e:
                logger.error(f"Error processing message from host {host_id}: {e}")
    
    except WebSocketDisconnect:
        manager.disconnect("host", host_id)
        logger.info(f"Host {host_id} disconnected")
    except Exception as e:
        logger.error(f"Error in host WebSocket: {e}", exc_info=True)
        manager.disconnect("host", host_id)


@router.websocket("/participant/{session_id}")
async def websocket_participant(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for participant connections
    Provides real-time updates for:
    - Queue status changes
    - Session updates
    - Host notifications
    """
    await manager.connect(websocket, "participant", session_id)
    
    try:
        # Verify session exists and get room_id
        supabase = get_supabase_client()
        session_response = supabase.table("sessions")\
            .select("room_id, participant_id")\
            .eq("id", session_id)\
            .is_("ended_at", "null")\
            .execute()
        
        if not session_response.data:
            await websocket.close(code=1008, reason="Session not found or ended")
            return
        
        session = session_response.data[0]
        room_id = session["room_id"]
        
        # Subscribe to room for broadcasts
        manager.subscribe_to_room(room_id, session_id)
        
        # Send welcome message
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket connected",
            "session_id": session_id,
            "room_id": room_id
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                message_type = message.get("type")
                
                if message_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif message_type == "intervention_message":
                    # Participant sending message back to host (for future use)
                    # This would need to find the host_id from the session's room
                    pass
                elif message_type == "webrtc_offer":
                    # Forward WebRTC offer to host (for future use)
                    # Get room_id to find host
                    supabase = get_supabase_client()
                    session_response = supabase.table("sessions")\
                        .select("room_id")\
                        .eq("id", session_id)\
                        .execute()
                    if session_response.data:
                        room_id = session_response.data[0]["room_id"]
                        room_response = supabase.table("rooms")\
                            .select("host_id")\
                            .eq("id", room_id)\
                            .execute()
                        if room_response.data:
                            host_id = room_response.data[0]["host_id"]
                            offer = message.get("offer")
                            if offer:
                                await send_webrtc_offer("host", host_id, offer, session_id)
                elif message_type == "webrtc_answer":
                    # Forward WebRTC answer to host
                    target_id = message.get("target_id")
                    answer = message.get("answer")
                    if target_id and answer:
                        await send_webrtc_answer("host", target_id, answer, session_id)
                elif message_type == "webrtc_ice_candidate":
                    # Forward ICE candidate to host
                    target_id = message.get("target_id")
                    candidate = message.get("candidate")
                    if target_id and candidate:
                        await send_webrtc_ice_candidate("host", target_id, candidate, session_id)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from session {session_id}: {data}")
            except Exception as e:
                logger.error(f"Error processing message from session {session_id}: {e}")
    
    except WebSocketDisconnect:
        manager.disconnect("participant", session_id)
        logger.info(f"Participant session {session_id} disconnected")
    except Exception as e:
        logger.error(f"Error in participant WebSocket: {e}", exc_info=True)
        manager.disconnect("participant", session_id)


# Helper functions to send notifications via WebSocket
async def notify_queue_update(room_id: str, queue_item: dict, action: str):
    """
    Notify all subscribers of a room about queue updates
    action: "new", "accepted", "declined", "removed"
    """
    message = {
        "type": "queue_update",
        "action": action,
        "queue_item": queue_item,
        "room_id": room_id
    }
    await manager.broadcast_to_room(message, room_id)


async def notify_participant_queue_status(session_id: str, queue_status: dict):
    """
    Notify a specific participant about their queue status
    """
    message = {
        "type": "queue_status",
        "status": queue_status
    }
    await manager.send_personal_message(message, "participant", session_id)


async def send_intervention_message(session_id: str, message_text: str, sender: str):
    """
    Send a message to a participant during host intervention
    """
    message = {
        "type": "intervention_message",
        "text": message_text,
        "sender": sender,
        "timestamp": datetime.utcnow().isoformat()
    }
    await manager.send_personal_message(message, "participant", session_id)


# WebRTC Signaling Functions
async def send_webrtc_offer(connection_type: str, identifier: str, offer: dict, target_id: str = None):
    """
    Send WebRTC offer to a connection
    """
    message = {
        "type": "webrtc_offer",
        "offer": offer,
        "target_id": target_id
    }
    return await manager.send_personal_message(message, connection_type, identifier)


async def send_webrtc_answer(connection_type: str, identifier: str, answer: dict, target_id: str = None):
    """
    Send WebRTC answer to a connection
    """
    message = {
        "type": "webrtc_answer",
        "answer": answer,
        "target_id": target_id
    }
    return await manager.send_personal_message(message, connection_type, identifier)


async def send_webrtc_ice_candidate(connection_type: str, identifier: str, candidate: dict, target_id: str = None):
    """
    Send WebRTC ICE candidate to a connection
    """
    message = {
        "type": "webrtc_ice_candidate",
        "candidate": candidate,
        "target_id": target_id
    }
    return await manager.send_personal_message(message, connection_type, identifier)
