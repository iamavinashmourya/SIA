"""
Participant and Session management routes
"""
import secrets
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Request
from database import get_supabase_client
from schemas import ParticipantJoin, SessionResponse, ParticipantResponse
from typing import Optional
import logging
from auth import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/participants", tags=["participants"])


@router.post("/join", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def join_room(request: Request, join_data: ParticipantJoin):
    """
    Join a room using an invite link
    
    Flow:
    1. Verify invite link is valid and room is active
    2. Create or find participant record
    3. Create a new session
    4. Return session_id and context information
    """
    supabase = get_supabase_client()
    
    try:
        # Step 1: Verify invite link and get room
        room_response = supabase.table("rooms")\
            .select("*")\
            .eq("invite_link", join_data.invite_link)\
            .eq("active", True)\
            .execute()
        
        if not room_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invalid or inactive invite link"
            )
        
        room = room_response.data[0]
        room_id = room["id"]

        # Prevent logged-in hosts from using the participant join flow
        # We use the Authorization header (if present) to detect any authenticated host.
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
            try:
                payload = decode_token(token)
                # If token is valid and has a subject, treat as host and block
                if payload.get("sub") is not None:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Logged-in hosts cannot join via the participant link. Please log out or use the host dashboard / Call Host flow instead."
                    )
            except HTTPException:
                # If the token is invalid, fall back to treating them as an anonymous participant
                pass
            except Exception as e:
                logging.warning(f"Failed to decode optional host token in join_room: {e}")

        participant_name = join_data.name.strip()
        
        # Step 2: Check if participant already exists for this room and name
        existing_participant_response = supabase.table("participants")\
            .select("*")\
            .eq("room_id", room_id)\
            .eq("name", participant_name)\
            .execute()
        
        participant_id = None
        if existing_participant_response.data:
            # Participant already exists
            participant_id = existing_participant_response.data[0]["id"]
            existing_session_id = existing_participant_response.data[0].get("session_id")
            
            # Check if they have an active session
            if existing_session_id:
                session_response = supabase.table("sessions")\
                    .select("*")\
                    .eq("id", existing_session_id)\
                    .is_("ended_at", "null")\
                    .execute()
                
                if session_response.data:
                    # Active session exists, return it
                    session = session_response.data[0]
                    logger.info(f"Returning existing active session {existing_session_id} for participant {participant_name}")
                    return {
                        "session_id": existing_session_id,
                        "participant_id": participant_id,
                        "room_id": room_id,
                        "participant_name": participant_name,
                        "room_name": room.get("name", ""),
                        "started_at": session["started_at"]
                    }
        
        # Step 3: Create participant if doesn't exist
        if not participant_id:
            participant_data = {
                "room_id": room_id,
                "name": participant_name,
                "status": "active"
            }
            participant_response = supabase.table("participants")\
                .insert(participant_data)\
                .execute()
            
            if not participant_response.data:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create participant"
                )
            
            participant_id = participant_response.data[0]["id"]
            logger.info(f"Created new participant {participant_id} for room {room_id}")
        
        # Step 4: Create new session
        session_data = {
            "participant_id": participant_id,
            "room_id": room_id,
            "transcript": []
        }
        session_response = supabase.table("sessions")\
            .insert(session_data)\
            .execute()
        
        if not session_response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create session"
            )
        
        session = session_response.data[0]
        session_id = session["id"]
        
        # Step 5: Update participant with session_id
        supabase.table("participants")\
            .update({"session_id": session_id})\
            .eq("id", participant_id)\
            .execute()
        
        logger.info(f"Created new session {session_id} for participant {participant_name} in room {room_id}")
        
        return {
            "session_id": session_id,
            "participant_id": participant_id,
            "room_id": room_id,
            "participant_name": participant_name,
            "room_name": room.get("name", ""),
            "started_at": session["started_at"]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error joining room: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to join room: {str(e)}"
        )


@router.get("/session/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """Get session information"""
    supabase = get_supabase_client()
    
    # Get session
    session_response = supabase.table("sessions")\
        .select("*")\
        .eq("id", session_id)\
        .execute()
    
    if not session_response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    session = session_response.data[0]
    participant_id = session["participant_id"]
    room_id = session["room_id"]
    
    # Get participant name
    participant_response = supabase.table("participants")\
        .select("name")\
        .eq("id", participant_id)\
        .execute()
    
    participant_name = participant_response.data[0]["name"] if participant_response.data else "Unknown"
    
    # Get room name
    room_response = supabase.table("rooms")\
        .select("name")\
        .eq("id", room_id)\
        .execute()
    
    room_name = room_response.data[0]["name"] if room_response.data else "Unknown"
    
    return {
        "session_id": session["id"],
        "participant_id": participant_id,
        "room_id": room_id,
        "participant_name": participant_name,
        "room_name": room_name,
        "started_at": session["started_at"]
    }


@router.post("/session/{session_id}/end", status_code=status.HTTP_200_OK)
async def end_session(session_id: str):
    """End a session (mark as completed)"""
    supabase = get_supabase_client()
    
    # Check if session exists
    session_response = supabase.table("sessions")\
        .select("id, ended_at")\
        .eq("id", session_id)\
        .execute()
    
    if not session_response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    session = session_response.data[0]
    if session.get("ended_at"):
        # Already ended
        return {"message": "Session already ended", "session_id": session_id}
    
    # Update session with end time
    supabase.table("sessions")\
        .update({"ended_at": datetime.utcnow().isoformat()})\
        .eq("id", session_id)\
        .execute()
    
    # Update participant status
    participant_response = supabase.table("sessions")\
        .select("participant_id")\
        .eq("id", session_id)\
        .execute()
    
    if participant_response.data:
        participant_id = participant_response.data[0]["participant_id"]
        supabase.table("participants")\
            .update({"status": "completed"})\
            .eq("id", participant_id)\
            .execute()
    
    logger.info(f"Ended session {session_id}")
    
    return {"message": "Session ended successfully", "session_id": session_id}
