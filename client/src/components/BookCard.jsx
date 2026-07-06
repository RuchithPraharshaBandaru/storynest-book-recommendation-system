import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import api from "../api";

/**
 * BookCard — Reusable book display component.
 *
 * Supports two modes:
 *   1. Selection mode (onboarding): click to toggle selection
 *   2. Display mode (dashboard): shows "Ask AI Why" button
 *
 * Fetches real book covers from Open Library API with gradient fallback.
 */

// Curated palette of gradient pairs for book covers
const COVER_GRADIENTS = [
  ["#6366f1", "#8b5cf6"],
  ["#ec4899", "#f43f5e"],
  ["#14b8a6", "#06b6d4"],
  ["#f59e0b", "#ef4444"],
  ["#8b5cf6", "#d946ef"],
  ["#06b6d4", "#3b82f6"],
  ["#10b981", "#059669"],
  ["#f97316", "#eab308"],
  ["#e11d48", "##be185d"],
  ["#7c3aed", "#4f46e5"],
  ["#0ea5e9", "#6366f1"],
  ["#d946ef", "#f43f5e"],
  ["#84cc16", "#22c55e"],
  ["#f43f5e", "#fb923c"],
  ["#a855f7", "#3b82f6"],
  ["#facc15", "#fb923c"],
  ["#22d3ee", "#818cf8"],
  ["#fb7185", "#c084fc"],
  ["#34d399", "#2dd4bf"],
  ["#fbbf24", "#f87171"],
];

function getGradient(bookId) {
  const idx = Math.abs(bookId) % COVER_GRADIENTS.length;
  return COVER_GRADIENTS[idx];
}

function getInitials(title) {
  return title
    .split(/[\s:]+/)
    .filter((w) => w.length > 0 && w[0] === w[0].toUpperCase())
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

export default function BookCard({
  book,
  selected = false,
  onSelect,
  selectable = false,
  showWhyButton = false,
  onAskWhy,
  style = {},
  userReadHistory = "",
}) {
  const navigate = useNavigate();
  const [loadingWhy, setLoadingWhy] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [coverLoaded, setCoverLoaded] = useState(false);

  const [c1, c2] = getGradient(book.book_id);
  const initials = getInitials(book.title);

  const coverUrl = book.cover_image_url || null;

  async function handleAskWhy() {
    setShowModal(true);
    setLoadingWhy(true);
    try {
      const res = await api.post("/user/explain", {
        user_read_history: userReadHistory,
        recommended_book: `${book.title} by ${book.authors}. ${book.content || ""}`,
      });
      setExplanation(res.data.explanation);
    } catch (err) {
      setExplanation("Sorry, I couldn't generate an explanation right now. Please try again.");
    } finally {
      setLoadingWhy(false);
    }
  }

  return (
    <>
      <div
        id={`book-card-${book.book_id}`}
        onClick={selectable ? () => onSelect?.(book) : undefined}
        className={`
          relative group cursor-pointer transition-all duration-300
          ${selectable ? "hover:scale-[1.03]" : ""}
        `}
        style={{
          ...style,
          borderRadius: "16px",
          overflow: "hidden",
          border: selected
            ? "2px solid var(--accent-primary)"
            : "1px solid var(--border-glass)",
          background: "var(--bg-card)",
          boxShadow: selected
            ? "0 0 24px var(--accent-glow), 0 8px 32px rgba(0,0,0,0.3)"
            : "0 4px 20px rgba(0,0,0,0.2)",
        }}
      >
        {/* Selected check badge */}
        {selected && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 10,
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--accent-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 12px var(--accent-glow)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}

        {/* Book Cover */}
        <div
          style={{
            height: 220,
            background: `linear-gradient(135deg, ${c1}, ${c2})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Real cover image */}
          {coverUrl && (
            <img
              src={coverUrl}
              alt={book.title}
              onLoad={() => setCoverLoaded(true)}
              onError={() => { setCoverUrl(null); setCoverLoaded(false); }}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: coverLoaded ? 1 : 0,
                transition: "opacity 0.4s ease",
                zIndex: 2,
              }}
            />
          )}

          {/* Gradient fallback (visible while loading or if no cover) */}
          {!coverLoaded && (
            <>
              {/* Decorative elements */}
              <div style={{
                position: "absolute",
                top: -20,
                right: -20,
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
              }} />
              <div style={{
                position: "absolute",
                bottom: -10,
                left: -10,
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.08)",
              }} />

              {/* Book icon + initials */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
                <span style={{
                  color: "rgba(255,255,255,0.95)",
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  textShadow: "0 2px 8px rgba(0,0,0,0.3)",
                }}>
                  {initials}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Book Info */}
        <div style={{ padding: "16px 16px 20px" }}>
          <h3
            style={{
              fontSize: "0.9rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.3,
              marginBottom: 6,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {book.title}
          </h3>
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--text-secondary)",
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {book.authors}
          </p>

          {/* "Ask AI Why" button for dashboard mode */}
          {showWhyButton && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAskWhy();
              }}
              className="btn-secondary"
              style={{
                marginTop: 14,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                fontSize: "0.8rem",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Ask AI Why
            </button>
          )}

          {/* View Details Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/book/${book.book_id}`);
            }}
            style={{
              marginTop: 8,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: "0.8rem",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border-glass)",
              color: "var(--text-secondary)",
              padding: "8px 16px",
              borderRadius: 8,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            View Details
          </button>
        </div>
      </div>

      {/* AI Explanation Modal */}
      {showModal && createPortal(
        <div
          className="modal-overlay"
          onClick={() => { setShowModal(false); setExplanation(null); }}
        >
          <div
            className="glass-card-strong animate-slide-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 480,
              width: "90%",
              padding: "32px",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 24,
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--accent-gradient)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                    <path d="M12 12 2.1 12" />
                    <path d="M12 12 20.5 4.5" />
                  </svg>
                </div>
                <h3 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "white" }}>
                  AI Analysis
                </h3>
              </div>
              
              <button 
                onClick={(e) => { e.stopPropagation(); setShowModal(false); }}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "none",
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  transition: "all 0.2s",
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Book title */}
            <div style={{
              padding: "16px 20px",
              background: "rgba(139, 92, 246, 0.08)",
              borderRadius: 12,
              border: "1px solid rgba(139, 92, 246, 0.2)",
              marginBottom: 32,
            }}>
              <p style={{ fontSize: "1rem", color: "var(--accent-primary)", fontWeight: 700, marginBottom: 4 }}>
                {book.title}
              </p>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                by {book.authors}
              </p>
            </div>

            {/* Explanation */}
            {loadingWhy ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="skeleton" style={{ height: 20, width: "100%", borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 20, width: "90%", borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 20, width: "95%", borderRadius: 6 }} />
                <p style={{
                  fontSize: "1rem",
                  color: "var(--accent-primary)",
                  textAlign: "center",
                  marginTop: 16,
                  fontWeight: 500,
                  animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Analyzing your reading history…
                </p>
              </div>
            ) : (
              <p style={{
                fontSize: "1.15rem",
                lineHeight: 1.8,
                color: "var(--text-primary)",
                fontWeight: 400,
                letterSpacing: "0.3px",
              }}>
                {explanation}
              </p>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
