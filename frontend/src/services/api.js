import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export const getToken = () =>
  localStorage.getItem("devintel_token") ||
  localStorage.getItem("token") ||
  "";

export const setSession = (data) => {
  const token = data?.token;
  if (token) {
    localStorage.setItem("devintel_token", token);
    localStorage.setItem("token", token);
  }
  if (data?.user) {
    localStorage.setItem("devintel_user", JSON.stringify(data.user));
  }
};

export const getSession = () => {
  const token = getToken();
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("devintel_user") || "null");
  } catch {
    user = null;
  }
  return { token, user };
};

export const clearSession = () => {
  ["devintel_token", "token", "devintel_user"].forEach((key) =>
    localStorage.removeItem(key)
  );
};

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearSession();
    }
    return Promise.reject(error);
  }
);

export default api;
