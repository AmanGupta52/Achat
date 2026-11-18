import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import App from "./App.tsx";
import { GOOGLE_CLIENT_ID } from "./config";

// Apply the saved theme before the first paint (also on the login pages, no flash)
if (localStorage.getItem("dark_mode") === "true") {
  document.documentElement.classList.add("dark");
}

const app = <App />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Google sign-in is optional: without a client id the app still works, the button is just hidden */}
    {GOOGLE_CLIENT_ID ? (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{app}</GoogleOAuthProvider>
    ) : (
      app
    )}
  </StrictMode>
);
