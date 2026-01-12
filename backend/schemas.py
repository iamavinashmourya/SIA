"""
Pydantic schemas for request/response models
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
from datetime import datetime


# Authentication Schemas
class HostRegister(BaseModel):
    email: EmailStr
    password: str
    name: str


class HostLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    host: Dict[str, Any]


class HostResponse(BaseModel):
    id: str
    email: str
    name: str


# Room Schemas
class RoomCreate(BaseModel):
    name: str
    context: Optional[str] = None
    knowledge_base: Optional[Dict[str, Any]] = {}
    tone: Optional[str] = "professional"  # professional, strict, casual


class RoomResponse(BaseModel):
    id: str
    host_id: str
    name: str
    context: Optional[str]
    knowledge_base: Dict[str, Any]
    tone: str
    invite_link: str
    created_at: datetime
    updated_at: datetime
    active: bool


class RoomUpdate(BaseModel):
    name: Optional[str] = None
    context: Optional[str] = None
    knowledge_base: Optional[Dict[str, Any]] = None
    tone: Optional[str] = None
    active: Optional[bool] = None


# Participant and Session Schemas
class ParticipantJoin(BaseModel):
    invite_link: str
    name: str  # Participant name for identity verification


class SessionResponse(BaseModel):
    session_id: str
    participant_id: str
    room_id: str
    participant_name: str
    room_name: str
    started_at: datetime


class ParticipantResponse(BaseModel):
    id: str
    room_id: str
    name: str
    session_id: Optional[str]
    joined_at: datetime
    status: str


# Queue Schemas
class CallHostRequest(BaseModel):
    session_id: str


class QueueStatusResponse(BaseModel):
    queue_id: Optional[str]
    position: Optional[int]
    status: str  # waiting, accepted, declined, expired, none
    message: str


class QueueActionResponse(BaseModel):
    message: str
    queue_id: str
    status: str
