import os
import sys
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
DIST_DIR = BASE_DIR / "dist"
BUILD_DIR = BASE_DIR / "build"

def build():
    print("=" * 60)
    print("Building Gezyne LIS RAG Microservice Executable (rag.exe)")
    print("=" * 60)

    # Ensure output directories exist
    DIST_DIR.mkdir(exist_ok=True)
    BUILD_DIR.mkdir(exist_ok=True)

    cmd = [
        sys.executable,
        "-m", "PyInstaller",
        "--noconfirm",
        "--clean",
        "--name", "rag",
        "--onedir",  # onedir is significantly faster to launch and ideal for desktop tray bundling
        "--collect-all", "chromadb",
        "--collect-all", "onnxruntime",
        "--collect-all", "uvicorn",
        "--collect-all", "fastapi",
        "--collect-all", "pydantic",
        "--collect-all", "starlette",
        "--collect-all", "ddgs",
        "--collect-all", "duckduckgo_search",
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.protocols",
        "--hidden-import", "uvicorn.protocols.http",
        "--hidden-import", "uvicorn.protocols.http.auto",
        "--hidden-import", "uvicorn.protocols.http.h11_impl",
        "--hidden-import", "uvicorn.protocols.http.httptools_impl",
        "--hidden-import", "uvicorn.protocols.websockets",
        "--hidden-import", "uvicorn.protocols.websockets.auto",
        "--hidden-import", "uvicorn.lifespans",
        "--hidden-import", "uvicorn.lifespans.on",
        "--hidden-import", "uvicorn.lifespans.off",
        "--hidden-import", "chromadb.telemetry.product.posthog",
        "--hidden-import", "chromadb.api.segment",
        "--distpath", str(DIST_DIR),
        "--workpath", str(BUILD_DIR),
        str(BASE_DIR / "app.py")
    ]

    print("Running command:")
    print(" ".join(cmd))
    print("-" * 60)

    res = subprocess.run(cmd, cwd=str(BASE_DIR))
    if res.returncode == 0:
        exe_path = DIST_DIR / "rag" / "rag.exe"
        print("=" * 60)
        print(f"SUCCESS: rag.exe built at: {exe_path}")
        print(f"Exists: {exe_path.exists()}")
        print("=" * 60)
        return True
    else:
        print(f"FAILED with return code {res.returncode}")
        return False

if __name__ == "__main__":
    success = build()
    sys.exit(0 if success else 1)
