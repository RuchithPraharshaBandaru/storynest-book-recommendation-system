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
3. **Lazy Loading & Vercel SPA**: Implemented lazy loading for the huge `books_meta.pkl` and `book_embeddings.npy` artifacts. Configured Vercel to properly handle React SPA routing.
4. **SVD Model Optimization**: The Collaborative Filtering model (`scikit-surprise`) originally consumed ~200MB because it retained all raw training ratings. We manually stripped `svd.trainset.ur` and `svd.trainset.ir`, reducing the pickled object size from ~150MB down to ~70MB without breaking `svd.predict()`.
5. **The Google Gemini Explanations**: Integrated `google-genai` to dynamically explain recommendations based on a user's `liked_books`. We experienced Gemini API 400 errors, updated the models to `gemini-2.5-flash`, and established a fallback to `gemini-2.5-flash-lite`.
6. **The Render Cold-Start Fix**: Render puts free-tier instances to sleep ("Cold Start" means the server shuts down when inactive and takes several seconds to boot back up when a new request arrives). The Node.js server was initially pinging the Python server aggressively, creating annoying logs. We silenced the polling loop (`wakeUpPython()`) to seamlessly hold GET requests and prevent POST requests from bouncing with a 502 error during wakeup.
7. **The Great Memory Crisis (OOM Kills)**: The Python service kept crashing with 502/503 errors on Render's 512MB RAM tier. We traced this to PyTorch allocating massive OpenMP threading buffers (`torch.set_num_threads(1)` reduced it to 471MB). 
8. **The FastAPI Threadpool Race Condition**: Fast API spawned multiple threads for synchronous endpoints (`/similar-books`, `/recommend`). They all called `load_artifacts()` simultaneously, causing one thread to delete `book_embeddings` while another was using it (`NameError: name 'book_embeddings' is not defined`). We fixed this with a classic `threading.Lock()` singleton pattern so that multiple concurrent requests share a single initialization.
9. **Migration to FastEmbed (ONNX Runtime)**: Even at 471MB, PyTorch was too unstable for Render. We completely ripped PyTorch and `sentence-transformers` out of the project, replacing it with `fastembed`. This migrated the `all-MiniLM-L6-v2` embedding generation to the ONNX Runtime, slashing memory usage from 471MB down to a breathtaking **215MB** and solving the crashes permanently.
10. **Responsive UI Overhaul**: Finally, we stripped away hardcoded CSS grid columns (`repeat(5, 1fr)`) and replaced them with `repeat(auto-fit, minmax(200px, 1fr))`, ensuring a fully responsive layout using CSS Grid auto-fit, responsive breakpoints, and flexible layouts optimized for desktop, tablet, and mobile devices.

---

## 3. Recommendation Pipeline

To understand the system end-to-end, here is the standard data flow for generating a hybrid recommendation:

```text
User Login
   ↓
Node API
   ↓
Fetch User Profile
   ↓
Liked Books
   ↓
Python ML Service
   ↓
Collaborative Filtering (SVD)
   ↓
Content Similarity (FAISS)
   ↓
Hybrid Ranking
   ↓
Top 100
   ↓
Diversity Filter
   ↓
Top 10
   ↓
Node
   ↓
React Dashboard
```

---

## 4. The Three Types of Search & The Machine Learning Backbone

### The Three Types of Search
Your dashboard allows users to find books in three entirely different ways. Each one solves a unique problem.

- **Keyword Search (The Traditional Way):** This is how 90% of the internet works. You type "Harry Potter", and the database uses regular expressions to find rows where `title == "Harry Potter"`. It's perfect when you know exactly what you are looking for, but fails if you search for concepts like "wizards at a magic school".
- **Semantic Search (The Mathematical Way):** This looks at *meaning*. If you search for "wizards at a magic school", the ML model converts that phrase into a mathematical coordinate (a vector). It then searches the database for books that exist at the *same mathematical coordinate*, successfully returning *Harry Potter* even if the words aren't in the title.
- **AI Search (The Conversational Way):** Instead of searching a database, we send the user's natural language request to **Google Gemini**. Gemini acts as an intelligent librarian, extracts the core themes, and we run those themes through the Semantic Search pipeline to return contextual matches.

### The Machine Learning Backbone

To understand how Semantic and AI Search work, you have to understand the three core technologies running under the hood.

1. **Transformers (`all-MiniLM-L6-v2`)**
   Transformers are the architecture behind ChatGPT and Gemini. In this project, we use `all-MiniLM-L6-v2`. It understands human language context, knowing that "Dog" is closely related to "Puppy", but far away from "Carburetor". It acts as the translation engine between human English and computer Math.
2. **Vector Embeddings (The 384 Dimensions)**
   When your Transformer reads a book's summary, it outputs a **Vector Embedding**. Think of it as GPS coordinates, but instead of 2 dimensions, it uses **384 dimensions**. By scoring a book across 384 different conceptual "dimensions", the model plots the book in a massive mathematical universe. Books with similar plots end up physically grouped together.
3. **FAISS (Facebook AI Similarity Search)**
   Calculating the distance between 1 coordinate and 10,000 other coordinates across 384 dimensions sequentially takes massive computing power. FAISS organizes the coordinates into clusters. Instead of checking all 10,000 books, it instantly zeroes in on the correct cluster and finds the nearest neighbors in `O(log n)` time (milliseconds).

---

## 5. Core Features Deep Dive

### Feature 1: The Hybrid Recommendation Engine (`/recommend`)
- **How it works:** It combines Collaborative Filtering (CF) and Content-Based Filtering (CBF).
- **CF (SVD):** Uses the `scikit-surprise` SVD model to predict how much the user would rate all 10,000 books based on their `liked_books`.
- **CBF (FAISS + Embeddings):** Calculates the average embedding of all the user's `liked_books` using the precomputed `book_embeddings.npy`. It then calculates the dot product (cosine similarity) between this average user profile and all 10,000 books.
- **The Score:** The final hybrid score is actually a heavily engineered 5-signal weighted combination:
  `Final Score = (0.30 * Content_Similarity) + (0.25 * SVD_Score) + (0.15 * Favourites_Boost) + (0.15 * Ratings_Boost) + (0.05 * Feedback_Boost)`. The books are sorted by this hybrid score.

### Feature 2: Semantic Search (`/semantic-search`)
- **How it works:** When a user searches for "books about space battles", the text is sent to the ML service.
- **The Engine:** `fastembed` generates embeddings using the same `all-MiniLM-L6-v2` model through ONNX Runtime, providing embedding compatibility while significantly reducing memory usage.
- **The Search:** This vector is fed into a highly optimized Facebook AI Similarity Search (FAISS) `IndexFlatIP`. The FAISS index stores the precomputed book embeddings, enabling approximate nearest-neighbor search in milliseconds instead of comparing every book vector individually.

### Feature 3: AI Explanations (`/explain`)
- **How it works:** When a user clicks "Ask AI Why", the ML service receives the target book and the user's read history. 
- **The Engine:** We execute a highly efficient pipeline:
  ```text
  Backend
     ↓
  Find similar books
     ↓
  Google Gemini
     ↓
  Write explanation
  ```
  We pass a zero-shot prompt to Google Gemini (`gemini-2.5-flash`), commanding it to find thematic links between the user's past reads and the new recommendation. It returns a single, personalized sentence starting with *"Because you liked..."*.

### Feature 4: Similar Books Sidebars (`/similar-books`)
- **How it works:** Displayed on the `BookDetails` page. It does *not* encode text. Instead, it looks up the pre-calculated embedding of the selected book in `book_embeddings.npy`, and runs a FAISS nearest-neighbor search for `O(log n)` millisecond vector retrieval to find the closest matches.

---

## 6. Artifacts and Models

The ML service relies on pre-trained serialized artifacts located in the `artifacts/` folder. This structure allows us to move from a heavy Training Notebook directly into a lightweight Backend.

- `svd_model.pkl`: The trained Collaborative Filtering weights.
- `books_meta.pkl`: The pandas DataFrame holding metadata (title, authors) for instant lookups.
- `book_embeddings.npy`: The 384-dimensional dense vectors representing the themes of all 10,000 books.
- `faiss.index`: The L2-normalized IndexFlatIP used for millisecond similarity searches.
- `proxy_match.pkl`: A mapping structure that links generic users to pre-calculated collaborative clusters.

---

## 7. Frontend Architecture (File by File Documentation)

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
- **What it does:** Defines CSS variables for the color palette, glassmorphism shadows, and gradient accents. Fully responsive layout using CSS Grid auto-fit, responsive breakpoints, and flexible layouts optimized for desktop, tablet, and mobile devices.

---

## 8. API Gateway Architecture (Node.js)

### `server/server.js`
- **Purpose:** The middleman. The frontend talks to this, and this talks to MongoDB and the Python ML service.
- **What it does:**
  - **Auth:** Uses `bcrypt` to hash passwords and `jsonwebtoken` (JWT) to secure endpoints.
  - **Database:** Connects to MongoDB to fetch basic book metadata (`/books/popular`) and save user profiles.
  - **The Python Proxy (`axios.post(FASTAPI_URL)`):** The Node server forwards ML-heavy requests (like `/recommend`) to the Python service.
  - **The Wakeup Poller (`wakeUpPython`):** A silent background `while` loop that pings the Python server with a lightweight `GET /ping` every 5 seconds during cold starts. This prevents Render from rejecting our POST requests with a 502 error before the Python container is awake.

---

## 9. ML Service Architecture (Python/FastAPI)

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
