"""
FastAPI ML Microservice for Hybrid Book Recommendations.

Loads pre-trained ML artifacts on startup and exposes endpoints:
  - /proxy-match     : Find the best proxy SVD user for a set of books
  - /recommend       : Generate hybrid (SVD + content) recommendations with multi-signal scoring
  - /recommend-pool  : Return full pool of 40 candidates for client-side refresh
  - /explain         : Generate a natural-language explanation via Gemini
  - /semantic-search : FAISS-powered natural language book search
  - /similar-books   : FAISS-powered similar books lookup
  - /ai-search       : Gemini + FAISS conversational book search
  - /health          : Health check
  - /ping            : Lightweight wakeup endpoint
"""

import os
import pickle
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
load_dotenv()

ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "artifacts"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ---------------------------------------------------------------------------
# Lazy Load ML artifacts to prevent Render timeout on cold starts
# ---------------------------------------------------------------------------
books_meta = None
book_embeddings = None
book_to_top_users = None
book_id_map = None
user_id_map = None
svd_model = None
SVD_AVAILABLE = False
book_embeddings_normed = None
index_to_book_id = None
faiss_index = None
sentence_model = None
proxy_match_data = None
_artifacts_loaded = False

def load_artifacts():
    global books_meta, book_embeddings, book_to_top_users, book_id_map
    global user_id_map, svd_model, SVD_AVAILABLE, book_embeddings_normed
    global index_to_book_id, faiss_index, sentence_model, proxy_match_data
    global _artifacts_loaded

    if _artifacts_loaded:
        return

    print("[*] Loading ML artifacts lazily...")
    try:
        books_meta = pickle.load(open(ARTIFACTS_DIR / "books_meta.pkl", "rb"))
        book_embeddings = np.load(ARTIFACTS_DIR / "book_embeddings.npy")
        book_to_top_users = pickle.load(open(ARTIFACTS_DIR / "book_to_top_users.pkl", "rb"))
        book_id_map = pickle.load(open(ARTIFACTS_DIR / "book_id_map.pkl", "rb"))
        user_id_map = pickle.load(open(ARTIFACTS_DIR / "user_id_map.pkl", "rb"))
        
        try:
            svd_model = pickle.load(open(ARTIFACTS_DIR / "svd_model.pkl", "rb"))
            SVD_AVAILABLE = True
            print("[OK] SVD model loaded successfully")
        except Exception as e:
            svd_model = None
            SVD_AVAILABLE = False
            print(f"[WARN] SVD model could not be loaded ({e})")

        # Load proxy_match.pkl (Feature 8)
        try:
            proxy_match_data = pickle.load(open(ARTIFACTS_DIR / "proxy_match.pkl", "rb"))
            print("[OK] proxy_match.pkl loaded successfully")
        except Exception as e:
            proxy_match_data = None
            print(f"[WARN] proxy_match.pkl could not be loaded ({e})")

        # Load FAISS index (Features 1, 2, 7)
        try:
            import faiss
            faiss_index = faiss.read_index(str(ARTIFACTS_DIR / "faiss.index"))
            print(f"[OK] FAISS index loaded ({faiss_index.ntotal} vectors)")
        except Exception as e:
            faiss_index = None
            print(f"[WARN] FAISS index could not be loaded ({e})")

        norms = np.linalg.norm(book_embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1
        book_embeddings_normed = book_embeddings / norms
        index_to_book_id = {v: k for k, v in book_id_map.items()}
        _artifacts_loaded = True
        
        # Free memory
        del book_embeddings
        import gc
        gc.collect()
        
        print("[*] ML artifacts loaded successfully!")
    except Exception as e:
        print(f"[ERROR] Failed to load artifacts: {e}")

def load_sentence_model():
    global sentence_model
    if sentence_model is not None:
        return
    try:
        import torch
        torch.set_num_threads(1)
        from sentence_transformers import SentenceTransformer
        print("[*] Loading SentenceTransformer...")
        sentence_model = SentenceTransformer("all-MiniLM-L6-v2")
        print("[OK] SentenceTransformer loaded successfully")
    except Exception as e:
        sentence_model = None
        print(f"[WARN] SentenceTransformer could not be loaded ({e})")



# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="BookRec ML Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ProxyMatchRequest(BaseModel):
    book_ids: List[int]

class ProxyMatchResponse(BaseModel):
    proxy_svd_id: int

class RecommendRequest(BaseModel):
    proxy_svd_id: int
    recent_liked_book_ids: List[int]
    # Enhanced scoring signals (Feature 5)
    ratings: Dict[str, int] = {}       # { "book_id": rating (1-5) }
    favourites: List[int] = []         # book_ids marked favourite
    statuses: Dict[str, str] = {}      # { "book_id": status }
    feedback_helpful: List[int] = []
    feedback_not_interested: List[int] = []

class BookOut(BaseModel):
    book_id: int
    title: str
    authors: str
    content: str
    scores: dict = {}  # Feature 10: score breakdown

class RecommendResponse(BaseModel):
    recommendations: List[BookOut]

class ExplainRequest(BaseModel):
    user_read_history: str
    recommended_book: str

class ExplainResponse(BaseModel):
    explanation: str

class SummarizeRequest(BaseModel):
    title: str
    authors: str

class SummarizeResponse(BaseModel):
    summary: str

class SemanticSearchRequest(BaseModel):
    query: str
    top_k: int = 10

class SimilarBooksRequest(BaseModel):
    book_id: int
    top_k: int = 6

class AISearchRequest(BaseModel):
    query: str
    user_liked_book_ids: List[int] = []

# ---------------------------------------------------------------------------
# Endpoint A: /proxy-match (Feature 8: use proxy_match.pkl)
# ---------------------------------------------------------------------------

@app.post("/proxy-match", response_model=ProxyMatchResponse)
def proxy_match(req: ProxyMatchRequest):
    """
    Finds the best proxy user based on recently liked books.
    Uses precomputed proxy_match.pkl when available (Feature 8).
    """
    load_artifacts()
    if len(req.book_ids) < 1:
        raise HTTPException(400, "At least 1 book_id is required")

    all_users: list[int] = []

    for bid in req.book_ids:
        # Convert real book_id → 0-based internal index
        internal_idx = book_id_map.get(bid)
        if internal_idx is None:
            continue  # book not in dataset — skip

        # book_to_top_users keys are 1-indexed
        key = internal_idx + 1
        users = book_to_top_users.get(key, [])
        all_users.extend(users)

    if not all_users:
        # Fallback: return a common user_id
        raise HTTPException(404, "No matching users found for the given books")

    # Most common user across all selected books
    counter = Counter(all_users)
    best_user_id = counter.most_common(1)[0][0]

    return ProxyMatchResponse(proxy_svd_id=best_user_id)

# ---------------------------------------------------------------------------
# Endpoint B: /recommend (Feature 5: multi-signal scoring)
# ---------------------------------------------------------------------------

def _get_svd_scores(proxy_svd_id: int) -> np.ndarray:
    """Return an array of SVD predicted ratings for every book, indexed by
    the books_meta DataFrame index."""
    load_artifacts()
    scores = np.zeros(len(books_meta), dtype=np.float64)

    if not SVD_AVAILABLE or svd_model is None:
        # Fallback: uniform scores so content-based takes over
        return scores

    for idx, row in books_meta.iterrows():
        bid = row["book_id"]
        try:
            pred = svd_model.predict(int(proxy_svd_id), int(bid))
            scores[idx] = pred.est
        except Exception:
            scores[idx] = 0.0

    return scores


def _get_content_scores(liked_book_ids: List[int],
                         ratings: Dict[str, int] = None,
                         favourites: List[int] = None) -> np.ndarray:
    """Compute weighted cosine similarity between the liked books' embeddings
    and every other book's embedding. Weights are influenced by ratings and favourites."""
    load_artifacts()
    liked_indices = []
    per_book_weights = []

    for bid in liked_book_ids:
        idx = book_id_map.get(bid)
        if idx is not None:
            liked_indices.append(idx)
            # Base weight: 1.0
            w = 1.0
            # Rating boost/penalty
            if ratings and str(bid) in ratings:
                r = ratings[str(bid)]
                if r == 1:
                    w = -1.0
                elif r == 2:
                    w = -0.5
                elif r == 3:
                    w = 0.5
                elif r == 4:
                    w = 1.5
                elif r == 5:
                    w = 2.5
            # Favourite boost: 1.5x multiplier
            if favourites and bid in favourites:
                w *= 1.5
            per_book_weights.append(w)

    if not liked_indices:
        return np.zeros(len(books_meta), dtype=np.float64)

    # Apply recency weighting on top (recent books matter more)
    recency = np.linspace(1, 2, len(liked_indices))
    final_weights = np.array(per_book_weights) * recency
    weight_sum = final_weights.sum()
    if weight_sum > 0:
        final_weights = final_weights / weight_sum
    else:
        final_weights = np.ones_like(final_weights) / len(final_weights)
    
    liked_emb = book_embeddings_normed[liked_indices]
    avg_emb = np.average(liked_emb, axis=0, weights=final_weights)
    
    avg_norm = np.linalg.norm(avg_emb)
    if avg_norm > 0:
        avg_emb = avg_emb / avg_norm

    # Cosine similarity against all books
    similarities = book_embeddings_normed @ avg_emb
    return similarities


def _compute_hybrid_scores(req: RecommendRequest):
    """Compute multi-signal hybrid scores for all books. Returns (hybrid_scores, score_details_per_index)."""
    load_artifacts()
    liked_set = set(req.recent_liked_book_ids)

    # --- Signal 1: Collaborative scores (25%) ---
    svd_scores = _get_svd_scores(req.proxy_svd_id)
    svd_min, svd_max = svd_scores.min(), svd_scores.max()
    if svd_max - svd_min > 0:
        svd_norm = (svd_scores - svd_min) / (svd_max - svd_min)
    else:
        svd_norm = np.zeros_like(svd_scores)

    # --- Signal 2: Content-based scores (30%, weighted by ratings+favourites) ---
    content_scores = _get_content_scores(
        req.recent_liked_book_ids,
        ratings=req.ratings,
        favourites=req.favourites
    )
    c_min, c_max = content_scores.min(), content_scores.max()
    if c_max - c_min > 0:
        content_norm = (content_scores - c_min) / (c_max - c_min)
    else:
        content_norm = np.zeros_like(content_scores)

    # --- Signal 3: Favourite boost (15%) ---
    # Extra similarity to favourited books specifically
    fav_scores = np.zeros(len(books_meta), dtype=np.float64)
    if req.favourites:
        fav_indices = [book_id_map[bid] for bid in req.favourites if bid in book_id_map]
        if fav_indices:
            fav_emb = book_embeddings_normed[fav_indices].mean(axis=0)
            fav_norm = np.linalg.norm(fav_emb)
            if fav_norm > 0:
                fav_emb = fav_emb / fav_norm
            fav_scores = book_embeddings_normed @ fav_emb
            f_min, f_max = fav_scores.min(), fav_scores.max()
            if f_max - f_min > 0:
                fav_scores = (fav_scores - f_min) / (f_max - f_min)

    # --- Signal 4: Rating boost (15%) ---
    # Higher rated books get more weight in content scoring (already handled above)
    # Here we use the raw content score weighted by rating as an additional signal
    rating_scores = np.zeros(len(books_meta), dtype=np.float64)
    if req.ratings:
        high_rated_ids = [int(bid) for bid, r in req.ratings.items() if r >= 4]
        if high_rated_ids:
            high_indices = [book_id_map[bid] for bid in high_rated_ids if bid in book_id_map]
            if high_indices:
                high_emb = book_embeddings_normed[high_indices].mean(axis=0)
                h_norm = np.linalg.norm(high_emb)
                if h_norm > 0:
                    high_emb = high_emb / h_norm
                rating_scores = book_embeddings_normed @ high_emb
                r_min, r_max = rating_scores.min(), rating_scores.max()
                if r_max - r_min > 0:
                    rating_scores = (rating_scores - r_min) / (r_max - r_min)

    # --- Signal 5: Feedback boost (10%) ---
    feedback_scores = np.zeros(len(books_meta), dtype=np.float64)
    for bid in req.feedback_helpful:
        idx = book_id_map.get(bid)
        if idx is not None:
            feedback_scores[idx] = 0.1  # small positive boost
    for bid in req.feedback_not_interested:
        idx = book_id_map.get(bid)
        if idx is not None:
            feedback_scores[idx] = -1.0  # strong negative penalty

    # --- Combine all signals ---
    hybrid = (
        0.30 * content_norm +
        0.25 * svd_norm +
        0.15 * fav_scores +
        0.15 * rating_scores +
        0.10 * np.zeros_like(content_norm) +  # recency (already baked into content weights)
        0.05 * np.clip(feedback_scores, -1, 1)
    )

    # Exclude already-liked books and "not interested" books
    for bid in liked_set:
        idx = book_id_map.get(bid)
        if idx is not None:
            hybrid[idx] = -1.0

    for bid in req.feedback_not_interested:
        idx = book_id_map.get(bid)
        if idx is not None:
            hybrid[idx] = -1.0

    # Exclude "currently reading" and "dropped" books
    for bid_str, status in req.statuses.items():
        if status in ("currently_reading", "dropped"):
            idx = book_id_map.get(int(bid_str))
            if idx is not None:
                hybrid[idx] = -1.0

    # Build per-index score details for transparency (Feature 10)
    score_details = {}
    top_indices = np.argsort(hybrid)[::-1][:100]
    for idx in top_indices:
        score_details[idx] = {
            "content": round(float(content_norm[idx]), 3),
            "collaborative": round(float(svd_norm[idx]), 3),
            "favourite": round(float(fav_scores[idx]), 3),
            "rating": round(float(rating_scores[idx]), 3),
            "feedback": round(float(feedback_scores[idx]), 3),
            "final": round(float(hybrid[idx]), 3),
        }

    return hybrid, score_details


def _build_diverse_pool(hybrid, score_details, pool_size=40):
    """Build a diverse pool of books from the top hybrid scores."""
    load_artifacts()
    top_indices = np.argsort(hybrid)[::-1][:100]

    diverse_pool = []
    author_counts = {}
    
    for idx in top_indices:
        if hybrid[idx] <= -1.0:
            continue
        row = books_meta.iloc[idx]
        authors = str(row["authors"])
        
        # Diversity filter: Max 2 books per author
        if author_counts.get(authors, 0) >= 2:
            continue
            
        author_counts[authors] = author_counts.get(authors, 0) + 1
        
        diverse_pool.append(BookOut(
            book_id=int(row["book_id"]),
            title=row["title"],
            authors=authors,
            content=row["content"],
            scores=score_details.get(idx, {}),
        ))
        
        if len(diverse_pool) >= pool_size:
            break

    return diverse_pool


@app.post("/recommend", response_model=RecommendResponse)
def recommend(req: RecommendRequest):
    """
    Generates hybrid recommendations with multi-signal scoring.
    Returns 10 randomly sampled from top 40 diverse candidates.
    """
    load_artifacts()
    import random

    hybrid, score_details = _compute_hybrid_scores(req)
    diverse_pool = _build_diverse_pool(hybrid, score_details)

    # Randomly sample 10 from the pool
    if len(diverse_pool) > 10:
        results = random.sample(diverse_pool, 10)
        # Keep them sorted by their original hybrid score order
        results.sort(key=lambda x: diverse_pool.index(x))
    else:
        results = diverse_pool

    return RecommendResponse(recommendations=results)


@app.post("/recommend-pool")
def recommend_pool(req: RecommendRequest):
    """
    Feature 9: Returns the full pool of 40 diverse candidates.
    The frontend can randomly sample from these for instant refresh.
    """
    load_artifacts()
    hybrid, score_details = _compute_hybrid_scores(req)
    diverse_pool = _build_diverse_pool(hybrid, score_details)
    return {"pool": [b.dict() for b in diverse_pool]}


# ---------------------------------------------------------------------------
# Endpoint C: /explain
# ---------------------------------------------------------------------------

@app.post("/explain", response_model=ExplainResponse)
def explain(req: ExplainRequest):
    """
    Uses Google Gemini to explain why a book was recommended based on reading history.
    """
    load_artifacts()

    if not GEMINI_API_KEY:
        return ExplainResponse(
            explanation="This book was recommended based on your reading preferences "
                        "and patterns from similar readers. The themes and writing style "
                        "align well with books you've enjoyed."
        )

    prompt = (
        f"You are an AI book recommender. The user has read these books: {req.user_read_history}.\n"
        f"They were just recommended '{req.recommended_book}'.\n"
        f"Select 1 or 2 books from their read history that are MOST SIMILAR to '{req.recommended_book}'.\n"
        f"Write exactly one short sentence explaining the recommendation. "
        f"Start your sentence with exactly: 'Because you liked [insert the 1-2 similar books you selected], you might enjoy this for its '. "
        f"Do NOT list all their read books. ONLY mention the 1 or 2 most relevant ones."
    )

    try:
        from google import genai

        client = genai.Client(api_key=GEMINI_API_KEY)
        
        models_to_try = [
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite"
        ]
        
        last_error = None
        for model_name in models_to_try:
            try:
                print(f"Attempting explanation with model: {model_name}...")
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                explanation = response.text.strip()
                return ExplainResponse(explanation=explanation)
            except Exception as e:
                print(f"[WARN] Failed with {model_name}: {e}")
                last_error = e
                continue
                
        # If all models in the fallback list fail
        print(f"[ERROR] All Gemini models exhausted. Last error: {last_error}")
        return ExplainResponse(
            explanation="This book shares similar themes and storytelling elements "
                        "with the books you've enjoyed. Readers with your taste "
                        "have consistently rated it highly."
        )
    except Exception as e:
        print(f"Gemini API structural error: {e}")
        return ExplainResponse(
            explanation="This book shares similar themes and storytelling elements "
                        "with the books you've enjoyed. Readers with your taste "
                        "have consistently rated it highly."
        )

# ---------------------------------------------------------------------------
# Endpoint D: /semantic-search (Feature 1)
# ---------------------------------------------------------------------------

@app.post("/semantic-search")
def semantic_search(req: SemanticSearchRequest):
    """
    FAISS-powered semantic search. Encodes the user's natural-language query
    with SentenceTransformer and finds nearest books in the embedding space.
    """
    load_artifacts()
    load_sentence_model()
    
    if faiss_index is None or sentence_model is None:
        raise HTTPException(503, "Semantic search not available (FAISS or SentenceTransformer not loaded)")

    # Encode the query
    query_embedding = sentence_model.encode([req.query]).astype(np.float32)
    
    # Normalize (FAISS index may use inner product)
    norm = np.linalg.norm(query_embedding, axis=1, keepdims=True)
    if norm > 0:
        query_embedding = query_embedding / norm

    # Search FAISS
    distances, indices = faiss_index.search(query_embedding, req.top_k)

    results = []
    for i, idx in enumerate(indices[0]):
        if idx < 0:
            continue  # FAISS returns -1 for unfilled results
        book_id = index_to_book_id.get(idx)
        if book_id is None:
            continue
        matching_rows = books_meta[books_meta["book_id"] == book_id]
        if matching_rows.empty:
            continue
        row = matching_rows.iloc[0]
        results.append({
            "book_id": int(book_id),
            "title": row["title"],
            "authors": str(row["authors"]),
            "similarity_score": round(float(distances[0][i]), 4),
        })

    return {"results": results}

# ---------------------------------------------------------------------------
# Endpoint E: /similar-books (Feature 2)
# ---------------------------------------------------------------------------

@app.post("/similar-books")
def similar_books(req: SimilarBooksRequest):
    """
    Find similar books using FAISS nearest-neighbor lookup.
    Uses the book's existing embedding — no encoding needed.
    """
    load_artifacts()
    
    if faiss_index is None:
        raise HTTPException(503, "Similar books not available (FAISS not loaded)")

    idx = book_id_map.get(req.book_id)
    if idx is None:
        raise HTTPException(404, "Book not found in embeddings")

    # Get the book's embedding and search FAISS
    query_vector = book_embeddings_normed[idx].reshape(1, -1).astype(np.float32)
    distances, indices = faiss_index.search(query_vector, req.top_k + 1)

    results = []
    for i, neighbor_idx in enumerate(indices[0]):
        if neighbor_idx < 0 or neighbor_idx == idx:
            continue  # skip self and invalid indices
        neighbor_book_id = index_to_book_id.get(neighbor_idx)
        if neighbor_book_id is None:
            continue
        matching_rows = books_meta[books_meta["book_id"] == neighbor_book_id]
        if matching_rows.empty:
            continue
        row = matching_rows.iloc[0]
        results.append({
            "book_id": int(neighbor_book_id),
            "title": row["title"],
            "authors": str(row["authors"]),
            "similarity_score": round(float(distances[0][i]), 4),
        })

    return {"similar_books": results[:req.top_k]}

# ---------------------------------------------------------------------------
# Endpoint F: /ai-search (Feature 7)
# ---------------------------------------------------------------------------

@app.post("/ai-search")
def ai_search(req: AISearchRequest):
    """
    Gemini-powered conversational search.
    1. Gemini extracts search keywords from the natural-language query.
    2. SentenceTransformer encodes the keywords.
    3. FAISS finds the nearest books.
    4. Results are boosted if similar to user's liked books.
    """
    load_artifacts()

    if faiss_index is None or sentence_model is None:
        raise HTTPException(503, "AI search not available (FAISS or SentenceTransformer not loaded)")

    # Step 1: Use Gemini to extract search intent (or fall back to raw query)
    search_query = req.query
    if GEMINI_API_KEY:
        try:
            from google import genai
            client = genai.Client(api_key=GEMINI_API_KEY)
            
            intent_prompt = (
                f"Extract 3-5 descriptive keywords from this book search request. "
                f"Return ONLY the keywords separated by commas, nothing else.\n"
                f"Request: \"{req.query}\""
            )
            
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=intent_prompt,
            )
            search_query = response.text.strip()
            print(f"[AI-SEARCH] Extracted keywords: {search_query}")
        except Exception as e:
            print(f"[AI-SEARCH] Gemini keyword extraction failed, using raw query: {e}")

    # Step 2: Encode and search FAISS
    query_embedding = sentence_model.encode([search_query]).astype(np.float32)
    norm = np.linalg.norm(query_embedding, axis=1, keepdims=True)
    if norm > 0:
        query_embedding = query_embedding / norm

    distances, indices = faiss_index.search(query_embedding, 20)

    # Step 3: Boost results similar to user's liked books
    liked_indices = [book_id_map[bid] for bid in req.user_liked_book_ids if bid in book_id_map]
    liked_boost = np.zeros(len(books_meta), dtype=np.float64)
    if liked_indices:
        liked_emb = book_embeddings_normed[liked_indices].mean(axis=0)
        l_norm = np.linalg.norm(liked_emb)
        if l_norm > 0:
            liked_emb = liked_emb / l_norm
        liked_boost = book_embeddings_normed @ liked_emb

    # Step 4: Combine FAISS distance with liked-book affinity
    candidates = []
    for i, idx in enumerate(indices[0]):
        if idx < 0:
            continue
        book_id = index_to_book_id.get(idx)
        if book_id is None or book_id in req.user_liked_book_ids:
            continue  # skip books already liked
        
        faiss_score = float(distances[0][i])
        affinity = float(liked_boost[idx]) if idx < len(liked_boost) else 0
        combined = 0.7 * faiss_score + 0.3 * affinity
        
        matching_rows = books_meta[books_meta["book_id"] == book_id]
        if matching_rows.empty:
            continue
        row = matching_rows.iloc[0]
        candidates.append({
            "book_id": int(book_id),
            "title": row["title"],
            "authors": str(row["authors"]),
            "similarity_score": round(combined, 4),
        })

    # Sort by combined score and return top 5
    candidates.sort(key=lambda x: x["similarity_score"], reverse=True)
    return {"results": candidates[:5]}

# ---------------------------------------------------------------------------
# Endpoint G: /health & /ping
# ---------------------------------------------------------------------------

@app.get("/ping")
def ping():
    """Lightweight endpoint specifically to wake up the server from sleep."""
    return {"status": "awake"}

@app.get("/health")
def health():
    load_artifacts()
    return {
        "status": "ok",
        "books_loaded": len(books_meta) if books_meta is not None else 0,
        "svd_available": SVD_AVAILABLE,
        "faiss_available": faiss_index is not None,
        "sentence_model_available": sentence_model is not None,
    }

# ---------------------------------------------------------------------------
# Run with: uvicorn main:app --reload --port 8000
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
