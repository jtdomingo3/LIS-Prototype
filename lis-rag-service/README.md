# Gezyne LIS — Python RAG & Vector Search Microservice

This microservice provides high-speed, local semantic vector search (Retrieval-Augmented Generation / RAG) for **GezyneBot AI** in the Gezyne Clinical Laboratory Information System.

It parses and indexes [`docs/USER_MANUAL.md`](../docs/USER_MANUAL.md) into **ChromaDB** using Hugging Face's lightweight **`all-MiniLM-L6-v2`** ONNX embedding model. When a user asks GezyneBot a question, this service retrieves only the top-relevant sections (procedures, tables, LaTeX formulas), reducing AI token usage by over 80%.

---

## 🛠️ Architecture & Features

- **Framework:** FastAPI with Uvicorn (asynchronous, high-throughput local HTTP API).
- **Vector Database:** ChromaDB (embedded, persistent local storage in `data/chroma_db/`, no Docker or external database needed).
- **Embedding Model:** `all-MiniLM-L6-v2` (ONNX Runtime, ~80MB, fast CPU inference).
- **Smart Markdown Chunker:** Section-aware chunking preserving headings, steps, tables, and LaTeX equations.
- **Hybrid Web Search:** Optional DuckDuckGo / Google Custom Search integration (`enable_web: true`) fetching succinct snippet citations without HTML bloat. Defaults to **OFF** to preserve token rate limits and prioritize local LIS SOPs.
- **Port:** `127.0.0.1:8765`.
- **Extensible:** Includes `ml/` scaffold for future scikit-learn models (QC drift linear regressions, test triage decision trees).

---

## 🚀 Quick Start & Local Setup Guide

### 1. Open Terminal & Navigate to Directory

Open PowerShell or Command Prompt:

```powershell
cd "c:\Users\Jeff\repo\LIS Prototype\lis-rag-service"
```

### 2. Create a Python Virtual Environment

Creating an isolated virtual environment (`.venv`) ensures all dependencies stay self-contained:

```powershell
python -m venv .venv
```

### 3. Activate the Virtual Environment

- **In PowerShell:**

  ```powershell
  .\.venv\Scripts\Activate.ps1
  ```

  *(If PowerShell prompts an execution policy error, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process` first)*
- **In Command Prompt (cmd):**

  ```cmd
  .\.venv\Scripts\activate.bat
  ```

Your terminal prompt will now show `(.venv)`.

### 4. Install Dependencies

Install all required libraries (`fastapi`, `uvicorn`, `chromadb`, `pydantic`):

```powershell
pip install -r requirements.txt
```

---

## 🏃 Running the Service Locally

Start the microservice using Python or Uvicorn:

```powershell
python app.py
```

*Or with hot-reload enabled for development:*

```powershell
python -m uvicorn app:app --host 127.0.0.1 --port 8765 --reload
```

You should see:

```text
[RAG Service] Initializing ChromaDB and Knowledge Base...
[RAG Engine] Indexed 27 knowledge chunks into ChromaDB from docs/USER_MANUAL.md
[RAG Service] Startup sync complete: 27 chunks ready.
INFO:     Uvicorn running on http://127.0.0.1:8765 (Press CTRL+C to quit)
```

---

## 🧪 Testing the Service

### A. Interactive Swagger UI (Browser)

Open your web browser and navigate to:
👉 **[http://127.0.0.1:8765/docs](http://127.0.0.1:8765/docs)**

This provides an interactive UI where you can test `/rag/query`, `/rag/sync`, and view schema details directly.

---

### B. Health Check

Verify the service is up and inspect how many chunks are indexed:

**PowerShell:**

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -Method Get
```

**cURL / Git Bash:**

```bash
curl http://127.0.0.1:8765/health
```

**Expected Response:**

```json
{
  "status": "healthy",
  "service": "lis-rag-service",
  "engine_ready": true,
  "total_chunks": 27
}
```

---

### C. Local Semantic Vector Query (`/rag/query` — Web Search OFF)

By default, web search is **disabled (`enable_web: false`)**. This retrieves exclusively from the local ChromaDB vector store of clinical SOPs and manuals:

**PowerShell:**

```powershell
$body = @{
    question = "How do I calculate SDI and what are the warning thresholds?"
    top_k = 3
    enable_web = $false
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8765/rag/query" -Method Post -ContentType "application/json" -Body $body
```

**cURL / Bash:**

```bash
curl -X POST "http://127.0.0.1:8765/rag/query" \
     -H "Content-Type: application/json" \
     -d '{"question": "How do I calculate SDI and what are the warning thresholds?", "top_k": 3, "enable_web": false}'
```

---

### D. Hybrid RAG Query with Web Search Enabled (`/rag/query` — `enable_web: true`)

When a user asks about external or rapidly evolving medical guidelines (e.g., latest DOH PhilPEN circulars, drug testing advisories), you can enable web search. The microservice runs ChromaDB vector search and DuckDuckGo/Google search concurrently with `asyncio.gather`:

**PowerShell:**

```powershell
$body = @{
    question = "Latest DOH PhilPEN hypertension protocol Philippines 2026"
    top_k = 2
    enable_web = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8765/rag/query" -Method Post -ContentType "application/json" -Body $body
```

**cURL / Bash:**

```bash
curl -X POST "http://127.0.0.1:8765/rag/query" \
     -H "Content-Type: application/json" \
     -d '{"question": "Latest DOH PhilPEN hypertension protocol Philippines 2026", "top_k": 2, "enable_web": true}'
```

**JavaScript (`fetch`):**

```javascript
const res = await fetch('http://127.0.0.1:8765/rag/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: 'Latest DOH PhilPEN hypertension protocol Philippines 2026',
    top_k: 2,
    enable_web: true
  })
});
const data = await res.json();
console.log('Web Citations:', data.web_results);
console.log('Combined Context:\n', data.combined_context);
```

**Expected JSON Response Structure:**

```json
{
  "success": true,
  "query": "Latest DOH PhilPEN hypertension protocol Philippines 2026",
  "count": 2,
  "web_search_enabled": true,
  "web_results": [
    {
      "title": "DOH Memo on Clinical Lab Regulations 2025",
      "url": "https://www.scribd.com/document/793665572/dm2024-0165",
      "snippet": "Signature on official laboratory results also follow the transitory provisions of administrative issuances...",
      "source": "Web Result"
    }
  ],
  "results": [
    {
      "chunk_id": "manual_chunk_004",
      "heading": "4. Doctor Consultation Module",
      "relevance": 0.84,
      "text": "..."
    }
  ],
  "combined_context": "=== LOCAL LIS KNOWLEDGE BASE ===\n...\n\n=== EXTERNAL WEB SEARCH CITATIONS ===\n[Web Citation 1] DOH Memo on Clinical Lab Regulations 2025...\nURL: https://www.scribd.com/document/793665572/dm2024-0165\nSnippet: ..."
}
```

---

### E. Standalone Web Search Direct Call (`/web/search`)

If you want to test web search in isolation without querying ChromaDB:

**PowerShell:**

```powershell
$body = @{
    query = "Philippine DOH critical laboratory panic values protocol"
    max_results = 3
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8765/web/search" -Method Post -ContentType "application/json" -Body $body
```

**cURL / Bash:**

```bash
curl -X POST "http://127.0.0.1:8765/web/search" \
     -H "Content-Type: application/json" \
     -d '{"query": "Philippine DOH critical laboratory panic values protocol", "max_results": 3}'
```

**Expected Output:**
Returns raw snippet objects (`title`, `url`, `snippet`, `source`) and formatted text ready for LLM prompt injection.

---

### F. Syncing the Knowledge Base (`/rag/sync`)

Whenever you update `docs/USER_MANUAL.md`, call `/rag/sync` to immediately re-chunk and re-embed:

**PowerShell:**

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8765/rag/sync" -Method Post -ContentType "application/json" -Body '{"force": true}'
```

**cURL / Bash:**

```bash
curl -X POST "http://127.0.0.1:8765/rag/sync" \
     -H "Content-Type: application/json" \
     -d '{"force": true}'
```

---

## 📦 Standalone Executable (`rag.exe`)

For production deployment with the **Windows Tray App**, the service is compiled into a self-contained Windows executable package:

- **Build Output:** [`lis-rag-service/dist/rag/rag.exe`](./dist/rag/rag.exe)
- **Packaged Tray Copy:** [`lis-fullstack/dist/rag/rag.exe`](../lis-fullstack/dist/rag/rag.exe)

### How to Rebuild `rag.exe`:

If you modify `app.py`, `rag_engine.py`, or any dependencies, rebuild `rag.exe` with PyInstaller:

```powershell
cd "c:\Users\Jeff\repo\LIS Prototype\lis-rag-service"
python build_exe.py
```

This automatically bundles FastAPI, Uvicorn, ChromaDB, and the ONNX Runtime into `dist/rag/`.

---

## 🔌 Integration with Fullstack Server & Tray App

### How it works with `lis-fullstack`:

1. `lis-fullstack/lib/ragClient.js` handles all HTTP communication to `http://127.0.0.1:8765`.
2. When `server.js` boots (via `npm start` or the **Tray App**):
   - It checks for the compiled `rag.exe` in `dist/rag/rag.exe`.
   - If `rag.exe` exists, it launches `rag.exe` directly (no Python installation required on the client machine!).
   - If running from source, it falls back to spawning `python app.py`.
3. When staff chat with **GezyneBot AI**, `gezyneBotService.js` fetches top chunks from ChromaDB and injects them into the prompt.
4. **Resilience / Offline Fallback:** If `rag.exe` or Python is stopped or unavailable, GezyneBot automatically falls back to the full static user manual without interrupting the user.

### Starting with the Tray App:

- **In Development:**
  ```powershell
  cd "c:\Users\Jeff\repo\LIS Prototype\lis-fullstack"
  npm run tray
  ```
- **Packaged Executables:**
  - The Fullstack server `.exe`: `lis-fullstack/dist/laboratory-information-system.exe`
  - The Standalone RAG `.exe`: `lis-fullstack/dist/rag/rag.exe`
  - The Tray Installer: `lis-fullstack/tray/dist/Gezyne LIS Server Setup 2.6.4.exe`
