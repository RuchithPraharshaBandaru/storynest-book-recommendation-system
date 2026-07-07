# StoryNest: Comprehensive Architecture & Project Documentation

This document serves as the absolute, exhaustive source of truth for the **StoryNest Book Recommendation System**. It details every single feature, every file, every optimization, and the chronological history of tasks executed to bring this project to production.

---

## 1. Tech Stack

- **Frontend:** React, Tailwind CSS, Vite
- **API Gateway:** Node.js, Express
- **Database:** MongoDB
- **ML Service:** FastAPI, NumPy, scikit-surprise, FAISS, FastEmbed
- **AI Integrations:** Google Gemini

---

## 2. Executive Summary & Task History

StoryNest is an AI-powered, hybrid recommendation engine built with React (Frontend), Node.js (API Gateway), and FastAPI/Python (ML Service). 

### The Evolution of the Project (Task Timeline)
1. **Initial Scaffold**: Bootstrapped the frontend, Node.js server, and ML Python service.
2. **MongoDB Migration**: Moved from a heavy local CSV file to MongoDB to fix Node.js memory crashes on Render.
3. **Lazy Loading & Vercel SPA**: Implemented lazy loading for the huge artifacts. Configured Vercel to properly handle React SPA routing.
4. **SVD Model Optimization**: The Collaborative Filtering model (`scikit-surprise`) originally consumed ~200MB because it retained all raw training ratings. We manually stripped `svd.trainset.ur` and `svd.trainset.ir`, reducing the pickled object size from ~150MB down to ~70MB without breaking `svd.predict()`.
5. **Gemini Integration**: Integrated `google-genai` to dynamically explain recommendations based on a user's `liked_books`. We experienced Gemini API 400 errors, updated the models to `gemini-2.5-flash`, and established a fallback to `gemini-2.5-flash-lite`.
6. **Render Cold Start Handling**: Render puts free-tier instances to sleep. The Node.js server was initially pinging the Python server aggressively, creating annoying logs. We silenced the polling loop (`wakeUpPython()`) to seamlessly hold GET requests and prevent POST requests from bouncing with a 502 error during wakeup.
7. **Memory Optimization (OOM Kills)**: The Python service kept crashing with 502/503 errors on Render's 512MB RAM tier. We traced this to PyTorch allocating massive OpenMP threading buffers (`torch.set_num_threads(1)` reduced it to 471MB). 
8. **The FastAPI Threadpool Race Condition**: Fast API spawned multiple threads for synchronous endpoints (`/similar-books`, `/recommend`). They all called `load_artifacts()` simultaneously, causing one thread to delete `book_embeddings` while another was using it (`NameError: name 'book_embeddings' is not defined`). We fixed this with a classic `threading.Lock()` singleton pattern so that multiple concurrent requests share a single initialization.
9. **Migration to FastEmbed (ONNX Runtime)**: Even at 471MB, PyTorch was too unstable for Render. We completely ripped PyTorch and `sentence-transformers` out of the project, replacing it with `fastembed`. This migrated the `all-MiniLM-L6-v2` embedding generation to the ONNX Runtime, slashing memory usage from 471MB down to a breathtaking **215MB** and solving the crashes permanently.
10. **Responsive UI Overhaul**: Finally, we stripped away hardcoded CSS grid columns (`repeat(5, 1fr)`) and replaced them with `repeat(auto-fit, minmax(200px, 1fr))`, ensuring a fully responsive layout using CSS Grid auto-fit, responsive breakpoints, and flexible layouts optimized for desktop, tablet, and mobile devices.

---

## 3. Recommendation Pipeline

To understand the system end-to-end, here is the standard data flow for generating a hybrid recommendation and evolving those recommendations over time:

```text
User Login
      ↓
Node API
      ↓
Fetch User Profile
      ↓
Reading History
Favorites
Ratings
Reading Status
Feedback
      ↓
Python ML Service
      ↓
Content Similarity
      ↓
Collaborative Filtering (SVD)
      ↓
Hybrid Scoring
      ↓
Top 100 Candidates
      ↓
Author Diversity Filter
      ↓
Top Recommendations
      ↓
Node API
      ↓
React Dashboard
      ↓
User Interaction
      ↓
Ratings / Favorites / Feedback
      ↓
Future Recommendations
```

---

## 4. Request Flow Examples

Understanding the microservice routing is critical. Here are three core workflows:

### Semantic Search

```text
React
  ↓
Node
  ↓
FastAPI
  ↓
FastEmbed
  ↓
Embedding
  ↓
FAISS
  ↓
Top 20
  ↓
MongoDB metadata
  ↓
React
```

### Recommendation

```text
React
  ↓
Node
  ↓
MongoDB
  ↓
User Profile
  ↓
FastAPI
  ↓
Hybrid Engine
  ↓
Top Books
  ↓
React
```

### AI Explanation

```text
React
  ↓
Node
  ↓
FastAPI
  ↓
Find nearest historical books
  ↓
Gemini
  ↓
Explanation
  ↓
React
```

---

## 5. The Three Types of Search & The Machine Learning Backbone

### The Three Types of Search
Your dashboard allows users to find books in three entirely different ways. Each one solves a unique problem.

- **Keyword Search:** Traditional regex/substring matching (`title == "Harry Potter"`).
- **Semantic Search:** Looks at *meaning*. If you search for "wizards at a magic school", the ML model converts that phrase into a mathematical coordinate (a vector) and searches for conceptually similar books.
- **AI Search:** Instead of searching a database, we send the user's natural language request to **Google Gemini**. Gemini acts as an intelligent librarian, extracts the core themes, and we run those themes through the Semantic Search pipeline to return contextual matches.

### The Machine Learning Backbone

To understand how Semantic and AI Search work, here is the core data pipeline:

```text
Book Description
        ↓
FastEmbed (all-MiniLM-L6-v2)
        ↓
384-dimensional embedding
        ↓
L2 Normalization
        ↓
FAISS IndexFlatIP
        ↓
Semantic Retrieval
```

StoryNest uses FAISS `IndexFlatIP`, which performs exact inner-product search over normalized embeddings. Since all vectors are normalized to unit length, the inner product is mathematically equivalent to cosine similarity. FAISS performs this computation using highly optimized SIMD and BLAS routines, enabling millisecond-scale retrieval across the book collection.

---

## 6. Core Features Deep Dive

### Feature 1: The Hybrid Recommendation Engine (`/recommend`)

The recommendation engine combines Collaborative Filtering (CF) and Content-Based Filtering (CBF). The final score is a weighted combination of user signals:

- **Reading History (Content Similarity):** Represents long-term user interests based on the average mathematical themes of their read history.
- **Collaborative Filtering (SVD):** Predicts ratings based on proxy user data (people who like what you like).
- **Favorites:** Acts as a stronger positive signal to dramatically sway recommendations toward marked books.
- **Ratings:** Allows fine-grained preference modeling (highly rated books boost vectors, low rated books are penalized).
- **Reading Status:** Prioritizes completed books over abandoned ones.
- **Feedback:** Allows explicit correction of recommendations (clicking "Not Interested" immediately applies a -1.0 penalty).

### Feature 2: AI Explanations (`/explain`)

When a user clicks "Ask AI Why", the ML service receives the target book and the user's read history. 

The backend performs all similarity calculations using FAISS to find the 1 or 2 books from the user's history that are most mathematically similar to the recommendation. It passes *only* those books to Google Gemini. Gemini is used purely for natural-language generation rather than recommendation.

### Feature 3: Similar Books Sidebars (`/similar-books`)

Displayed on the `BookDetails` page. It does *not* encode text. Instead, it looks up the pre-calculated embedding of the selected book in `book_embeddings.npy`, and runs a FAISS exact inner-product search for millisecond vector retrieval to find the closest matches.

---

## 7. Artifacts and Models

The ML service relies on pre-trained serialized artifacts located in the `artifacts/` folder. This structure allows us to move from a heavy Training Notebook directly into a lightweight Backend.

| Artifact | Purpose | Used By |
|---|---|---|
| `svd_model.pkl` | Collaborative Filtering | `/recommend` |
| `books_meta.pkl` | Metadata | All endpoints |
| `book_embeddings.npy` | Dense vectors | Recommendation & Similar Books |
| `faiss.index` | Vector retrieval | Semantic Search |
| `proxy_match.pkl` | Cold Start | Onboarding |

---

## 8. Frontend Architecture (File by File Documentation)

### `client/src/App.jsx`
- **Purpose:** The root React router.
- **What it does:** Enforces authentication and onboarding. If a user is not logged in, they are trapped at `/`. If they log in but haven't selected 3 books, they are trapped at `/onboarding`. Checks `localStorage` instantly on mount to restore the JWT session.

### `client/src/api.js`
- **Purpose:** The global Axios HTTP client.
- **What it does:** Dynamically points to `localhost:5000` or the Render URL (`VITE_API_URL`). Contains a Request Interceptor that injects `Bearer <token>` into every request. Contains a Response Interceptor that catches `401 Unauthorized` errors, nukes the local session, and forces a login redirect.

### `client/src/components/Dashboard.jsx`
- **Purpose:** The main hub for the user.
- **What it does:** Fetches and displays the Hybrid Recommendations, Popular Books, and Random Discoveries in separate tabs.

### Search Component
- **Purpose:** Unified interface for Keyword Search, Semantic Search, and AI Search.
- **What it does:** Implements debounce logic so the API is not spammed on every keystroke, and dynamically routes the search payload to the correct backend endpoint based on the selected mode.

### `client/src/components/AuthPage.jsx`
- **Purpose:** Handles Login and Registration.
- **What it does:** Uses a toggleable glassmorphic card. Sends credentials to the Node.js API. Explicitly handles user-friendly error messages.

### `client/src/components/Onboarding.jsx`
- **Purpose:** The cold-start solution.
- **What it does:** Forces new users to pick 3 books they like. Sends these IDs to the backend to initialize their collaborative filtering profile. 

---

## 9. API Gateway Architecture (Node.js)

### `server/server.js`

The Node.js layer intentionally contains no machine-learning logic.

**Responsibilities:**
- Authentication
- MongoDB Access
- Session Management
- Request Validation
- API Gateway Proxying
- Cold Start Handling

All recommendation logic resides exclusively inside the FastAPI service. The Node server forwards ML-heavy requests (like `/recommend`) to the Python service via `axios.post(FASTAPI_URL)`. A silent background polling loop ensures requests don't hit 502 errors while the Python server is waking up from its Render sleep state.

---

## 10. ML Service Architecture (Python/FastAPI)

### `ml-service/main.py`

**Responsibilities:**
- Artifact Management (Thread-Safe Lazy Loading)
- Recommendation Engine (Hybrid Scoring)
- Semantic Search (FastEmbed ONNX)
- Similar Books (FAISS)
- AI Explanations (Gemini Prompting)

### Memory Optimization Journey

```text
Before (PyTorch)
       ↓
     631 MB
       ↓
 OOM Crash on Render

After (FastEmbed / ONNX)
       ↓
     215 MB
       ↓
 Stable Deployment
```

Even at 471MB (after setting `torch.set_num_threads(1)`), PyTorch was too unstable. We completely ripped it out in favor of `fastembed` which uses the ONNX Runtime, preserving the exact same `all-MiniLM-L6-v2` capabilities while permanently solving memory limits.

---
*Document Generated on 2026-07-07*
