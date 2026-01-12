"""
Queue management routes for Call Host feature
"""
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends
from database import get_supabase_client
from auth import get_current_host
from schemas import CallHostRequest, QueueStatusResponse, QueueActionResponse
from routes.websocket import manager, notify_queue_update, notify_participant_queue_status, send_intervention_message
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/queue", tags=["queue"])


@router.get("/item/{queue_id}")
async def get_queue_item(queue_id: str, current_host: dict = Depends(get_current_host)):
    """Get a specific queue item by ID"""
    supabase = get_supabase_client()
    
    try:
        # Get queue item
        queue_response = supabase.table("queue")\
            .select("*")\
            .eq("id", queue_id)\
            .execute()
        
        if not queue_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Queue item not found"
            )
        
        queue_item = queue_response.data[0]
        room_id = queue_item["room_id"]
        
        # Verify room belongs to host
        room_response = supabase.table("rooms")\
            .select("host_id, name")\
            .eq("id", room_id)\
            .execute()
        
        if not room_response.data or room_response.data[0]["host_id"] != current_host["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this queue item"
            )
        
        # Get participant name
        participant_response = supabase.table("participants")\
            .select("id, name, session_id")\
            .eq("id", queue_item["participant_id"])\
            .execute()
        
        participant_name = participant_response.data[0]["name"] if participant_response.data else "Unknown"
        session_id = participant_response.data[0].get("session_id") if participant_response.data else None
        
        return {
            "id": queue_item["id"],
            "participant_id": queue_item["participant_id"],
            "participant_name": participant_name,
            "room_id": room_id,
            "room_name": room_response.data[0]["name"],
            "session_id": session_id,
            "requested_at": queue_item["requested_at"],
            "status": queue_item["status"]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting queue item: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get queue item: {str(e)}"
        )


@router.post("/call-host", response_model=QueueStatusResponse, status_code=status.HTTP_201_CREATED)
async def call_host(request: CallHostRequest):
    """
    Participant requests host intervention
    
    Flow:
    1. Get session info (participant_id, room_id)
    2. Check if already in queue
    3. Get next position in queue
    4. Create queue entry
    5. Return queue status
    """
    supabase = get_supabase_client()
    
    try:
        # Get session information
        session_response = supabase.table("sessions")\
            .select("participant_id, room_id")\
            .eq("id", request.session_id)\
            .is_("ended_at", "null")\
            .execute()
        
        if not session_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found or ended"
            )
        
        session = session_response.data[0]
        participant_id = session["participant_id"]
        room_id = session["room_id"]
        
        # Check if participant already has a waiting request
        existing_queue = supabase.table("queue")\
            .select("*")\
            .eq("participant_id", participant_id)\
            .eq("status", "waiting")\
            .execute()
        
        if existing_queue.data:
            # Already in queue
            queue_item = existing_queue.data[0]
            return {
                "queue_id": queue_item["id"],
                "position": queue_item["position"],
                "status": "waiting",
                "message": f"You are already in the queue at position {queue_item['position']}"
            }
        
        # Get the next position in queue for this room
        # Get all waiting positions and find the max
        all_positions = supabase.table("queue")\
            .select("position")\
            .eq("room_id", room_id)\
            .eq("status", "waiting")\
            .execute()
        
        next_position = 1
        if all_positions.data:
            max_pos = max([item.get("position", 0) for item in all_positions.data], default=0)
            next_position = max_pos + 1
        
        # Create queue entry
        queue_data = {
            "participant_id": participant_id,
            "room_id": room_id,
            "position": next_position,
            "status": "waiting"
        }
        
        queue_response = supabase.table("queue")\
            .insert(queue_data)\
            .execute()
        
        if not queue_response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create queue entry"
            )
        
        queue_item = queue_response.data[0]
        logger.info(f"Created queue entry {queue_item['id']} for participant {participant_id} at position {next_position}")
        
        # Notify host via WebSocket about new queue request
        await notify_queue_update(room_id, {
            "id": queue_item["id"],
            "participant_id": participant_id,
            "position": next_position,
            "status": "waiting",
            "requested_at": queue_item.get("requested_at")
        }, "new")
        
        # Notify participant about their queue status
        await notify_participant_queue_status(request.session_id, {
            "queue_id": queue_item["id"],
            "position": next_position,
            "status": "waiting"
        })
        
        return {
            "queue_id": queue_item["id"],
            "position": next_position,
            "status": "waiting",
            "message": f"You are in the queue at position {next_position}"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating queue entry: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to request host: {str(e)}"
        )


@router.get("/status/{session_id}", response_model=QueueStatusResponse)
async def get_queue_status(session_id: str):
    """Get queue status for a participant session"""
    supabase = get_supabase_client()
    
    try:
        # Get session to find participant_id
        session_response = supabase.table("sessions")\
            .select("participant_id")\
            .eq("id", session_id)\
            .execute()
        
        if not session_response.data:
            return {
                "queue_id": None,
                "position": None,
                "status": "none",
                "message": "Session not found"
            }
        
        participant_id = session_response.data[0]["participant_id"]
        
        # Get queue entry
        queue_response = supabase.table("queue")\
            .select("*")\
            .eq("participant_id", participant_id)\
            .eq("status", "waiting")\
            .order("requested_at")\
            .limit(1)\
            .execute()
        
        if not queue_response.data:
            return {
                "queue_id": None,
                "position": None,
                "status": "none",
                "message": "Not in queue"
            }
        
        queue_item = queue_response.data[0]
        return {
            "queue_id": queue_item["id"],
            "position": queue_item["position"],
            "status": queue_item["status"],
            "message": f"You are in the queue at position {queue_item['position']}"
        }
    
    except Exception as e:
        logger.error(f"Error getting queue status: {str(e)}", exc_info=True)
        return {
            "queue_id": None,
            "position": None,
            "status": "error",
            "message": "Failed to get queue status"
        }


@router.post("/{queue_id}/accept", response_model=QueueActionResponse)
async def accept_queue_request(queue_id: str, current_host: dict = Depends(get_current_host)):
    """Host accepts a queue request"""
    supabase = get_supabase_client()
    
    try:
        # Get queue item
        queue_response = supabase.table("queue")\
            .select("*")\
            .eq("id", queue_id)\
            .execute()
        
        if not queue_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Queue request not found"
            )
        
        queue_item = queue_response.data[0]
        room_id = queue_item["room_id"]
        
        # Verify room belongs to host
        room_response = supabase.table("rooms")\
            .select("host_id")\
            .eq("id", room_id)\
            .execute()
        
        if not room_response.data or room_response.data[0]["host_id"] != current_host["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to accept this request"
            )
        
        # Update queue status
        update_response = supabase.table("queue")\
            .update({
                "status": "accepted",
                "accepted_at": datetime.utcnow().isoformat()
            })\
            .eq("id", queue_id)\
            .execute()
        
        updated_item = update_response.data[0] if update_response.data else queue_item
        
        # Notify via WebSocket
        await notify_queue_update(room_id, {
            "id": queue_id,
            "participant_id": queue_item["participant_id"],
            "status": "accepted"
        }, "accepted")
        
        # Get session_id to notify participant
        participant_response = supabase.table("participants")\
            .select("session_id")\
            .eq("id", queue_item["participant_id"])\
            .execute()
        
        session_id = None
        if participant_response.data and participant_response.data[0].get("session_id"):
            session_id = participant_response.data[0]["session_id"]
            await notify_participant_queue_status(session_id, {
                "queue_id": queue_id,
                "status": "accepted"
            })
            
            # Notify participant that host is ready to communicate
            try:
                await send_intervention_message(session_id, "Host has accepted your request. How can I help you?", "system")
            except Exception as e:
                logger.warning(f"Could not send intervention message: {e}")
        
        logger.info(f"Host {current_host['id']} accepted queue request {queue_id}")
        
        return {
            "message": "Request accepted",
            "queue_id": queue_id,
            "status": "accepted",
            "participant_id": queue_item["participant_id"],
            "session_id": session_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting queue request: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to accept request: {str(e)}"
        )


@router.post("/{queue_id}/decline", response_model=QueueActionResponse)
async def decline_queue_request(queue_id: str, current_host: dict = Depends(get_current_host)):
    """Host declines a queue request"""
    supabase = get_supabase_client()
    
    try:
        # Get queue item
        queue_response = supabase.table("queue")\
            .select("*")\
            .eq("id", queue_id)\
            .execute()
        
        if not queue_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Queue request not found"
            )
        
        queue_item = queue_response.data[0]
        room_id = queue_item["room_id"]
        
        # Verify room belongs to host
        room_response = supabase.table("rooms")\
            .select("host_id")\
            .eq("id", room_id)\
            .execute()
        
        if not room_response.data or room_response.data[0]["host_id"] != current_host["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to decline this request"
            )
        
        # Update queue status
        update_response = supabase.table("queue")\
            .update({"status": "declined"})\
            .eq("id", queue_id)\
            .execute()
        
        # Notify via WebSocket
        await notify_queue_update(room_id, {
            "id": queue_id,
            "participant_id": queue_item["participant_id"],
            "status": "declined"
        }, "declined")
        
        # Get session_id to notify participant
        participant_response = supabase.table("participants")\
            .select("session_id")\
            .eq("id", queue_item["participant_id"])\
            .execute()
        
        if participant_response.data and participant_response.data[0].get("session_id"):
            session_id = participant_response.data[0]["session_id"]
            await notify_participant_queue_status(session_id, {
                "queue_id": queue_id,
                "status": "declined"
            })
        
        logger.info(f"Host {current_host['id']} declined queue request {queue_id}")
        
        return {
            "message": "Request declined",
            "queue_id": queue_id,
            "status": "declined"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error declining queue request: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to decline request: {str(e)}"
        )
