import axios from "axios";

// In development, Vite proxies /api → http://localhost:5000
// In production, set VITE_API_URL to the actual backend URL
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("bookrec_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses (expired/invalid token)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("bookrec_token");
      localStorage.removeItem("bookrec_user");
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

export default api;
