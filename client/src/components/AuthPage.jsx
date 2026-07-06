import { useState } from "react";
import api from "../api";

/**
 * AuthPage — Login / Register view with glassmorphism card and smooth transitions.
 */
export default function AuthPage({ onAuth }) {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const payload = isLogin
        ? { email: form.email, password: form.password }
        : { username: form.username, email: form.email, password: form.password };

      const res = await api.post(endpoint, payload);

      localStorage.setItem("bookrec_token", res.data.token);
      localStorage.setItem("bookrec_user", JSON.stringify(res.data.user));
      onAuth(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="glass-card-strong animate-fade-in-up"
        style={{
          width: "100%",
          maxWidth: 440,
          padding: "48px 40px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h1 style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            background: "var(--accent-gradient)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            marginBottom: 6,
          }}>
            Story Nest
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            {isLogin ? "Welcome back. Sign in to continue." : "Create your account to get started."}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!isLogin && (
            <div className="animate-slide-in">
              <label
                htmlFor="username-input"
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Username
              </label>
              <input
                id="username-input"
                name="username"
                type="text"
                className="input-field"
                placeholder="Enter your username"
                value={form.username}
                onChange={handleChange}
                required={!isLogin}
                autoComplete="username"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email-input"
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              id="email-input"
              name="email"
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="password-input"
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              id="password-input"
              name="password"
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </div>

          {/* Error message */}
          {error && (
            <div
              className="animate-slide-in"
              style={{
                padding: "10px 14px",
                background: "rgba(248, 113, 113, 0.1)",
                border: "1px solid rgba(248, 113, 113, 0.2)",
                borderRadius: 10,
                color: "var(--danger)",
                fontSize: "0.83rem",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ marginTop: 4, padding: "14px 28px", fontSize: "1rem" }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ animation: "spin 1s linear infinite" }}
                >
                  <circle cx="12" cy="12" r="10" opacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Processing…
              </span>
            ) : (
              isLogin ? "Sign In" : "Create Account"
            )}
          </button>
        </form>

        {/* Toggle login / register */}
        <div style={{
          textAlign: "center",
          marginTop: 24,
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
        }}>
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-primary)",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "inherit",
              fontFamily: "inherit",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            {isLogin ? "Sign up" : "Sign in"}
          </button>
        </div>
      </div>

      {/* Spin animation keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
