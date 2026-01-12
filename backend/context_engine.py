"""
Context Engine - Dynamic prompt generation based on room context and participant info
"""
import logging
from typing import Dict, Any, Optional
from database import get_supabase_client

logger = logging.getLogger(__name__)


def get_participant_context(session_id: str) -> Optional[Dict[str, Any]]:
    """
    Get all context information for a participant session
    
    Returns:
        {
            "host_name": str,
            "room_context": str,
            "participant_name": str,
            "participant_task": dict (from knowledge_base),
            "tone": str,
            "room_id": str,
            "host_id": str
        }
    """
    supabase = get_supabase_client()
    
    try:
        # Get session information
        session_response = supabase.table("sessions")\
            .select("participant_id, room_id, created_at")\
            .eq("id", session_id)\
            .execute()
        
        if not session_response.data:
            logger.warning(f"Session not found: {session_id}")
            return None
        
        session = session_response.data[0]
        participant_id = session["participant_id"]
        room_id = session["room_id"]
        
        # Get participant information
        participant_response = supabase.table("participants")\
            .select("name, room_id")\
            .eq("id", participant_id)\
            .execute()
        
        if not participant_response.data:
            logger.warning(f"Participant not found: {participant_id}")
            return None
        
        participant_name = participant_response.data[0]["name"]
        
        # Get room information (context, knowledge_base, tone, host_id)
        room_response = supabase.table("rooms")\
            .select("context, knowledge_base, tone, host_id, name")\
            .eq("id", room_id)\
            .execute()
        
        if not room_response.data:
            logger.warning(f"Room not found: {room_id}")
            return None
        
        room = room_response.data[0]
        host_id = room["host_id"]
        room_context = room.get("context", "")
        knowledge_base = room.get("knowledge_base", {})
        tone = room.get("tone", "professional")
        
        # Get host information
        host_response = supabase.table("hosts")\
            .select("name")\
            .eq("id", host_id)\
            .execute()
        
        if not host_response.data:
            logger.warning(f"Host not found: {host_id}")
            return None
        
        host_name = host_response.data[0]["name"]
        
        # Get participant-specific task from knowledge_base
        # Knowledge base keys are lowercase participant names
        participant_key = participant_name.lower().strip()
        participant_task = knowledge_base.get(participant_key, {})
        
        # If exact match not found, try case-insensitive search
        if not participant_task:
            for key, value in knowledge_base.items():
                if key.lower() == participant_key:
                    participant_task = value
                    break
        
        return {
            "host_name": host_name,
            "room_context": room_context,
            "participant_name": participant_name,
            "participant_task": participant_task,
            "tone": tone,
            "room_id": room_id,
            "host_id": host_id,
            "room_name": room.get("name", "")
        }
    
    except Exception as e:
        logger.error(f"Error getting participant context: {str(e)}", exc_info=True)
        return None


def build_system_prompt(context: Dict[str, Any]) -> str:
    """
    Build dynamic system prompt from context information
    
    Args:
        context: Context dict from get_participant_context()
    
    Returns:
        Formatted system prompt string
    """
    host_name = context.get("host_name", "the host")
    room_context = context.get("room_context", "")
    participant_name = context.get("participant_name", "the participant")
    participant_task = context.get("participant_task", {})
    tone = context.get("tone", "professional")
    
    # Build tone instructions
    tone_instructions = {
        "professional": "Maintain a professional, business-like tone. Be respectful and clear.",
        "strict": "Be direct and authoritative. Keep responses concise and focused on tasks.",
        "casual": "Use a friendly and relaxed tone. Be approachable and conversational."
    }
    tone_instruction = tone_instructions.get(tone, tone_instructions["professional"])
    
    # Build task description
    task_description = ""
    if participant_task:
        task_parts = []
        
        if participant_task.get("task"):
            task_parts.append(f"Task: {participant_task['task']}")
        
        if participant_task.get("requirements"):
            reqs = participant_task["requirements"]
            if isinstance(reqs, list):
                reqs_str = ", ".join(reqs)
                task_parts.append(f"Requirements: {reqs_str}")
            else:
                task_parts.append(f"Requirements: {reqs}")
        
        if participant_task.get("instructions"):
            task_parts.append(f"Instructions: {participant_task['instructions']}")
        
        # Add any other custom fields
        for key, value in participant_task.items():
            if key not in ["task", "requirements", "instructions"]:
                if isinstance(value, (str, int, float)):
                    task_parts.append(f"{key.capitalize()}: {value}")
                elif isinstance(value, list):
                    task_parts.append(f"{key.capitalize()}: {', '.join(str(v) for v in value)}")
        
        task_description = "\n".join(task_parts)
    
    # Build the system prompt
    prompt_parts = [
        f"You are Sia, an AI Project Manager representing {host_name}.",
        "",
        f"Tone: {tone_instruction}",
        "",
    ]
    
    if room_context:
        prompt_parts.append(f"Project Context:\n{room_context}")
        prompt_parts.append("")
    
    prompt_parts.append(f"Current User: {participant_name}")
    
    if task_description:
        prompt_parts.append("")
        prompt_parts.append(f"Task for {participant_name}:")
        prompt_parts.append(task_description)
    
    prompt_parts.extend([
        "",
        "Goal: Explain the task clearly and answer questions based ONLY on the provided context.",
        "Be helpful, concise, and focused on helping the participant complete their task.",
        "If the participant asks about something outside the context, politely redirect them to their assigned task.",
        "",
        "When the conversation naturally ends and the user says goodbye, append [END_MEETING] to the end of your response."
    ])
    
    return "\n".join(prompt_parts)


def get_dynamic_prompt(session_id: str) -> Optional[str]:
    """
    Get dynamic system prompt for a session
    
    Args:
        session_id: Session ID
    
    Returns:
        System prompt string or None if context not found
    """
    context = get_participant_context(session_id)
    
    if not context:
        logger.warning(f"Could not get context for session: {session_id}")
        return None
    
    return build_system_prompt(context)


def get_context_summary(session_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a summary of context for debugging/logging
    
    Returns:
        Dict with context summary (without full prompts)
    """
    context = get_participant_context(session_id)
    
    if not context:
        return None
    
    return {
        "participant_name": context.get("participant_name"),
        "host_name": context.get("host_name"),
        "room_name": context.get("room_name"),
        "tone": context.get("tone"),
        "has_task": bool(context.get("participant_task")),
        "has_context": bool(context.get("room_context"))
    }
