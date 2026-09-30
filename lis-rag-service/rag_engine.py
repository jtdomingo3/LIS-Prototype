import re
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.utils import embedding_functions

from config import DATA_DIR, COLLECTION_NAME, resolve_manual_path


def slugify(text: str) -> str:
    s = re.sub(r'[^\w\s-]', '', text.lower()).strip()
    return re.sub(r'[\s_-]+', '-', s)


class SmartMarkdownChunker:
    """
    Parses Markdown technical manuals into logical, self-contained chunks
    grouped by headings, keeping formulas, procedures, and tables intact.
    """

    @staticmethod
    def chunk_document(content: str, source_name: str = "USER_MANUAL.md") -> List[Dict[str, Any]]:
        lines = content.replace('\r\n', '\n').split('\n')
        chunks: List[Dict[str, Any]] = []

        current_h1 = "Gezyne LIS Manual"
        current_h2 = ""
        current_h3 = ""
        current_lines: List[str] = []

        def flush_chunk():
            nonlocal current_lines
            text = "\n".join(current_lines).strip()
            if not text:
                return

            # Build contextual header for optimal vector retrieval
            breadcrumbs = [b for b in [current_h1, current_h2, current_h3] if b]
            context_title = " > ".join(breadcrumbs)
            
            # Combine header with text for enriched embedding
            chunk_content = f"### Section: {context_title}\n\n{text}"
            chunk_id = hashlib.sha256(chunk_content.encode('utf-8')).hexdigest()[:16]

            chunks.append({
                "id": f"chunk_{len(chunks)+1}_{chunk_id}",
                "text": chunk_content,
                "metadata": {
                    "source": source_name,
                    "title": context_title,
                    "h1": current_h1,
                    "h2": current_h2,
                    "h3": current_h3,
                    "length": len(chunk_content)
                }
            })
            current_lines = []

        for line in lines:
            trimmed = line.strip()

            if trimmed.startswith('# '):
                flush_chunk()
                current_h1 = trimmed[2:].strip()
                current_h2 = ""
                current_h3 = ""
                current_lines.append(line)
            elif trimmed.startswith('## '):
                flush_chunk()
                current_h2 = trimmed[3:].strip()
                current_h3 = ""
                current_lines.append(line)
            elif trimmed.startswith('### '):
                flush_chunk()
                current_h3 = trimmed[4:].strip()
                current_lines.append(line)
            else:
                current_lines.append(line)

        flush_chunk()
        return chunks


class RagEngine:
    def __init__(self, data_dir: str = DATA_DIR, collection_name: str = COLLECTION_NAME):
        self.data_dir = data_dir
        self.collection_name = collection_name
        self.client = chromadb.PersistentClient(path=self.data_dir)

        # Uses Chroma's built-in all-MiniLM-L6-v2 ONNX embedding function from Hugging Face
        # Runs fully local, fast inference, no PyTorch overhead.
        self.embedding_fn = embedding_functions.DefaultEmbeddingFunction()

        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            embedding_function=self.embedding_fn,
            metadata={"description": "Gezyne LIS Official Documentation & Knowledge Base"}
        )
        self.last_synced_mtime = 0.0

    def sync_manual(self, force: bool = False) -> Dict[str, Any]:
        """
        Reads USER_MANUAL.md, chunks it, and indexes into ChromaDB.
        """
        manual_path = resolve_manual_path()
        if not manual_path.exists():
            return {"success": False, "error": f"Manual not found at {manual_path}"}

        stat = manual_path.stat()
        if not force and stat.st_mtime == self.last_synced_mtime and self.collection.count() > 0:
            return {
                "success": True,
                "synced": False,
                "reason": "Already up to date",
                "count": self.collection.count(),
                "path": str(manual_path)
            }

        content = manual_path.read_text(encoding="utf-8")
        chunks = SmartMarkdownChunker.chunk_document(content, source_name=manual_path.name)

        if not chunks:
            return {"success": False, "error": "No chunks extracted from manual"}

        # Clear previous documents from this collection to maintain clean index
        existing_count = self.collection.count()
        if existing_count > 0:
            existing_ids = self.collection.get()["ids"]
            if existing_ids:
                self.collection.delete(ids=existing_ids)

        # Upsert chunks into ChromaDB
        ids = [c["id"] for c in chunks]
        documents = [c["text"] for c in chunks]
        metadatas = [c["metadata"] for c in chunks]

        self.collection.upsert(
            ids=ids,
            documents=documents,
            metadatas=metadatas
        )

        self.last_synced_mtime = stat.st_mtime
        print(f"[RAG Engine] Indexed {len(chunks)} knowledge chunks into ChromaDB from {manual_path}")

        return {
            "success": True,
            "synced": True,
            "chunks_count": len(chunks),
            "collection_count": self.collection.count(),
            "manual_path": str(manual_path)
        }

    def query(self, query_text: str, top_k: int = 4) -> Dict[str, Any]:
        """
        Performs semantic vector search across the indexed knowledge base.
        """
        # Ensure collection has documents
        if self.collection.count() == 0:
            self.sync_manual()

        query_clean = query_text.strip()
        if not query_clean:
            return {"results": [], "combined_context": ""}

        results = self.collection.query(
            query_texts=[query_clean],
            n_results=min(top_k, max(1, self.collection.count()))
        )

        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        formatted_results = []
        combined_parts = []

        for i in range(len(docs)):
            doc_text = docs[i]
            meta = metas[i] if i < len(metas) else {}
            dist = distances[i] if i < len(distances) else 1.0
            # Cosine similarity approximation: 1 / (1 + distance)
            relevance = round(1.0 / (1.0 + float(dist)), 4)

            formatted_results.append({
                "title": meta.get("title", "Section"),
                "text": doc_text,
                "relevance": relevance,
                "metadata": meta
            })
            combined_parts.append(doc_text)

        combined_context = "\n\n---\n\n".join(combined_parts)

        return {
            "query": query_clean,
            "results_count": len(formatted_results),
            "results": formatted_results,
            "combined_context": combined_context
        }

    def get_stats(self) -> Dict[str, Any]:
        return {
            "collection_name": self.collection_name,
            "total_chunks": self.collection.count(),
            "storage_path": self.data_dir,
            "embedding_model": "all-MiniLM-L6-v2 (ONNX HuggingFace)",
            "manual_path": str(resolve_manual_path())
        }
