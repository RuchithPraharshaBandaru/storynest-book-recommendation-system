import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import BookCard from "./BookCard";

export default function BookDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);

  // Enhanced interaction state (Feature 3 + 6)
  const [rating, setRating] = useState(null);
  const [hoverRating, setHoverRating] = useState(null);
  const [favourite, setFavourite] = useState(false);
  const [readingStatus, setReadingStatus] = useState(null);
  const [interactionSaving, setInteractionSaving] = useState(false);

  // Similar books (Feature 2)
  const [similarBooks, setSimilarBooks] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(true);

  useEffect(() => {
    async function fetchBookAndLikeStatus() {
      try {
        const res = await api.get(`/books/${id}`);
        const data = res.data;
        setBook(data);

        // Check if liked and load interaction data
        const likedRes = await api.get("/user/liked");
        if (likedRes.data.some(b => b.book_id === parseInt(id))) {
          setIsLiked(true);
        }

        // Load interaction data
        try {
          const interRes = await api.get("/user/interactions");
          const interaction = interRes.data.find(i => i.book_id === parseInt(id));
          if (interaction) {
            setRating(interaction.rating);
            setFavourite(interaction.favourite);
            setReadingStatus(interaction.status);
          }
        } catch (err) {
          console.error("Fetch interaction error", err);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchBookAndLikeStatus();
    fetchSimilarBooks();
  }, [id]);

  async function fetchSimilarBooks() {
    setLoadingSimilar(true);
    try {
      const res = await api.get(`/books/${id}/similar`);
      setSimilarBooks(res.data);
    } catch (err) {
      console.error("Similar books error", err);
    } finally {
      setLoadingSimilar(false);
    }
  }

  async function handleLike() {
    setLikeLoading(true);
    try {
      await api.post("/user/like", { book_id: parseInt(id) });
      setIsLiked(true);
      setReadingStatus("finished");
    } catch (err) {
      if (err.response?.data?.error === "Book already liked") {
        setIsLiked(true);
      } else {
        alert("Failed to like book");
      }
    } finally {
      setLikeLoading(false);
    }
  }

  async function updateInteraction(updates) {
    setInteractionSaving(true);
    try {
      const res = await api.put(`/user/interaction/${id}`, updates);
      const inter = res.data.interaction;
      if (inter) {
        setRating(inter.rating);
        setFavourite(inter.favourite);
        setReadingStatus(inter.status);
        setIsLiked(true);
      }
    } catch (err) {
      console.error("Update interaction error", err);
    } finally {
      setInteractionSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div className="animate-float" style={{ color: "var(--accent-primary)" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg></div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div style={{ textAlign: "center", padding: "100px 20px", color: "var(--text-primary)" }}>
        <h2>Book not found</h2>
        <p style={{ color: "var(--danger)" }}>{error}</p>
        <button 
          onClick={() => {
            const userStr = localStorage.getItem("bookrec_user");
            const user = userStr ? JSON.parse(userStr) : null;
            navigate(user && !user.onboarded ? "/onboarding" : "/dashboard");
          }} 
          className="btn-primary" 
          style={{ marginTop: 24, padding: "10px 20px" }}
        >
          Back
        </button>
      </div>
    );
  }

  const statusLabels = {
    want_to_read: "Want to Read",
    currently_reading: "Currently Reading",
    finished: "Finished",
    dropped: "Dropped",
  };

  const statusColors = {
    want_to_read: "#3b82f6",
    currently_reading: "#f59e0b",
    finished: "#22c55e",
    dropped: "#ef4444",
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "60px 24px 80px" }} className="animate-fade-in-up">
      <button 
        onClick={() => {
          const userStr = localStorage.getItem("bookrec_user");
          const user = userStr ? JSON.parse(userStr) : null;
          navigate(user && !user.onboarded ? "/onboarding" : "/dashboard");
        }} 
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid var(--border-glass)",
          padding: "8px 16px",
          borderRadius: 8,
          color: "var(--text-secondary)",
          cursor: "pointer",
          marginBottom: 40,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          transition: "all 0.2s"
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }}><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg> Back
      </button>

      <div style={{ display: "flex", gap: 48, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Cover Image */}
        <div style={{ 
          flexShrink: 0, 
          width: 300, 
          borderRadius: 16, 
          overflow: "hidden", 
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)" 
        }}>
          {book.cover_image_url ? (
            <img 
              src={book.cover_image_url} 
              alt={book.title} 
              style={{ width: "100%", height: "auto", display: "block" }} 
            />
          ) : (
            <div style={{ width: 300, height: 450, background: "var(--bg-card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              No Cover
            </div>
          )}
        </div>

        {/* Details */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontSize: "2.8rem", fontWeight: 800, marginBottom: 12, lineHeight: 1.2 }}>
                {book.title}
              </h1>
              <h2 style={{ fontSize: "1.2rem", color: "var(--text-secondary)", fontWeight: 500, marginBottom: 24 }}>
                by {book.authors}
              </h2>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
            {/* Like / Add Button */}
            <button
              onClick={handleLike}
              disabled={isLiked || likeLoading}
              style={{
                background: isLiked ? "rgba(236, 72, 153, 0.1)" : "var(--accent-gradient)",
                border: isLiked ? "1px solid rgba(236, 72, 153, 0.3)" : "none",
                color: isLiked ? "#ec4899" : "white",
                padding: "12px 24px",
                borderRadius: 12,
                cursor: isLiked ? "default" : "pointer",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.3s",
                boxShadow: isLiked ? "none" : "0 4px 14px var(--accent-glow)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked ? "#ec4899" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              {likeLoading ? "Saving..." : isLiked ? "In Your List" : "Add to List"}
            </button>

            {/* Favourite Toggle (Feature 3) */}
            {isLiked && (
              <button
                onClick={() => updateInteraction({ favourite: !favourite })}
                disabled={interactionSaving}
                style={{
                  background: favourite ? "rgba(251, 191, 36, 0.15)" : "rgba(0,0,0,0.03)",
                  border: `1px solid ${favourite ? "rgba(251, 191, 36, 0.4)" : "var(--border-glass)"}`,
                  color: favourite ? "#f59e0b" : "var(--text-secondary)",
                  padding: "12px 20px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.3s",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={favourite ? "#f59e0b" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                {favourite ? "Favourited" : "Favourite"}
              </button>
            )}
          </div>

          {/* Star Rating (Feature 3) */}
          {isLiked && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                Your Rating
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => {
                      const newRating = rating === star ? null : star;
                      setRating(newRating);
                      updateInteraction({ rating: newRating });
                    }}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 4,
                      transition: "transform 0.2s",
                      transform: (hoverRating === star) ? "scale(1.3)" : "scale(1)",
                    }}
                  >
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill={(hoverRating || rating) >= star ? "#f59e0b" : "none"}
                      stroke={(hoverRating || rating) >= star ? "#f59e0b" : "var(--text-muted)"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                  </button>
                ))}
                {rating && (
                  <span style={{ 
                    marginLeft: 8, 
                    fontSize: "0.9rem", 
                    color: "var(--text-secondary)", 
                    alignSelf: "center",
                    fontWeight: 600,
                  }}>
                    {rating}/5
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Reading Status (Feature 6) */}
          {isLiked && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                Reading Status
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setReadingStatus(key);
                      updateInteraction({ status: key });
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 20,
                      border: `1.5px solid ${readingStatus === key ? statusColors[key] : "var(--border-glass)"}`,
                      background: readingStatus === key ? `${statusColors[key]}15` : "rgba(0,0,0,0.02)",
                      color: readingStatus === key ? statusColors[key] : "var(--text-secondary)",
                      fontWeight: readingStatus === key ? 700 : 500,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      transition: "all 0.25s",
                    }}
                  >
                    {readingStatus === key && "✓ "}{label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: "flex", gap: 24, marginBottom: 40 }}>
            <div style={{ background: "rgba(0,0,0,0.03)", padding: "16px 24px", borderRadius: 12, border: "1px solid var(--border-glass)" }}>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                Average Rating
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                {book.average_rating ? book.average_rating.toFixed(2) : "N/A"} <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--warning)" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginLeft: 4, verticalAlign: "middle" }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              </div>
            </div>
            <div style={{ background: "rgba(0,0,0,0.03)", padding: "16px 24px", borderRadius: 12, border: "1px solid var(--border-glass)" }}>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                Total Ratings
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {book.ratings_count ? book.ratings_count.toLocaleString() : "0"}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: 16, borderBottom: "1px solid var(--border-glass)", paddingBottom: 12 }}>
              About this Book
            </h3>
            <p style={{ fontSize: "1.05rem", lineHeight: 1.8, color: "var(--text-secondary)" }}>
              {book.description ? book.description : (
                <>
                  <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                    Hold tight! The system is currently fetching the description for this book in the background...
                  </span>
                  <br/><br/>
                  Dive into the world of <strong>{book.title}</strong> by the talented {book.authors}. 
                  This book has captivated readers around the world, amassing {book.ratings_count ? book.ratings_count.toLocaleString() : "many"} ratings.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Similar Books Section (Feature 2) */}
      <div style={{ marginTop: 64 }}>
        <h2 style={{ fontSize: "1.6rem", fontWeight: 700, marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
            <line x1="9" y1="9" x2="9.01" y2="9"></line>
            <line x1="15" y1="9" x2="15.01" y2="9"></line>
          </svg>
          Similar Books
        </h2>

        {loadingSimilar ? (
          <div style={{ display: "flex", gap: 16 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="skeleton" style={{ width: 180, height: 280, borderRadius: 16, flexShrink: 0 }} />
            ))}
          </div>
        ) : similarBooks.length > 0 ? (
          <div style={{
            display: "flex",
            gap: 20,
            overflowX: "auto",
            paddingBottom: 16,
            scrollSnapType: "x mandatory",
          }}>
            {similarBooks.map(sb => (
              <div
                key={sb.book_id}
                style={{ flex: "0 0 180px", scrollSnapAlign: "start" }}
              >
                <BookCard
                  book={sb}
                  style={{ width: "100%" }}
                />
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
            Similar books will appear once the ML engine loads.
          </p>
        )}
      </div>
    </div>
  );
}
