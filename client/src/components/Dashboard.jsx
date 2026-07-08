import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import BookCard from "./BookCard";

/**
 * Dashboard — Displays the top 5 hybrid recommendations.
 * Each card has an "Ask AI Why" button for GenAI explanations.
 */
export default function Dashboard({ user, onLogout }) {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState(() => {
    const cached = sessionStorage.getItem("dashboard_recommendations");
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(recommendations.length === 0);
  const [error, setError] = useState("");
  const [userInfo, setUserInfo] = useState(null);

  const [activeTab, setActiveTab] = useState(() => {
    return sessionStorage.getItem("dashboard_tab") || "recommended";
  });
  const [showLikedModal, setShowLikedModal] = useState(false);

  const [randomBooks, setRandomBooks] = useState(() => {
    const cached = sessionStorage.getItem("dashboard_randomBooks");
    return cached ? JSON.parse(cached) : [];
  });
  const [loadingRandom, setLoadingRandom] = useState(randomBooks.length === 0);

  const [likedBooks, setLikedBooks] = useState([]);
  const [popularBooks, setPopularBooks] = useState(() => {
    const cached = sessionStorage.getItem("dashboard_popularBooks");
    return cached ? JSON.parse(cached) : [];
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState("title"); // "title" | "semantic" | "ai"
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Recommendation pool for instant refresh (Feature 9)
  const [recPool, setRecPool] = useState(() => {
    const cached = sessionStorage.getItem("dashboard_recPool");
    return cached ? JSON.parse(cached) : [];
  });

  // Feedback state (Feature 4)
  const [feedbackMap, setFeedbackMap] = useState({}); // { book_id: "helpful" | "not_interested" }

  // Browser-side ML service wake-up ping.
  // Render's free tier may not reliably wake a sleeping service from another free service.
  // By pinging from the browser (external traffic), we guarantee the ML service wakes up.
  useEffect(() => {
    const ML_URL = import.meta.env.VITE_ML_URL;
    if (ML_URL) {
      console.log(`[WAKEUP] Sending browser ping to ${ML_URL}/ping`);
      fetch(`${ML_URL}/ping`)
        .then(res => {
          console.log(`[WAKEUP] Browser ping responded with status: ${res.status}`);
          if (!res.ok) {
            console.warn(`[WAKEUP] Browser ping failed with status ${res.status}`);
          }
        })
        .catch(err => {
          console.error(`[WAKEUP] Browser ping network error:`, err);
        });
    }
  }, []);

  useEffect(() => {
    if (recommendations.length === 0) fetchRecommendations();
    if (popularBooks.length === 0) fetchPopularBooks();
    if (randomBooks.length === 0) fetchRandomBooks();
    fetchLikedBooks();
    fetchFeedback();
  }, []);

  // Save active tab
  useEffect(() => {
    sessionStorage.setItem("dashboard_tab", activeTab);
  }, [activeTab]);

  // Save scroll position per tab
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(`dashboard_scroll_${activeTab}`, window.scrollY);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeTab]);

  // Restore scroll position when tab changes or data loads
  useEffect(() => {
    const savedScroll = sessionStorage.getItem(`dashboard_scroll_${activeTab}`);
    if (savedScroll) {
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedScroll, 10));
      }, 50);
    } else {
      window.scrollTo(0, 0);
    }
  }, [activeTab, recommendations.length, popularBooks.length]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.length >= 3) {
        searchBooks(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  async function searchBooks(query) {
    setSearching(true);
    try {
      let res;
      if (searchMode === "semantic") {
        res = await api.get(`/books/semantic-search?q=${encodeURIComponent(query)}`);
      } else if (searchMode === "ai") {
        res = await api.post("/books/ai-search", { query });
        // AI search returns results in data directly
        setSearchResults(res.data);
        return;
      } else {
        res = await api.get(`/books/search?q=${encodeURIComponent(query)}`);
      }
      setSearchResults(res.data);
    } catch (err) {
      console.error("Search error", err);
    } finally {
      setSearching(false);
    }
  }

  async function handleLikeBook(bookId) {
    try {
      const isLiked = likedBooks.some(b => b.book_id === bookId);
      if (isLiked) {
        await api.delete(`/user/like/${bookId}`);
      } else {
        await api.post("/user/like", { book_id: bookId });
      }
      fetchLikedBooks();
      setLoading(true);
      fetchRecommendations();
    } catch (err) {
      alert(err.response?.data?.error || "Error updating book list");
    }
  }

  async function fetchLikedBooks() {
    try {
      const res = await api.get("/user/interactions");
      // Filter out any interactions where the book was deleted from DB
      setLikedBooks(res.data.filter(item => item.book));
    } catch (err) {
      console.error("Fetch list error", err);
    }
  }

  async function fetchPopularBooks() {
    try {
      const res = await api.get("/books/popular");
      setPopularBooks(res.data);
      sessionStorage.setItem("dashboard_popularBooks", JSON.stringify(res.data));
    } catch (err) {
      console.error("Fetch popular error", err);
    }
  }

  async function fetchRandomBooks() {
    setLoadingRandom(true);
    try {
      const res = await api.get("/books/random?limit=5");
      setRandomBooks(res.data);
      sessionStorage.setItem("dashboard_randomBooks", JSON.stringify(res.data));
    } catch (err) {
      console.error("Fetch random error", err);
    } finally {
      setLoadingRandom(false);
    }
  }

  async function fetchRecommendations() {
    try {
      const res = await api.get("/user/dashboard");
      const recs = res.data.recommendations;
      setRecommendations(recs);
      sessionStorage.setItem("dashboard_recommendations", JSON.stringify(recs));
      // Also store as pool for instant refresh
      setRecPool(recs);
      sessionStorage.setItem("dashboard_recPool", JSON.stringify(recs));
      setUserInfo(res.data.user);
    } catch (err) {
      setError("Failed to load recommendations. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function refreshFromPool() {
    if (recPool.length <= 10) {
      // Pool too small, fetch fresh from server
      setLoading(true);
      fetchRecommendations();
      return;
    }
    // Randomly sample 10 from the pool
    const shuffled = [...recPool].sort(() => Math.random() - 0.5);
    const sample = shuffled.slice(0, 10);
    setRecommendations(sample);
    sessionStorage.setItem("dashboard_recommendations", JSON.stringify(sample));
  }

  async function fetchFeedback() {
    try {
      const res = await api.get("/user/feedback");
      const map = {};
      for (const fb of res.data) {
        map[fb.book_id] = fb.type;
      }
      setFeedbackMap(map);
    } catch (err) {
      console.error("Fetch feedback error", err);
    }
  }

  async function handleFeedback(bookId, type) {
    try {
      await api.post("/user/feedback", { book_id: bookId, type });
      setFeedbackMap(prev => ({ ...prev, [bookId]: type }));
    } catch (err) {
      console.error("Feedback error", err);
    }
  }

  // Build a readable read-history string for the AI prompt.
  // We pass the full list to the backend, and the AI will selectively pick
  // the 1 or 2 most relevant books for each specific recommendation.
  const readHistoryText = likedBooks.length > 0
    ? likedBooks.map(b => b.book.title).join(", ")
    : "books from their reading history";

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Navigation Bar */}
      <nav
        className="glass-card"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          padding: "14px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 0,
          borderTop: "none",
          borderLeft: "none",
          borderRight: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          
          <span style={{
            fontWeight: 700,
            fontSize: "1.1rem",
            background: "var(--accent-gradient)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Story Nest
          </span>
        </div>

        {/* Center: Tabs & Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, flex: 1, justifyContent: "center", maxWidth: 800 }}>
          {/* Tab Switcher in Navbar */}
          <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.04)", padding: 4, borderRadius: 12 }}>
            <button
              onClick={() => setActiveTab("recommended")}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: activeTab === "recommended" ? "var(--accent-primary)" : "transparent",
                color: activeTab === "recommended" ? "#fff" : "var(--text-secondary)",
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                fontSize: "0.85rem",
              }}
            >
              Recommended
            </button>
            <button
              onClick={() => setActiveTab("popular")}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: activeTab === "popular" ? "var(--accent-primary)" : "transparent",
                color: activeTab === "popular" ? "#fff" : "var(--text-secondary)",
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                fontSize: "0.85rem",
              }}
            >
              Top 100
            </button>
          </div>

          {/* Search in Navbar */}
          <div style={{ position: "relative", flex: 1, maxWidth: 500 }}>
            <div style={{ display: "flex", gap: 0, marginBottom: 0 }}>
              {/* Search mode toggle dropdown */}
              <select
                value={searchMode}
                onChange={(e) => { setSearchMode(e.target.value); setSearchResults([]); }}
                style={{
                  padding: "10px 12px",
                  borderRadius: "12px 0 0 12px",
                  border: "1px solid var(--border-glass)",
                  borderRight: "none",
                  background: "rgba(0,0,0,0.03)",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="title">Keyword Search</option>
                <option value="semantic">Semantic Search</option>
                <option value="ai">AI Search</option>
              </select>
              <input
                type="text"
                placeholder={searchMode === "title" ? "Search by title or author..." : searchMode === "semantic" ? "Describe what you're looking for..." : "Ask AI for book recommendations..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: "0 12px 12px 0",
                  border: "1px solid var(--border-glass)",
                  background: "rgba(0,0,0,0.03)",
                  color: "var(--text-primary)",
                  fontSize: "0.9rem",
                  outline: "none",
                  transition: "all 0.3s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--accent-primary)";
                  setIsSearchFocused(true);
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--border-glass)";
                  setTimeout(() => setIsSearchFocused(false), 200);
                }}
              />
            </div>
            {searching && (
              <div style={{ position: "absolute", right: 16, top: 10, color: "var(--text-muted)", fontSize: "0.8rem" }}>
                ...
              </div>
            )}

            {/* Search Results Dropdown */}
            {(searchResults.length > 0 && isSearchFocused) && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 8,
                background: "var(--bg-card)",
                border: "1px solid var(--border-glass)",
                borderRadius: 12,
                padding: 8,
                zIndex: 1000,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                maxHeight: 400,
                overflowY: "auto",
              }}>
                {searchResults.map(book => (
                  <div 
                    key={book.book_id} 
                    onClick={() => navigate(`/book/${book.book_id}`)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem" }}>{book.title}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{book.authors}</div>
                    </div>
                    {likedBooks.some(b => b.book_id === book.book_id) ? (
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleLikeBook(book.book_id);
                        }}
                        style={{ fontSize: "0.75rem", color: "var(--success)", padding: "6px 12px", fontWeight: 600, background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.2)", borderRadius: 8, cursor: "pointer", flexShrink: 0 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 4, verticalAlign: "text-bottom" }}><polyline points="20 6 9 17 4 12"></polyline></svg>In Your List
                      </button>
                    ) : (
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleLikeBook(book.book_id);
                        }}
                        className="btn-primary"
                        style={{ padding: "6px 12px", fontSize: "0.75rem", borderRadius: 8, flexShrink: 0 }}
                      >
                        Add to List
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: User controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => setShowLikedModal(true)}
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "50%",
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s",
              fontSize: "1.2rem",
            }}
            title="View My List"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </button>
          <span style={{
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
          }}>
            <b> {user?.username || "Reader"} </b>
          </span>
          <button
            onClick={onLogout}
            style={{
              background: "rgba(0,0,0,0.06)",
              border: "1px solid var(--border-glass)",
              borderRadius: 8,
              padding: "7px 14px",
              color: "var(--text-secondary)",
              fontSize: "0.8rem",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s",
            }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* Header */}
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 800 }}>
            {activeTab === "recommended" ? "Curated For You" : "Most Popular Books"}
          </h1>

          {activeTab === "recommended" && (
            <button
              onClick={refreshFromPool}
              style={{
                background: "rgba(0,0,0,0.06)",
                border: "1px solid var(--border-glass)",
                borderRadius: "50%",
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--text-primary)",
                transition: "all 0.2s",
              }}
              title="Refresh Recommendations (instant from pool)"
              onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
              onMouseOut={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.06)"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          )}
        </div>
        {/* Error state */}
        {error && (
          <div
            className="animate-slide-in"
            style={{
              padding: "16px 22px",
              background: "rgba(248, 113, 113, 0.1)",
              border: "1px solid rgba(248, 113, 113, 0.2)",
              borderRadius: 14,
              color: "var(--danger)",
              fontSize: "0.9rem",
              marginBottom: 32,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></span>
            {error}
            <button
              onClick={() => { setError(""); setLoading(true); fetchRecommendations(); }}
              className="btn-secondary"
              style={{ marginLeft: "auto", padding: "6px 14px", fontSize: "0.8rem" }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Main Content Area */}
        {/* RECOMMENDED TAB */}
        {activeTab === "recommended" && (
            <>
              {loading ? (
                <div style={{ textAlign: "center", padding: "40px 20px 60px" }}>
                  <div className="animate-float" style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "var(--accent-gradient)",
                    marginBottom: 20,
                    boxShadow: "0 8px 32px var(--accent-glow)"
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
                  </div>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 8, color: "var(--text-primary)" }}>
                    Waking ML Server & Generating Recommendations...
                  </h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", maxWidth: 400, margin: "0 auto" }}>
                    Please wait while our machine learning models analyze your reading history and calculate vector embeddings. This usually takes 15-30 seconds on a cold start.
                  </p>
                  
                  {/* Skeletons below the message */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 24,
                    marginTop: 40,
                    opacity: 0.5,
                  }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i}>
                        <div className="skeleton" style={{ height: 180, borderRadius: "16px 16px 0 0" }} />
                        <div style={{ background: "var(--bg-card)", padding: 16, borderRadius: "0 0 16px 16px", border: "1px solid var(--border-glass)", borderTop: "none" }}>
                          <div className="skeleton" style={{ height: 16, width: "80%", marginBottom: 8, borderRadius: 6 }} />
                          <div className="skeleton" style={{ height: 12, width: "50%", marginBottom: 16, borderRadius: 6 }} />
                          <div className="skeleton" style={{ height: 36, borderRadius: 8 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 24,
                }}>
                  {recommendations.map((book, i) => (
                    <div
                      key={book.book_id}
                      className="animate-fade-in-up"
                      style={{ animationDelay: `${i * 0.05}s`, opacity: 0, animationFillMode: "forwards" }}
                    >
                      <BookCard
                        book={book}
                        showWhyButton
                        showFeedback
                        userReadHistory={readHistoryText}
                        feedbackState={feedbackMap[book.book_id] || null}
                        onFeedback={handleFeedback}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* POPULAR TAB */}
          {activeTab === "popular" && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 24,
            }}>
              {popularBooks.map((book, i) => (
                <div
                  key={book.book_id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${(i % 10) * 0.05}s`, opacity: 0, animationFillMode: "forwards" }}
                >
                  <BookCard book={book} />
                </div>
              ))}
            </div>
          )}

            {/* Empty state for Recommendations */}
            {activeTab === "recommended" && recommendations.length === 0 && !error && (
              <div style={{
                textAlign: "center",
                padding: "80px 20px",
              }}>
                <div className="animate-float" style={{
                  fontSize: "3rem",
                  marginBottom: 16,
                }}>
                  📚
                </div>
                <h3 style={{ fontWeight: 600, marginBottom: 8, fontSize: "1.1rem" }}>
                  No recommendations yet
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  We're crunching the numbers. Check back in a moment!
                </p>
              </div>
            )}

            {/* Random Books section */}
            {activeTab === "recommended" && (
              <div style={{ marginTop: 64 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h2 style={{ fontSize: "1.6rem", fontWeight: 700 }}>
                    Random Picks
                  </h2>
                  <button
                    onClick={fetchRandomBooks}
                    disabled={loadingRandom}
                    style={{
                      background: "rgba(0,0,0,0.06)",
                      border: "1px solid var(--border-glass)",
                      borderRadius: "50%",
                      width: 36,
                      height: 36,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: loadingRandom ? "default" : "pointer",
                      color: "var(--text-primary)",
                      transition: "all 0.2s",
                      opacity: loadingRandom ? 0.5 : 1,
                    }}
                    title="Refresh Random Picks"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loadingRandom ? "animate-spin" : ""}>
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                </div>

                {loadingRandom ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                    <div className="animate-spin" style={{ color: "var(--text-secondary)", display: "flex", justifyContent: "center" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg></div>
                  </div>
                ) : (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 24,
                  }}>
                    {randomBooks.map((book) => (
                      <BookCard
                        key={book.book_id}
                        book={book}
                        showWhyButton={false}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
      </div>

      {/* My List Modal */}
      {showLikedModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}>
          <div className="glass-card animate-slide-in" style={{
            width: "100%",
            maxWidth: 1100,
            maxHeight: "85vh",
            overflowY: "auto",
            padding: "32px 40px",
            position: "relative",
          }}>
            <button
              onClick={() => setShowLikedModal(false)}
              style={{
                position: "absolute",
                top: 24,
                right: 24,
                background: "rgba(255,255,255,0.1)",
                border: "none",
                borderRadius: "50%",
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-primary)",
                fontSize: "1.2rem",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              ✕
            </button>
            <h2 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 32, display: "flex", alignItems: "center", gap: 12 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 12, verticalAlign: "middle" }}><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> My List
            </h2>
            {(() => {
              if (likedBooks.length === 0) {
                return (
                  <div style={{ textAlign: "center", padding: "60px 20px" }}>
                    <div style={{ color: "var(--accent-primary)", display: "flex", justifyContent: "center", marginBottom: 16 }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg></div>
                    <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem" }}>You haven't added any books yet! Search and add some from your dashboard.</p>
                  </div>
                );
              }

              // Categorize books
              const grouped = {
                reading: likedBooks.filter(i => i.status === "reading"),
                want: likedBooks.filter(i => i.status === "want_to_read"),
                finished: likedBooks.filter(i => i.status === "finished"),
                dropped: likedBooks.filter(i => i.status === "dropped"),
                favourite: likedBooks.filter(i => i.favourite),
                other: likedBooks.filter(i => !i.status && !i.favourite)
              };

              const titles = {
                reading: "Currently Reading",
                want: "Want to Read",
                finished: "Finished",
                dropped: "Dropped",
                favourite: "Favourites",
                other: "Added"
              };

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
                  {Object.entries(grouped).map(([key, items]) => {
                    if (items.length === 0) return null;
                    return (
                      <div key={key}>
                        <h3 style={{ 
                          fontSize: "1.4rem", 
                          fontWeight: 600, 
                          color: "var(--text-primary)", 
                          marginBottom: 20,
                          paddingBottom: 8,
                          borderBottom: "1px solid var(--border-glass)"
                        }}>
                          {titles[key]} <span style={{ color: "var(--text-muted)", fontSize: "0.9rem", fontWeight: "normal", marginLeft: 8 }}>({items.length})</span>
                        </h3>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                          gap: 24,
                        }}>
                          {items.map((item) => (
                            <div key={item.book_id}>
                              <BookCard book={item.book} />
                              {item.rating && (
                                <div style={{ 
                                  marginTop: 12, 
                                  fontSize: "1.1rem", 
                                  color: "#f59e0b", 
                                  textAlign: "center",
                                  letterSpacing: 2
                                }}>
                                  {"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
