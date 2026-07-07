# StoryNest: Comprehensive Architecture & Project Documentation

This document serves as the absolute, exhaustive source of truth for the **StoryNest Book Recommendation System**. It details every single feature, every file, every optimization, and the chronological history of tasks executed to bring this project to production.

---

## 1. Executive Summary & Task History

StoryNest is an AI-powered, hybrid recommendation engine built with React (Frontend), Node.js (API Gateway), and FastAPI/Python (ML Service). 

### The Evolution of the Project (Task Timeline)
1. **Initial Scaffold**: Bootstrapped the frontend, Node.js server, and ML Python service.
2. **MongoDB Migration**: Moved from a heavy local CSV file to MongoDB to fix Node.js memory crashes on Render.
3. **Lazy Loading & Vercel SPA**: Implemented lazy loading for the huge `books_meta.pkl` and `book_embeddings.npy` artifacts. Configured Vercel to properly handle React SPA routing.
4. **SVD Model Optimization**: The Collaborative Filtering model (`scikit-surprise`) originally consumed ~200MB because it retained all raw training ratings. We manually stripped `svd.trainset.ur` and `svd.trainset.ir`, reducing the pickled object size from ~150MB down to ~70MB without breaking `svd.predict()`.
5. **The Google Gemini Explanations**: Integrated `google-genai` to dynamically explain recommendations based on a user's `liked_books`. We experienced Gemini API 400 errors, updated the models to `gemini-2.5-flash`, and established a fallback to `gemini-2.5-flash-lite`.
6. **The Render Cold-Start Fix**: Render puts free-tier instances to sleep. The Node.js server was initially pinging the Python server aggressively, creating annoying logs. We silenced the polling loop (`wakeUpPython()`) to seamlessly hold GET requests and prevent POST requests from bouncing with a 502 error during wakeup.
7. **The Great Memory Crisis (OOM Kills)**: The Python service kept crashing with 502/503 errors on Render's 512MB RAM tier. We traced this to PyTorch allocating massive OpenMP threading buffers (`torch.set_num_threads(1)` reduced it to 471MB). 
8. **The FastAPI Threadpool Race Condition**: Fast API spawned multiple threads for synchronous endpoints (`/similar-books`, `/recommend`). They all called `load_artifacts()` simultaneously, causing one thread to delete `book_embeddings` while another was using it (`NameError: name 'book_embeddings' is not defined`). We fixed this with a classic `threading.Lock()` singleton pattern.
9. **The Ultimate Nuclear Memory Fix (PyTorch to FastEmbed)**: Even at 471MB, PyTorch was too unstable for Render. We completely ripped PyTorch and `sentence-transformers` out of the project, replacing it with `fastembed`. This migrated the `all-MiniLM-L6-v2` embedding generation to the ONNX Runtime, slashing memory usage from 471MB down to a breathtaking **215MB** and solving the crashes permanently.
10. **Responsive UI Overhaul**: Finally, we stripped away hardcoded CSS grid columns (`repeat(5, 1fr)`) and replaced them with `repeat(auto-fit, minmax(200px, 1fr))`, ensuring the entire application flows beautifully on mobile phones and tablets.

---

## 2. Core Features Deep Dive

### Feature 1: The Hybrid Recommendation Engine (`/recommend`)
- **How it works:** It combines Collaborative Filtering (CF) and Content-Based Filtering (CBF).
- **CF (SVD):** Uses the `scikit-surprise` SVD model to predict how much the user would rate all 10,000 books based on their `liked_books`.
- **CBF (FAISS + Embeddings):** Calculates the average embedding of all the user's `liked_books` using the precomputed `book_embeddings.npy`. It then calculates the dot product (cosine similarity) between this average user profile and all 10,000 books.
- **The Score:** `Final Score = (SVD_Predicted_Rating / 5.0) * 0.5 + (Cosine_Similarity) * 0.5`. The books are sorted by this hybrid score.

### Feature 2: Semantic Search (`/semantic-search`)
- **How it works:** When a user searches for "books about space battles", the text is sent to the ML service.
- **The Engine:** `fastembed` (using ONNX Runtime) encodes the text into a 384-dimensional vector using `all-MiniLM-L6-v2`.
- **The Search:** This vector is fed into a highly optimized Facebook AI Similarity Search (FAISS) `IndexFlatIP`. FAISS returns the Top N most mathematically similar books in milliseconds.

### Feature 3: AI Explanations (`/explain`)
- **How it works:** When a user clicks "Ask AI Why", the ML service receives the target book and the user's read history.
- **The Engine:** We pass a highly engineered zero-shot prompt to Google Gemini (`gemini-2.5-flash`), commanding it to find thematic links between the user's past reads and the new recommendation. It returns a single, personalized sentence starting with *"Because you liked..."*.

### Feature 4: Similar Books Sidebars (`/similar-books`)
- **How it works:** Displayed on the `BookDetails` page. It does *not* encode text. Instead, it looks up the pre-calculated embedding of the selected book in `book_embeddings.npy`, and runs a FAISS nearest-neighbor search to find the closest matches.

---

## 3. Frontend Architecture (File by File Documentation)

### `client/src/App.jsx`
- **Purpose:** The root React router.
- **What it does:** Enforces authentication and onboarding. If a user is not logged in, they are trapped at `/`. If they log in but haven't selected 3 books, they are trapped at `/onboarding`. Checks `localStorage` instantly on mount to restore the JWT session.

### `client/src/api.js`
- **Purpose:** The global Axios HTTP client.
- **What it does:** Dynamically points to `localhost:5000` or the Render URL (`VITE_API_URL`). Contains a Request Interceptor that injects `Bearer <token>` into every request. Contains a Response Interceptor that catches `401 Unauthorized` errors, nukes the local session, and forces a login redirect.

### `client/src/components/Dashboard.jsx`
- **Purpose:** The main hub for the user.
- **What it does:** Fetches and displays the Hybrid Recommendations, Popular Books, and Random Discoveries in separate tabs. Manages the state for the Search Bar (Keyword, Semantic, and AI Search). Implements debouncing (`setTimeout`) for the search bar so we don't spam the API while the user is typing.

### `client/src/components/AuthPage.jsx`
- **Purpose:** Handles Login and Registration.
- **What it does:** Uses a toggleable glassmorphic card. Sends credentials to the Node.js API. Explicitly handles user-friendly error messages (e.g., displaying "Email or password incorrect" directly under the form).

### `client/src/components/Onboarding.jsx`
- **Purpose:** The cold-start solution.
- **What it does:** Forces new users to pick 3 books they like. Sends these IDs to the backend to initialize their collaborative filtering profile. Uses `auto-fit` CSS grids to remain mobile-responsive.

### `client/src/components/BookCard.jsx` & `BookDetails.jsx`
- **Purpose:** Displays book metadata. `BookDetails` fetches the `/explain` API and `/similar-books` API to populate the "Ask AI Why" modal and the sidebar.

### `client/src/index.css`
- **Purpose:** The global stylesheet.
- **What it does:** Defines CSS variables for the color palette, glassmorphism shadows, and gradient accents. Contains the critical `@media (max-width: 768px)` queries that force flex layouts to stack vertically on mobile phones.

---

## 4. API Gateway Architecture (Node.js)

### `server/server.js`
- **Purpose:** The middleman. The frontend talks to this, and this talks to MongoDB and the Python ML service.
- **What it does:**
  - **Auth:** Uses `bcrypt` to hash passwords and `jsonwebtoken` (JWT) to secure endpoints.
  - **Database:** Connects to MongoDB to fetch basic book metadata (`/books/popular`) and save user profiles.
  - **The Python Proxy (`axios.post(FASTAPI_URL)`):** The Node server forwards ML-heavy requests (like `/recommend`) to the Python service.
  - **The Wakeup Poller (`wakeUpPython`):** A silent background `while` loop that pings the Python server with a lightweight `GET /ping` every 5 seconds during cold starts. This prevents Render from rejecting our POST requests with a 502 error before the Python container is awake.

---

## 5. ML Service Architecture (Python/FastAPI)

### `ml-service/main.py`
- **Purpose:** The mathematical brain of the operation.
- **What it does:**
  - **Thread-Safe Lazy Loading (`load_artifacts`):** Wrapped in a `threading.Lock()`, this function ensures that the massive `.pkl` and `.npy` artifacts are only loaded into RAM the first time an API request actually needs them. It safely deletes `book_embeddings` out of RAM after normalizing them to save space.
  - **`fastembed` Inference (`load_sentence_model`):** Initializes the ONNX embedding runtime to convert user searches into 384-dimensional vectors using `all-MiniLM-L6-v2`.
  - **Vector Math (`_compute_hybrid_scores`):** Executes NumPy matrix multiplications (`@`) for instantaneous cosine similarity calculations against 10,000 vectors simultaneously.

### `ml-service/requirements.txt`
- **Purpose:** Python dependency manifest.
- **What it does:** Explicitly requests `fastembed`, `faiss-cpu`, `scikit-surprise`, and `google-genai`. We intentionally removed `torch` and `sentence-transformers` from this file to eliminate gigabytes of unnecessary NVIDIA CUDA GPU drivers, which reduced the Render deployment time from 5 minutes down to ~30 seconds.

---
*Document Generated on 2026-07-07*
