"""
Supabase database connection and utilities
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Load .env file
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

# Get Supabase credentials from environment
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")  # Service role key for backend
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")  # Anon key for client

class Database:
    """Supabase database client wrapper"""
    
    def __init__(self):
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")
        
        self.client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized")
    
    def get_client(self) -> Client:
        """Get the Supabase client instance"""
        return self.client

# Global database instance
_db_instance: Optional[Database] = None

def get_db() -> Database:
    """Get or create database instance (singleton pattern)"""
    global _db_instance
    if _db_instance is None:
        _db_instance = Database()
    return _db_instance

def get_supabase_client() -> Client:
    """Get Supabase client directly"""
    return get_db().get_client()
