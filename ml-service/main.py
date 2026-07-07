"""
FastAPI ML Microservice for Hybrid Book Recommendations.

Loads pre-trained ML artifacts on startup and exposes three endpoints:
  - /proxy-match : Find the best proxy SVD user for a set of books
  - /recommend   : Generate hybrid (SVD + content) recommendations
  - /explain     : Generate a natural-language explanation via Gemini
"""

import os
import pickle
from collections import Counter
from pathlib import Path
from typing import List

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
# Load artifacts once at module level
# ---------------------------------------------------------------------------
print("[*] Loading ML artifacts...")

books_meta: pd.DataFrame = pickle.load(open(ARTIFACTS_DIR / "books_meta.pkl", "rb"))
book_embeddings: np.ndarray = np.load(ARTIFACTS_DIR / "book_embeddings.npy")
book_to_top_users: dict = pickle.load(open(ARTIFACTS_DIR / "book_to_top_users.pkl", "rb"))
book_id_map: dict = pickle.load(open(ARTIFACTS_DIR / "book_id_map.pkl", "rb"))
user_id_map: dict = pickle.load(open(ARTIFACTS_DIR / "user_id_map.pkl", "rb"))

# SVD model — loaded inside a try/except so the service can still start
# even if scikit-surprise has DLL issues on certain Windows setups.
try:
    svd_model = pickle.load(open(ARTIFACTS_DIR / "svd_model.pkl", "rb"))
    SVD_AVAILABLE = True
    print("[OK] SVD model loaded successfully")
except Exception as e:
    svd_model = None
    SVD_AVAILABLE = False
    print(f"[WARN] SVD model could not be loaded ({e}). Collaborative filtering will use fallback scores.")

# Pre-compute normalised embeddings for fast cosine similarity
norms = np.linalg.norm(book_embeddings, axis=1, keepdims=True)
norms[norms == 0] = 1  # avoid division by zero
book_embeddings_normed = book_embeddings / norms

# Build reverse map: internal_index → book_id  (book_id_map is book_id → index)
index_to_book_id = {v: k for k, v in book_id_map.items()}

# All known book_ids (for iteration)
all_book_ids = books_meta["book_id"].tolist()

print(f"[OK] Loaded {len(books_meta)} books, {book_embeddings.shape} embeddings, "
      f"{len(book_to_top_users)} top-user mappings")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="BookRec ML Service", version="1.0.0")

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

class BookOut(BaseModel):
    book_id: int
    title: str
    authors: str
    content: str

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

# ---------------------------------------------------------------------------
# Endpoint A: /proxy-match
# ---------------------------------------------------------------------------

@app.post("/proxy-match", response_model=ProxyMatchResponse)
async def proxy_match(req: ProxyMatchRequest):
    """
    Given 3 book_ids the user selected during onboarding, find the single
    dataset user_id that rated those books most highly (appears most often
    across the top-user lists).
    """
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
# Endpoint B: /recommend
# ---------------------------------------------------------------------------

def _get_svd_scores(proxy_svd_id: int) -> np.ndarray:
    """Return an array of SVD predicted ratings for every book, indexed by
    the books_meta DataFrame index."""
    scores = np.zeros(len(books_meta), dtype=np.float64)

    if not SVD_AVAILABLE or svd_model is None:
        # Fallback: uniform scores so content-based takes over
        return scores

    for idx, row in books_meta.iterrows():
        bid = row["book_id"]
        try:
            pred = svd_model.predict(str(proxy_svd_id), str(bid))
            scores[idx] = pred.est
        except Exception:
            scores[idx] = 0.0

    return scores


def _get_content_scores(liked_book_ids: List[int]) -> np.ndarray:
    """Compute average cosine similarity between the liked books' embeddings
    and every other book's embedding."""
    liked_indices = []
    for bid in liked_book_ids:
        idx = book_id_map.get(bid)
        if idx is not None:
            liked_indices.append(idx)

    if not liked_indices:
        return np.zeros(len(books_meta), dtype=np.float64)

    # Use linear weights so recently liked books matter a bit more
    # but don't completely overpower older books (max 2x weight for the newest)
    weights = np.linspace(1, 2, len(liked_indices))
    weights = weights / weights.sum()
    
    liked_emb = book_embeddings_normed[liked_indices]
    avg_emb = np.average(liked_emb, axis=0, weights=weights)
    
    avg_norm = np.linalg.norm(avg_emb)
    if avg_norm > 0:
        avg_emb = avg_emb / avg_norm

    # Cosine similarity against all books
    similarities = book_embeddings_normed @ avg_emb
    return similarities


@app.post("/recommend", response_model=RecommendResponse)
async def recommend(req: RecommendRequest):
    """
    Generate top-5 hybrid recommendations by blending collaborative filtering
    (SVD) and content-based (embedding cosine similarity) scores.
    """
    liked_set = set(req.recent_liked_book_ids)

    # --- Collaborative scores ---
    svd_scores = _get_svd_scores(req.proxy_svd_id)

    # Normalise SVD scores to [0, 1]
    svd_min, svd_max = svd_scores.min(), svd_scores.max()
    if svd_max - svd_min > 0:
        svd_norm = (svd_scores - svd_min) / (svd_max - svd_min)
    else:
        svd_norm = np.zeros_like(svd_scores)

    # --- Content-based scores ---
    content_scores = _get_content_scores(req.recent_liked_book_ids)

    # Normalise content scores to [0, 1]
    c_min, c_max = content_scores.min(), content_scores.max()
    if c_max - c_min > 0:
        content_norm = (content_scores - c_min) / (c_max - c_min)
    else:
        content_norm = np.zeros_like(content_scores)

    # --- Hybrid blend ---
    # Shifted to 70% content / 30% collaborative so new likes have strong visual impact
    hybrid = 0.3 * svd_norm + 0.7 * content_norm

    # Exclude already-liked books
    for bid in liked_set:
        idx = book_id_map.get(bid)
        if idx is not None:
            hybrid[idx] = -1.0

    import random

    # Top 100 to pick from
    top_indices = np.argsort(hybrid)[::-1][:100]

    diverse_pool = []
    author_counts = {}
    
    for idx in top_indices:
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
        ))
        
        # Limit to top 40 diverse recommendations to pick from
        if len(diverse_pool) >= 40:
            break

    # Randomly sample 10 from the pool to allow for the "Refresh" button functionality
    if len(diverse_pool) > 10:
        results = random.sample(diverse_pool, 10)
        # Keep them sorted by their original hybrid score order
        results.sort(key=lambda x: diverse_pool.index(x))
    else:
        results = diverse_pool

    return RecommendResponse(recommendations=results)

# ---------------------------------------------------------------------------
# Endpoint C: /explain
# ---------------------------------------------------------------------------

@app.post("/explain", response_model=ExplainResponse)
async def explain(req: ExplainRequest):
    """
    Use Google Gemini to generate a natural-language explanation for why
    a book was recommended.
    """
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
            "gemini-2.0-flash",
            "gemini-3.0-flash",
            "gemini-3.5-flash",
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
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "books_loaded": len(books_meta),
        "svd_available": SVD_AVAILABLE,
    }

# ---------------------------------------------------------------------------
# Run with: uvicorn main:app --reload --port 8000
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
