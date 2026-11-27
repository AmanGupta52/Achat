import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";
import { IS_NATIVE } from "../config";
import { Alert } from "./AuthUI";

const GoogleG = () => (
  <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

interface Props {
  /** website: called with Google's ID token */
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}

/**
 * "Continue with Google".
 *  - website:     Google's own button
 *  - Android app: opens Google sign-in in the system browser (Google refuses embedded WebViews)
 */
const GoogleSignInButton = ({ onCredential, onError }: Props) => {
  const { startGoogleApp, googleAppPending, googleAppError } = useAuth();

  if (!IS_NATIVE) {
    return (
      <div className="flex justify-center">
        <GoogleLogin
          onSuccess={(response: CredentialResponse) =>
            response.credential ? onCredential(response.credential) : onError("Google login failed")
          }
          onError={() => onError("Google login failed")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Alert type="error">{googleAppError}</Alert>
      <button
        type="button"
        onClick={startGoogleApp}
        disabled={googleAppPending}
        className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border text-[15px] font-medium transition-colors
          bg-panel border-line text-ink
          hover:bg-wash disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <GoogleG />
        {googleAppPending ? "Waiting for Google…" : "Continue with Google"}
      </button>
    </div>
  );
};

export default GoogleSignInButton;
