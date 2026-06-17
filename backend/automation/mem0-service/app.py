import hmac
import os
import threading
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from mem0 import Memory
from pydantic import BaseModel, Field


MemoryScope = Literal["general", "preference", "project", "decision"]
DEFAULT_USER_ID = os.environ.get("MEM0_USER_ID", "user")
API_TOKEN = os.environ.get("MEM0_API_TOKEN", "")

app = FastAPI(
    title="Dorothy Mem0 Adapter",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

_memory = None
_memory_lock = threading.RLock()


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    scope: MemoryScope | None = None
    limit: int = Field(default=5, ge=1, le=20)


class AddRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    scope: MemoryScope


def require_auth(authorization: str | None = Header(default=None)):
    expected = f"Bearer {API_TOKEN}"
    if not API_TOKEN or not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


def memory_config():
    embedding_dims = int(os.environ.get("MEM0_EMBED_DIMS", "768"))
    return {
        "version": "v1.1",
        "history_db_path": "/data/history.db",
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "collection_name": os.environ.get("MEM0_COLLECTION", "dorothy_memories"),
                "host": os.environ.get("MEM0_QDRANT_HOST", "mem0-qdrant"),
                "port": int(os.environ.get("MEM0_QDRANT_PORT", "6333")),
                "embedding_model_dims": embedding_dims,
                "on_disk": True,
            },
        },
        "llm": {
            "provider": "ollama",
            "config": {
                "model": os.environ.get("MEM0_LLM_MODEL", "llama3.1"),
                "temperature": 0.1,
                "max_tokens": 2000,
                "ollama_base_url": os.environ.get(
                    "MEM0_OLLAMA_BASE_URL",
                    "http://host.docker.internal:11434",
                ),
            },
        },
        "embedder": {
            "provider": "ollama",
            "config": {
                "model": os.environ.get("MEM0_EMBED_MODEL", "nomic-embed-text"),
                "embedding_dims": embedding_dims,
                "ollama_base_url": os.environ.get(
                    "MEM0_OLLAMA_BASE_URL",
                    "http://host.docker.internal:11434",
                ),
            },
        },
    }


def get_memory():
    global _memory
    with _memory_lock:
        if _memory is None:
            _memory = Memory.from_config(memory_config())
        return _memory


def filters_for(scope: MemoryScope | None):
    filters = {"user_id": DEFAULT_USER_ID}
    if scope:
        filters["scope"] = scope
    return filters


def run_memory_operation(operation):
    try:
        with _memory_lock:
            return operation(get_memory())
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/health")
def health():
    run_memory_operation(lambda _memory_instance: True)
    return {
        "ok": True,
        "service": "dorothy-mem0",
        "mem0": "2.0.6",
        "llm": os.environ.get("MEM0_LLM_MODEL", "llama3.1"),
        "embedder": os.environ.get("MEM0_EMBED_MODEL", "nomic-embed-text"),
    }


@app.post("/memories/search", dependencies=[Depends(require_auth)])
def search_memories(request: SearchRequest):
    result = run_memory_operation(
        lambda memory: memory.search(
            request.query,
            top_k=request.limit,
            filters=filters_for(request.scope),
        )
    )
    return {"ok": True, **result}


@app.get("/memories", dependencies=[Depends(require_auth)])
def list_memories(
    scope: MemoryScope | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    result = run_memory_operation(
        lambda memory: memory.get_all(filters=filters_for(scope), top_k=limit)
    )
    return {"ok": True, **result}


@app.post("/memories", dependencies=[Depends(require_auth)])
def add_memory(request: AddRequest):
    result = run_memory_operation(
        lambda memory: memory.add(
            request.text,
            user_id=DEFAULT_USER_ID,
            metadata={
                "scope": request.scope,
                "source": "dorothy-explicit",
            },
            infer=False,
        )
    )
    return {"ok": True, **result}


@app.delete("/memories/{memory_id}", dependencies=[Depends(require_auth)])
def delete_memory(memory_id: str):
    result = run_memory_operation(lambda memory: memory.delete(memory_id))
    return {"ok": True, **result}

