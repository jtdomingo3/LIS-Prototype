# Gezyne LIS — Python RAG & Vector Search Microservice

This microservice provides high-speed, local semantic vector search (Retrieval-Augmented Generation / RAG) for **GezyneBot AI** in the Gezyne Clinical Laboratory Information System.

It parses and indexes [`docs/USER_MANUAL.md`](../docs/USER_MANUAL.md) into **ChromaDB** using Hugging Face's lightweight **`all-MiniLM-L6-v2`** ONNX embedding model. When a user asks GezyneBot a question, this service retrieves only the top-relevant sections (procedures, tables, LaTeX formulas), reducing AI token usage by over 80%.

---

## 🛠️ Architecture & Features

- **Framework:** FastAPI with Uvicorn (asynchronous, high-throughput local HTTP API).
- **Vector Database:** ChromaDB (embedded, persistent local storage in `data/chroma_db/`, no Docker or external database needed).
- **Embedding Model:** `all-MiniLM-L6-v2` (ONNX Runtime, ~80MB, fast CPU inference).
- **Smart Markdown Chunker:** Section-aware chunking preserving headings, steps, tables, and LaTeX equations.
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

### C. Testing a Semantic Query (`/rag/query`)

Test retrieving knowledge for a specific operational or clinical question:

**PowerShell:**

```powershell
$body = @{
    question = "How do I calculate SDI and what are the warning thresholds?"
    top_k = 3
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8765/rag/query" -Method Post -ContentType "application/json" -Body $body
```

**cURL:**

```bash
curl -X POST "http://127.0.0.1:8765/rag/query" \
     -H "Content-Type: application/json" \
     -d '{"question": "How do I calculate SDI and what are the warning thresholds?", "top_k": 3}'
```

**Expected Output:**
Returns ranked chunks with similarity scores (`relevance`), matching section titles (e.g. `7. NEQAS & Dynamic External Reference Laboratories`), and the full context snippet including the LaTeX equation:

$$
\text{SDI} = \frac{\text{Lab Result} - \text{Peer Group Mean}}{\text{Peer Group SD}}
$$

---

### D. Syncing the Knowledge Base (`/rag/sync`)

Whenever you update `docs/USER_MANUAL.md`, call `/rag/sync` to immediately re-chunk and re-embed:

**PowerShell:**

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8765/rag/sync" -Method Post -ContentType "application/json" -Body '{"force": true}'
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
  - The Tray Installer: `lis-fullstack/tray/dist/Gezyne LIS Server Setup 2.6.3.exe`
