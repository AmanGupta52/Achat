import axios, { isAxiosError } from "axios";
import { API_BASE_URL, TOKEN_KEY } from "./config";

/**
 * One axios instance for the whole app.
 * - always sends the current token (read at request time, so it is never stale)
 * - on 401 it tells AuthProvider to clear the session (no more half-logged-in UI)
 */
const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (isAxiosError(err) && err.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      window.dispatchEvent(new Event("auth:expired"));
    }
    return Promise.reject(err);
  }
);

/** Turn any error into a message that is safe to show. */
export const getErrorMessage = (err: unknown, fallback = "Something went wrong"): string => {
  if (isAxiosError(err)) {
    const message = (err.response?.data as { message?: string } | undefined)?.message;
    if (message) return message;
    if (err.request && !err.response) return "Cannot reach the server. Check your connection and try again.";
  }
  return fallback;
};

export const isCanceled = (err: unknown): boolean => axios.isCancel(err);

export default api;
