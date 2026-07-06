# BookRec — AI-Powered Hybrid Book Recommendation System

A full-stack application that combines collaborative filtering (SVD) and content-based
filtering (Sentence Transformer embeddings) to deliver personalized book recommendations,
with natural-language explanations powered by Google Gemini.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   React UI   │────▶│  Express API │────▶│  FastAPI ML  │
│  (Vite, TW)  │     │  (Node.js)   │     │  (Python)    │
│  :5173       │     │  :5000       │     │  :8000       │
└──────────────┘     └──────┬───────┘     └──────────────┘
                           │
                      ┌────▼─────┐
                      │ MongoDB  │
                      │ :27017   │
                      └──────────┘
```

## Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **MongoDB** running locally on port 27017

## Quick Start

### 1. ML Microservice (FastAPI)

```bash
cd ml-service
pip install -r requirements.txt

# Optional: Add your Gemini API key to .env
# GEMINI_API_KEY=your_key_here

python main.py
# → http://localhost:8000
```

### 2. Express Backend

```bash
cd server
npm install
npm run dev
# → http://localhost:5000
```

### 3. React Frontend

```bash
cd client
npm install
npm run dev
# → http://localhost:5173
```

## Usage Flow

1. **Register** — Create an account on the auth page
2. **Onboard** — Select 3 books you've enjoyed from the grid of 20
3. **Discover** — View your top-5 personalized recommendations
4. **Ask AI Why** — Click on any recommendation to get a Gemini-powered explanation

## Environment Variables

### `ml-service/.env`
| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (optional — falls back to a generic explanation) |

### `server/.env`
| Variable | Default | Description |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017/bookrec` | MongoDB connection string |
| `JWT_SECRET` | `bookrec_jwt_secret_key...` | JWT signing secret |
| `FASTAPI_URL` | `http://localhost:8000` | FastAPI microservice URL |
| `PORT` | `5000` | Express server port |

## ML Artifacts (in `/artifacts`)

| File | Description |
|---|---|
| `svd_model.pkl` | Trained SVD collaborative filtering model (surprise) |
| `book_embeddings.npy` | 10,000 × 384 Sentence Transformer embeddings |
| `books_meta.pkl` | DataFrame with book_id, title, authors, content |
| `book_to_top_users.pkl` | Dict mapping internal book index → top user_ids |
| `book_id_map.pkl` | Dict mapping real book_id → internal 0-based index |
| `user_id_map.pkl` | Dict mapping real user_id → internal SVD index |
