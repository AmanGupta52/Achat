import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import "./index.css";
import App from "./App.tsx";
import { GOOGLE_CLIENT_ID, GOOGLE_ENABLED, IS_NATIVE } from "./config";

// Apply the saved theme before the first paint (also on the login pages, no flash)
if (localStorage.getItem("dark_mode") === "true") {
  document.documentElement.classList.add("dark");
}

// Android app: light status-bar icons on top of the green header
if (IS_NATIVE) {
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});
}

const app = <App />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Google's script is only needed on the website; the Android app signs in through the system browser */}
    {GOOGLE_ENABLED && !IS_NATIVE ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{app}</GoogleOAuthProvider> : app}
  </StrictMode>
);
