"""
Dashboard routes for host
"""
from fastapi import APIRouter, Depends
from database import get_supabase_client
from auth import get_current_host
from schemas import HostResponse
from typing import Dict, Any

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/me", response_model=HostResponse)
async def get_current_user(current_host: dict = Depends(get_current_host)):
    """Get current authenticated host info"""
    return current_host


@router.get("/stats")
async def get_dashboard_stats(current_host: dict = Depends(get_current_host)):
    """Get dashboard statistics"""
    supabase = get_supabase_client()
    
    # Count rooms
    rooms_response = supabase.table("rooms")\
        .select("id", count="exact")\
        .eq("host_id", current_host["id"])\
        .execute()
    
    # Count active rooms
    active_rooms_response = supabase.table("rooms")\
        .select("id", count="exact")\
        .eq("host_id", current_host["id"])\
        .eq("active", True)\
        .execute()
    
    # Count total participants across all rooms
    rooms_list = supabase.table("rooms")\
        .select("id")\
        .eq("host_id", current_host["id"])\
        .execute()
    
    room_ids = [room["id"] for room in rooms_list.data] if rooms_list.data else []
    
    total_participants = 0
    if room_ids:
        participants_response = supabase.table("participants")\
            .select("id", count="exact")\
            .in_("room_id", room_ids)\
            .execute()
        total_participants = participants_response.count or 0
    
    # Count active sessions
    active_sessions = 0
    if room_ids:
        sessions_response = supabase.table("sessions")\
            .select("id", count="exact")\
            .in_("room_id", room_ids)\
            .is_("ended_at", "null")\
            .execute()
        active_sessions = sessions_response.count or 0
    
    # Count queue requests
    queue_response = supabase.table("queue")\
        .select("id", count="exact")\
        .in_("room_id", room_ids)\
        .eq("status", "waiting")\
        .execute()
    
    return {
        "total_rooms": rooms_response.count or 0,
        "active_rooms": active_rooms_response.count or 0,
        "total_participants": total_participants,
        "active_sessions": active_sessions,
        "pending_queue_requests": queue_response.count or 0
    }


@router.get("/queue")
async def get_queue(current_host: dict = Depends(get_current_host)):
    """Get queue requests for all host's rooms"""
    supabase = get_supabase_client()
    
    # Get all room IDs for this host
    rooms_response = supabase.table("rooms")\
        .select("id")\
        .eq("host_id", current_host["id"])\
        .execute()
    
    room_ids = [room["id"] for room in rooms_response.data] if rooms_response.data else []
    
    if not room_ids:
        return []
    
    # Get queue entries
    queue_response = supabase.table("queue")\
        .select("*")\
        .in_("room_id", room_ids)\
        .eq("status", "waiting")\
        .order("position")\
        .execute()
    
    # Get participant and room info separately
    queue_items = []
    if queue_response.data:
        participant_ids = [item["participant_id"] for item in queue_response.data]
        room_ids_for_queue = list(set([item["room_id"] for item in queue_response.data]))
        
        # Get participants
        participants_response = supabase.table("participants")\
            .select("id, name")\
            .in_("id", participant_ids)\
            .execute()
        participants_dict = {p["id"]: p["name"] for p in (participants_response.data or [])}
        
        # Get rooms
        rooms_response = supabase.table("rooms")\
            .select("id, name")\
            .in_("id", room_ids_for_queue)\
            .execute()
        rooms_dict = {r["id"]: r["name"] for r in (rooms_response.data or [])}
        
        # Format the response
        for item in queue_response.data:
            queue_items.append({
                "id": item["id"],
                "participant_id": item["participant_id"],
                "participant_name": participants_dict.get(item["participant_id"], "Unknown"),
                "room_id": item["room_id"],
                "room_name": rooms_dict.get(item["room_id"], "Unknown"),
                "requested_at": item["requested_at"],
                "position": item["position"],
                "status": item["status"]
            })
    
    return queue_items
