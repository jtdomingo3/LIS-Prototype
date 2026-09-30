import asyncio
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import HOST, PORT
from rag_engine import RagEngine
from web_search import search_web, format_web_snippets_context, is_web_search_available

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
    enable_web: bool = Field(default=False, description="Enable live web search snippets alongside vector knowledge")


class WebSearchRequest(BaseModel):
    query: str = Field(..., description="Query string to search the web")
    max_results: int = Field(default=3, ge=1, le=10, description="Maximum number of snippets to return")


class SyncRequest(BaseModel):
    force: bool = Field(default=False, description="Force re-indexing even if file modification time is unchanged")


@app.get("/health")
def health_check():
    stats = engine.get_stats() if engine else {}
    return {
        "status": "healthy",
        "service": "lis-rag-service",
        "engine_ready": engine is not None,
        "total_chunks": stats.get("total_chunks", 0),
        "web_search_available": is_web_search_available()
    }


@app.post("/rag/query")
async def query_knowledge(req: QueryRequest):
    if not engine:
        raise HTTPException(status_code=503, detail="RAG Engine not initialized")

    try:
        # Run ChromaDB vector search in worker thread
        vector_task = asyncio.to_thread(engine.query, query_text=req.question, top_k=req.top_k)

        web_results = []
        if req.enable_web:
            # Query web search concurrently with ChromaDB
            web_task = asyncio.to_thread(search_web, query=req.question, max_results=3, timeout_seconds=6)
            result, web_results = await asyncio.gather(vector_task, web_task)
        else:
            result = await vector_task

        combined = result.get("combined_context", "")
        if web_results:
            web_context = format_web_snippets_context(web_results)
            combined = (combined + "\n\n" + web_context).strip()

        return {
            "success": True,
            **result,
            "combined_context": combined,
            "web_search_enabled": req.enable_web,
            "web_results": web_results or []
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/web/search")
async def direct_web_search(req: WebSearchRequest):
    """
    Direct web search endpoint.
    Retrieves succinct snippet citations without touching local ChromaDB vector memory.
    """
    try:
        results = await asyncio.to_thread(search_web, query=req.query, max_results=req.max_results, timeout_seconds=6)
        context = format_web_snippets_context(results)
        return {
            "success": True,
            "query": req.query,
            "count": len(results),
            "results": results,
            "formatted_context": context
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
    uvicorn.run(app, host=HOST, port=PORT, reload=False)

