import os
import sys

# Ensure backend package can be resolved under Vercel runtime paths
workspace_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_root not in sys.path:
    sys.path.insert(0, workspace_root)

# Import the main FastAPI app from backend package
from backend.main import app

# Export the app so Vercel can run it
__all__ = ["app"]
