export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export const TOKEN_KEY = "auth_token";
export const USER_KEY = "auth_user";
export const APP_NAME = "WhatsApp Clone";
