from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import HOST, PORT
from rag_engine import RagEngine

# Initialize RAG Engine singleton
engine: Optional[RagEngine] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    print("[RAG Service] Initializing ChromaDB and Knowledge Base...")
    engine = RagEngine()
    # Sync knowledge manual on initial boot
    try:
        res = engine.sync_manual()
        print(f"[RAG Service] Startup sync complete: {res.get('chunks_count', 0)} chunks ready.")
    except Exception as e:
        print(f"[RAG Service] Startup sync error: {e}")
    yield
    print("[RAG Service] Shutting down...")


app = FastAPI(
    title="Gezyne LIS RAG & ML Microservice",
    description="Vector Search with ChromaDB and future ML Pipelines for Gezyne LIS",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local Node.js / Electron / Web communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    question: str = Field(..., description="User query or clinical/operational question")
    top_k: int = Field(default=4, ge=1, le=10, description="Number of most relevant knowledge chunks to retrieve")


class SyncRequest(BaseModel):
    force: bool = Field(default=False, description="Force re-indexing even if file modification time is unchanged")


@app.get("/health")
def health_check():
    stats = engine.get_stats() if engine else {}
    return {
        "status": "healthy",
        "service": "lis-rag-service",
        "engine_ready": engine is not None,
        "total_chunks": stats.get("total_chunks", 0)
    }


@app.post("/rag/query")
def query_knowledge(req: QueryRequest):
    if not engine:
        raise HTTPException(status_code=503, detail="RAG Engine not initialized")

    try:
        result = engine.query(query_text=req.question, top_k=req.top_k)
        return {
            "success": True,
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/sync")
def sync_knowledge(req: SyncRequest = SyncRequest()):
    if not engine:
        raise HTTPException(status_code=503, detail="RAG Engine not initialized")

    try:
        result = engine.sync_manual(force=req.force)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rag/stats")
def get_stats():
    if not engine:
        raise HTTPException(status_code=503, detail="RAG Engine not initialized")
    return {
        "success": True,
        **engine.get_stats()
    }


@app.get("/ml/status")
def get_ml_status():
    """
    Extensible status endpoint for future Machine Learning pipelines
    (e.g., test volume forecasting with Linear Regression, anomaly detection in QC,
    decision trees for test triage).
    """
    return {
        "status": "ready",
        "frameworks_supported": ["scikit-learn", "numpy", "pandas", "huggingface"],
        "pipelines": {
            "qc_drift_regression": "planned",
            "inventory_runout_forecasting": "planned",
            "decision_tree_triage": "planned"
        }
    }


if __name__ == "__main__":
    import uvicorn
    print(f"Starting Gezyne LIS RAG Microservice on http://{HOST}:{PORT}")
    uvicorn.run("app:app", host=HOST, port=PORT, reload=False)
