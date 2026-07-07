import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";

export default function BookDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);

  useEffect(() => {
    async function fetchBookAndLikeStatus() {
      try {
        const res = await api.get(`/books/${id}`);
        const data = res.data;
        setBook(data);

        // Check if liked
        const likedRes = await api.get("/user/liked");
        if (likedRes.data.some(b => b.book_id === parseInt(id))) {
          setIsLiked(true);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchBookAndLikeStatus();
  }, [id]);

  async function handleLike() {
    setLikeLoading(true);
    try {
      await api.post("/user/like", { book_id: parseInt(id) });
      setIsLiked(true);
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

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "60px 24px" }} className="animate-fade-in-up">
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
              <h2 style={{ fontSize: "1.2rem", color: "var(--text-secondary)", fontWeight: 500, marginBottom: 32 }}>
                by {book.authors}
              </h2>
            </div>
            
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
              {likeLoading ? "Saving..." : isLiked ? "Liked" : "Add to Liked Books"}
            </button>
          </div>

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
    </div>
  );
}
