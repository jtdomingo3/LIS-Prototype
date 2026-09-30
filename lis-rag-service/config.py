import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent

# Server configuration
HOST = os.getenv("RAG_HOST", "127.0.0.1")
PORT = int(os.getenv("RAG_PORT", "8765"))

# ChromaDB persistence storage
DATA_DIR = os.getenv("RAG_DATA_DIR", str(BASE_DIR / "data" / "chroma_db"))
os.makedirs(DATA_DIR, exist_ok=True)

# Collection configuration
COLLECTION_NAME = "gezyne_lis_knowledge"

# Target user manuals to index
MANUAL_CANDIDATES = [
    REPO_ROOT / "docs" / "USER_MANUAL.md",
    REPO_ROOT.parent / "docs" / "USER_MANUAL.md",
    REPO_ROOT / "lis-fullstack" / "docs" / "USER_MANUAL.md",
    REPO_ROOT / "lis-app-standalone" / "docs" / "USER_MANUAL.md",
]

def resolve_manual_path() -> Path:
    for candidate in MANUAL_CANDIDATES:
        if candidate.exists():
            return candidate
    return REPO_ROOT / "docs" / "USER_MANUAL.md"
