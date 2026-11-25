# Semantic Search MCP — Specification (Phase 2)

> Статус: SPEC ONLY. Не реализовано. Для будущей имплементации.

## Цель

Local MCP server для semantic search по Memory Bank. Заменяет grep-based поиск на vector similarity, обеспечивая смысловой поиск по заметкам, урокам и планам.

## Архитектура

```
┌─────────────────────────────────────────┐
│ Claude Code Agent (Orchestrator)         │
│                                          │
│   /mb search "как мы решали rate limit"  │
│          │                               │
│          ▼                               │
│   MCP Tool Call: search_memory(query)    │
└──────────┬───────────────────────────────┘
           │ stdio / SSE
           ▼
┌─────────────────────────────────────────┐
│ Memory Search MCP Server (Python)        │
│                                          │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ Embedding    │  │ sqlite-vec       │  │
│  │ Engine       │  │ (Vector Store)   │  │
│  │              │  │                  │  │
│  │ local:       │  │ notes.db         │  │
│  │ MiniLM-L6-v2│  │ - id             │  │
│  │ (384 dims)   │  │ - file_path      │  │
│  │              │  │ - chunk_text     │  │
│  │ API fallback:│  │ - embedding vec  │  │
│  │ text-embed-  │  │ - metadata json  │  │
│  │ ding-3-small │  │                  │  │
│  └─────────────┘  └──────────────────┘  │
│                                          │
│  Tools:                                  │
│  - search_memory(query, top_k=5)         │
│  - index_file(file_path)                 │
│  - reindex_all()                         │
│  - get_stats()                           │
└─────────────────────────────────────────┘
```

## MCP Tools

### search_memory

```json
{
  "name": "search_memory",
  "description": "Semantic search across Memory Bank notes, lessons, and plans",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Natural language search query"
      },
      "top_k": {
        "type": "integer",
        "default": 5,
        "description": "Number of results to return"
      },
      "filter_type": {
        "type": "string",
        "enum": ["all", "note", "lesson", "plan", "decision", "pattern"],
        "default": "all"
      },
      "min_score": {
        "type": "number",
        "default": 0.7,
        "description": "Minimum cosine similarity threshold"
      }
    },
    "required": ["query"]
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "file": "notes/2026-03-15_14-30_rate-limiting.md",
      "score": 0.89,
      "type": "pattern",
      "tags": ["rate-limit", "redis", "api"],
      "importance": "high",
      "snippet": "Redis-based sliding window rate limiter..."
    }
  ],
  "total_indexed": 47,
  "query_time_ms": 12
}
```

### index_file

```json
{
  "name": "index_file",
  "description": "Index or re-index a single file in the vector store",
  "inputSchema": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "Path to the file to index"
      }
    },
    "required": ["file_path"]
  }
}
```

### reindex_all

```json
{
  "name": "reindex_all",
  "description": "Rebuild the entire vector index from Memory Bank files",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

### get_stats

```json
{
  "name": "get_stats",
  "description": "Get statistics about the vector index",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

**Response:**
```json
{
  "total_documents": 47,
  "total_chunks": 132,
  "index_size_bytes": 245760,
  "last_reindex": "2026-03-29T14:30:00",
  "embedding_model": "all-MiniLM-L6-v2",
  "db_path": ".memory-bank/search.db"
}
```

## Embedding Strategy

### Primary: Local all-MiniLM-L6-v2

- Dimensions: 384
- Model size: ~80MB
- Inference: ~5ms per chunk on CPU
- Dependencies: `sentence-transformers` (or ONNX runtime for lighter footprint)
- Privacy: all data stays local

### Fallback: OpenAI text-embedding-3-small

- Dimensions: 1536
- Requires OPENAI_API_KEY
- Use when local model unavailable or for higher quality
- Cost: ~$0.02 per 1M tokens

### Chunking

- Split by markdown headers (## as primary separator)
- Max chunk size: 512 tokens
- Overlap: 50 tokens between chunks
- Metadata preserved: file path, frontmatter tags, type, importance

## Storage: sqlite-vec

```sql
CREATE TABLE chunks (
    id INTEGER PRIMARY KEY,
    file_path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    metadata TEXT,  -- JSON: {type, tags, importance, created}
    embedding BLOB  -- sqlite-vec vector
);

CREATE INDEX idx_chunks_file ON chunks(file_path);

-- sqlite-vec virtual table for vector search
CREATE VIRTUAL TABLE vec_chunks USING vec0(
    embedding float[384]
);
```

## Integration Points

### 1. Orchestrator (start.md) -- Sprint Planning

При Step 0.7 Targeted Memory Recall:
```
if MCP server "memory-search" доступен:
  results = search_memory(query="{sprint_features_description}", top_k=5)
  for result in results:
    прочитай result.file  -- только релевантные
else:
  fallback на index.json / grep (текущая реализация Phase 0-1)
```

### 2. MB Manager -- Auto-indexing

При action: note -- после создания заметки:
```
if MCP server "memory-search" доступен:
  index_file(file_path=created_note_path)
```

При action: actualize -- после обновления lessons.md:
```
if MCP server "memory-search" доступен:
  index_file(file_path="lessons.md")
```

### 3. /mb search -- Enhanced Search

```
if MCP server "memory-search" доступен:
  results = search_memory(query=user_query, top_k=10)
else:
  fallback на mb-search.sh (grep-based)
```

## Configuration

В `{FACTORY_ROOT}/config.yaml` или `{MB_ROOT}/config.yaml`:

```yaml
semantic_search:
  enabled: false  # default: off, opt-in
  embedding:
    model: local  # local | openai
    local_model: all-MiniLM-L6-v2
    openai_model: text-embedding-3-small
  vector_db:
    path: "{MB_ROOT}/search.db"
    chunk_size: 512
    chunk_overlap: 50
    min_similarity: 0.7
  auto_index: true  # index new notes automatically
```

## Implementation Plan (future)

1. Python MCP server scaffold (`mcp` SDK)
2. sqlite-vec integration
3. Embedding engine (local + API fallback)
4. Chunking pipeline for .md files
5. 3 tools: search_memory, index_file, reindex_all
6. Integration hooks in start.md, mb-manager.md
7. Config in factory config.yaml
8. Tests: indexing accuracy, search relevance, fallback behavior

## Dependencies

- `mcp` -- MCP Python SDK
- `sqlite-vec` -- SQLite vector extension
- `sentence-transformers` -- local embedding (optional)
- `openai` -- API embedding fallback (optional)

## Performance Targets

| Metric | Target |
|--------|--------|
| Index 100 notes | < 30s |
| Search query | < 50ms |
| DB size per 100 notes | < 5MB |
| Memory usage | < 200MB |
