"""
Authentication routes
"""
from fastapi import APIRouter, HTTPException, status
from schemas import HostRegister, HostLogin, TokenResponse
from auth import register_host, login_host

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(host_data: HostRegister):
    """Register a new host"""
    try:
        result = await register_host(
            email=host_data.email,
            password=host_data.password,
            name=host_data.name
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: HostLogin):
    """Login and get access token"""
    try:
        result = await login_host(
            email=credentials.email,
            password=credentials.password
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}"
        )
