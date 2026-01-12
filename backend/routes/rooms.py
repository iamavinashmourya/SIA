"""
Room management routes
"""
import secrets
from fastapi import APIRouter, HTTPException, status, Depends
from database import get_supabase_client
from auth import get_current_host
from schemas import RoomCreate, RoomResponse, RoomUpdate
from typing import List

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


def generate_invite_link() -> str:
    """Generate a unique invite link"""
    return secrets.token_urlsafe(16)


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(room_data: RoomCreate, current_host: dict = Depends(get_current_host)):
    """Create a new meeting room"""
    supabase = get_supabase_client()
    
    # Generate unique invite link
    invite_link = generate_invite_link()
    
    # Ensure uniqueness (very unlikely collision, but check anyway)
    existing = supabase.table("rooms").select("id").eq("invite_link", invite_link).execute()
    while existing.data:
        invite_link = generate_invite_link()
        existing = supabase.table("rooms").select("id").eq("invite_link", invite_link).execute()
    
    room_data_dict = {
        "host_id": current_host["id"],
        "name": room_data.name,
        "context": room_data.context,
        "knowledge_base": room_data.knowledge_base or {},
        "tone": room_data.tone or "professional",
        "invite_link": invite_link,
        "active": True
    }
    
    response = supabase.table("rooms").insert(room_data_dict).execute()
    
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create room"
        )
    
    return response.data[0]


@router.get("", response_model=List[RoomResponse])
async def list_rooms(current_host: dict = Depends(get_current_host)):
    """Get all rooms for the current host"""
    supabase = get_supabase_client()
    
    response = supabase.table("rooms")\
        .select("*")\
        .eq("host_id", current_host["id"])\
        .order("created_at", desc=True)\
        .execute()
    
    return response.data or []


@router.get("/{room_id}", response_model=RoomResponse)
async def get_room(room_id: str, current_host: dict = Depends(get_current_host)):
    """Get a specific room by ID"""
    supabase = get_supabase_client()
    
    response = supabase.table("rooms")\
        .select("*")\
        .eq("id", room_id)\
        .eq("host_id", current_host["id"])\
        .execute()
    
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    return response.data[0]


@router.patch("/{room_id}", response_model=RoomResponse)
async def update_room(room_id: str, room_data: RoomUpdate, current_host: dict = Depends(get_current_host)):
    """Update a room"""
    supabase = get_supabase_client()
    
    # Verify room belongs to host
    existing = supabase.table("rooms")\
        .select("id")\
        .eq("id", room_id)\
        .eq("host_id", current_host["id"])\
        .execute()
    
    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    # Build update dict (only include non-None values)
    update_dict = {}
    if room_data.name is not None:
        update_dict["name"] = room_data.name
    if room_data.context is not None:
        update_dict["context"] = room_data.context
    if room_data.knowledge_base is not None:
        update_dict["knowledge_base"] = room_data.knowledge_base
    if room_data.tone is not None:
        update_dict["tone"] = room_data.tone
    if room_data.active is not None:
        update_dict["active"] = room_data.active
    
    if not update_dict:
        # No updates, just return existing room
        response = supabase.table("rooms").select("*").eq("id", room_id).execute()
        return response.data[0]
    
    response = supabase.table("rooms")\
        .update(update_dict)\
        .eq("id", room_id)\
        .execute()
    
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update room"
        )
    
    return response.data[0]


@router.get("/{room_id}/invite-link")
async def get_invite_link(room_id: str, current_host: dict = Depends(get_current_host)):
    """Get the full invite link URL for a room"""
    supabase = get_supabase_client()
    
    response = supabase.table("rooms")\
        .select("invite_link, name")\
        .eq("id", room_id)\
        .eq("host_id", current_host["id"])\
        .execute()
    
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    invite_link = response.data[0]["invite_link"]
    # Return full URL (frontend will be at localhost:3000)
    full_url = f"http://localhost:3000/join/{invite_link}"
    
    return {
        "invite_link": invite_link,
        "full_url": full_url,
        "room_name": response.data[0]["name"]
    }


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(room_id: str, current_host: dict = Depends(get_current_host)):
    """Delete a room (soft delete by setting active=false)"""
    supabase = get_supabase_client()
    
    # Verify room belongs to host
    existing = supabase.table("rooms")\
        .select("id")\
        .eq("id", room_id)\
        .eq("host_id", current_host["id"])\
        .execute()
    
    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    # Soft delete
    supabase.table("rooms")\
        .update({"active": False})\
        .eq("id", room_id)\
        .execute()
    
    return None
