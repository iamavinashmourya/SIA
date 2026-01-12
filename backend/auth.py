"""
Authentication utilities for Host users
"""
import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_supabase_client

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60  # 30 days

# HTTP Bearer token scheme
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_host(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Get the current authenticated host from JWT token"""
    token = credentials.credentials
    payload = decode_token(token)
    host_id: str = payload.get("sub")
    
    if host_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    
    # Verify host exists in database
    supabase = get_supabase_client()
    response = supabase.table("hosts").select("id, email, name").eq("id", host_id).execute()
    
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Host not found",
        )
    
    return response.data[0]


async def register_host(email: str, password: str, name: str) -> dict:
    """Register a new host"""
    supabase = get_supabase_client()
    
    # Check if email already exists
    existing = supabase.table("hosts").select("id").eq("email", email).execute()
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Hash password
    password_hash = get_password_hash(password)
    
    # Create host
    host_data = {
        "email": email,
        "name": name,
        "password_hash": password_hash
    }
    
    response = supabase.table("hosts").insert(host_data).execute()
    
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create host"
        )
    
    host = response.data[0]
    
    # Generate JWT token
    access_token = create_access_token(data={"sub": str(host["id"])})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "host": {
            "id": host["id"],
            "email": host["email"],
            "name": host["name"]
        }
    }


async def login_host(email: str, password: str) -> dict:
    """Authenticate a host and return JWT token"""
    supabase = get_supabase_client()
    
    # Find host by email
    response = supabase.table("hosts").select("id, email, name, password_hash").eq("email", email).execute()
    
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    host = response.data[0]
    
    # Verify password
    if not verify_password(password, host["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Generate JWT token
    access_token = create_access_token(data={"sub": str(host["id"])})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "host": {
            "id": host["id"],
            "email": host["email"],
            "name": host["name"]
        }
    }
