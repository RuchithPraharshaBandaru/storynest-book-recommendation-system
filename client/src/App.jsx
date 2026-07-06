import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import AuthPage from "./components/AuthPage";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import BookDetails from "./components/BookDetails";

/**
 * App — Root component with client-side routing.
 *
 * Routes:
 *   /           → Auth (login/register)
 *   /onboarding → Pick 3 books
 *   /dashboard  → Recommendations
 */
function AppRoutes() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem("bookrec_token");
    const storedUser = localStorage.getItem("bookrec_user");

    if (token && storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
      } catch {
        localStorage.removeItem("bookrec_token");
        localStorage.removeItem("bookrec_user");
      }
    }
    setChecking(false);
  }, []);

  function handleAuth(userData) {
    setUser(userData);
    if (userData.onboarded) {
      navigate("/dashboard");
    } else {
      navigate("/onboarding");
    }
  }

  function handleOnboardingComplete(userData) {
    setUser({ ...user, ...userData, onboarded: true });
    navigate("/dashboard");
  }

  function handleLogout() {
    localStorage.removeItem("bookrec_token");
    localStorage.removeItem("bookrec_user");
    setUser(null);
    navigate("/");
  }

  // Show nothing while checking auth state
  if (checking) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
      }}>
        <div className="animate-float" style={{ color: "var(--accent-primary)" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Auth page */}
      <Route
        path="/"
        element={
          user ? (
            user.onboarded ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/onboarding" replace />
            )
          ) : (
            <AuthPage onAuth={handleAuth} />
          )
        }
      />

      {/* Onboarding */}
      <Route
        path="/onboarding"
        element={
          !user ? (
            <Navigate to="/" replace />
          ) : user.onboarded ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Onboarding onComplete={handleOnboardingComplete} />
          )
        }
      />

      {/* Dashboard */}
      <Route
        path="/dashboard"
        element={
          !user ? (
            <Navigate to="/" replace />
          ) : !user.onboarded ? (
            <Navigate to="/onboarding" replace />
          ) : (
            <Dashboard user={user} onLogout={handleLogout} />
          )
        }
      />

      {/* Book Details */}
      <Route
        path="/book/:id"
        element={
          !user ? (
            <Navigate to="/" replace />
          ) : !user.onboarded ? (
            <Navigate to="/onboarding" replace />
          ) : (
            <BookDetails />
          )
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
