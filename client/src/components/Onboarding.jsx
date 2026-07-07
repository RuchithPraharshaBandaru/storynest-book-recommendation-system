import { useState, useEffect } from "react";
import api from "../api";
import BookCard from "./BookCard";

/**
 * Onboarding — After signup, shows a grid of 20 popular books.
 * User must select exactly 3 books they enjoy, then submit.
 */
export default function Onboarding({ onComplete }) {
  const [books, setBooks] = useState(() => {
    const cached = sessionStorage.getItem("onboarding_books");
    return cached ? JSON.parse(cached) : [];
  });
  const [selected, setSelected] = useState(() => {
    const cached = sessionStorage.getItem("onboarding_selected");
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(books.length === 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (books.length === 0) {
      fetchBooks();
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem("onboarding_selected", JSON.stringify(selected));
  }, [selected]);

  async function fetchBooks() {
    try {
      const res = await api.get("/books/onboarding");
      setBooks(res.data.books);
      sessionStorage.setItem("onboarding_books", JSON.stringify(res.data.books));
    } catch (err) {
      setError("Failed to load books. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(book) {
    setSelected((prev) => {
      const exists = prev.find((b) => b.book_id === book.book_id);
      if (exists) {
        return prev.filter((b) => b.book_id !== book.book_id);
      }
      if (prev.length >= 3) {
        // Replace oldest selection
        return [...prev.slice(1), book];
      }
      return [...prev, book];
    });
  }

  async function handleSubmit() {
    if (selected.length !== 3) return;

    setSubmitting(true);
    setError("");

    try {
      const book_ids = selected.map((b) => b.book_id);
      const res = await api.post("/user/onboard", { book_ids });

      // Update stored user info
      const storedUser = JSON.parse(localStorage.getItem("bookrec_user") || "{}");
      localStorage.setItem(
        "bookrec_user",
        JSON.stringify({ ...storedUser, onboarded: true })
      );
      
      // Clear session storage now that onboarding is complete
      sessionStorage.removeItem("onboarding_books");
      sessionStorage.removeItem("onboarding_selected");

      onComplete(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || "Onboarding failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", padding: "40px 20px 120px" }}>
      {/* Header */}
      <div
        className="animate-fade-in-up"
        style={{
          textAlign: "center",
          maxWidth: 600,
          margin: "0 auto 48px",
        }}
      >
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 16px",
          borderRadius: 100,
          background: "rgba(139, 92, 246, 0.1)",
          border: "1px solid rgba(139, 92, 246, 0.2)",
          fontSize: "0.8rem",
          color: "var(--accent-primary)",
          fontWeight: 500,
          marginBottom: 20,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          Step 1 of 1
        </div>

        <h1 style={{
          fontSize: "2.2rem",
          fontWeight: 800,
          marginBottom: 12,
          lineHeight: 1.2,
        }}>
          Pick 3 books you{" "}
          <span style={{
            background: "var(--accent-gradient)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            love
          </span>
        </h1>
        <p style={{
          color: "var(--text-secondary)",
          fontSize: "1.05rem",
          lineHeight: 1.6,
        }}>
          Help us understand your taste. Select exactly 3 books you've enjoyed,
          and we'll find your next favorite reads.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          className="animate-slide-in"
          style={{
            maxWidth: 480,
            margin: "0 auto 24px",
            padding: "12px 18px",
            background: "rgba(248, 113, 113, 0.1)",
            border: "1px solid rgba(248, 113, 113, 0.2)",
            borderRadius: 12,
            color: "var(--danger)",
            fontSize: "0.85rem",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      {/* Book Grid */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 20,
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 280, borderRadius: 16 }} />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 20,
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          {books.map((book, i) => (
            <div
              key={book.book_id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${i * 0.04}s`, opacity: 0 }}
            >
              <BookCard
                book={book}
                selectable
                selected={!!selected.find((s) => s.book_id === book.book_id)}
                onSelect={toggleSelect}
              />
            </div>
          ))}
        </div>
      )}

      {/* Floating selection indicator & submit button */}
      {selected.length > 0 && (
        <div className="selection-badge">
          <div
            className="glass-card-strong"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "14px 24px",
            }}
          >
            {/* Selection dots */}
            <div style={{ display: "flex", gap: 6 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: i < selected.length
                      ? "var(--accent-primary)"
                      : "rgba(0,0,0,0.1)",
                    border: i < selected.length
                      ? "none"
                      : "1px solid rgba(0,0,0,0.15)",
                    transition: "all 0.3s",
                    boxShadow: i < selected.length
                      ? "0 0 8px var(--accent-glow)"
                      : "none",
                  }}
                />
              ))}
            </div>

            <span style={{
              fontSize: "0.88rem",
              color: "var(--text-secondary)",
              fontWeight: 500,
            }}>
              {selected.length}/3 selected
            </span>

            <button
              className="btn-primary"
              disabled={selected.length !== 3 || submitting}
              onClick={handleSubmit}
              style={{
                padding: "10px 24px",
                fontSize: "0.88rem",
                opacity: selected.length === 3 ? 1 : 0.5,
              }}
            >
              {submitting ? "Setting up…" : "Continue &rarr;"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
