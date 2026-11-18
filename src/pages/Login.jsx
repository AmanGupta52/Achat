import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";
import { GOOGLE_CLIENT_ID } from "../config";
import { AuthLayout, Alert, TextInput, PasswordInput, PrimaryButton, LinkButton, Divider } from "../components/AuthUI";

const SUBTITLES = {
    login: "Log in to continue",
    verify: "Verify your account",
    forgot: "Forgot your password?",
    reset: "Choose a new password",
};

const Login = () => {
    const { currentUser, login, loginWithGoogle, verifyOtp, resendOtp, forgotPassword, resetPassword } = useAuth();

    const [step, setStep] = useState("login"); // login | verify | forgot | reset
    const [form, setForm] = useState({ loginId: "", password: "" });
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");

    const [error, setError] = useState("");
    const [info, setInfo] = useState("");
    const [loading, setLoading] = useState(false);

    // Already logged in → go to the app
    if (currentUser) return <Navigate to="/" replace />;

    const goTo = (next) => {
        setStep(next);
        setError("");
        setInfo("");
    };

    /** Runs an async action with shared loading / error handling. */
    const run = async (fn) => {
        setLoading(true);
        setError("");
        setInfo("");
        try {
            await fn();
        } catch (err) {
            setError(err.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
        setError("");
    };

    // 🔐 login (on success the <Navigate> above takes over)
    const handleLogin = (e) => {
        e.preventDefault();
        run(async () => {
            try {
                await login(form);
            } catch (err) {
                // Registered but never verified → send a fresh code and ask for it
                if (err.needsVerification) {
                    const target = err.email || form.loginId;
                    setEmail(target);
                    await resendOtp(target);
                    setStep("verify");
                    setInfo("Your account isn't verified yet. We've sent you a new code.");
                    return;
                }
                throw err;
            }
        });
    };

    const handleVerify = (e) => {
        e.preventDefault();
        run(() => verifyOtp(email, otp));
    };

    const handleGoogle = (credentialResponse) => run(() => loginWithGoogle(credentialResponse.credential));

    const handleForgot = (e) => {
        e.preventDefault();
        run(async () => {
            await forgotPassword(email);
            setStep("reset");
            setInfo("If an account exists for this email, we've sent a 6-digit code.");
        });
    };

    const handleReset = (e) => {
        e.preventDefault();
        run(async () => {
            await resetPassword({ email, otp, newPassword });
            setOtp("");
            setNewPassword("");
            setStep("login");
            setInfo("Password updated. Please log in with your new password.");
        });
    };

    return (
        <AuthLayout subtitle={SUBTITLES[step]}>
            <Alert type="error">{error}</Alert>
            <Alert type="success">{info}</Alert>

            {step === "login" && (
                <>
                    {GOOGLE_CLIENT_ID && (
                        <>
                            <div className="flex justify-center">
                                <GoogleLogin onSuccess={handleGoogle} onError={() => setError("Google login failed")} />
                            </div>
                            <Divider />
                        </>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <TextInput
                            type="text"
                            name="loginId"
                            placeholder="Phone or Email"
                            autoComplete="username"
                            required
                            value={form.loginId}
                            onChange={handleChange}
                        />
                        <PasswordInput
                            name="password"
                            placeholder="Password"
                            autoComplete="current-password"
                            required
                            value={form.password}
                            onChange={handleChange}
                        />
                        <PrimaryButton type="submit" loading={loading}>
                            {loading ? "Logging in..." : "Log In"}
                        </PrimaryButton>
                    </form>

                    <div className="text-center">
                        <LinkButton
                            onClick={() => {
                                setEmail(form.loginId.includes("@") ? form.loginId : "");
                                goTo("forgot");
                            }}
                        >
                            Forgot password?
                        </LinkButton>
                    </div>
                </>
            )}

            {step === "verify" && (
                <form onSubmit={handleVerify} className="space-y-4">
                    <p className="text-sm text-center text-gray-600 dark:text-gray-300">
                        Enter the 6-digit code sent to <b>{email}</b>
                    </p>
                    <TextInput
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="••••••"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                        className="text-center tracking-[0.5em] text-lg"
                        required
                    />
                    <PrimaryButton type="submit" loading={loading || otp.length !== 6}>
                        {loading ? "Verifying..." : "Verify"}
                    </PrimaryButton>
                    <div className="text-center">
                        <LinkButton
                            disabled={loading}
                            onClick={() => run(async () => { await resendOtp(email); setInfo("A new code has been sent."); })}
                        >
                            Resend code
                        </LinkButton>
                    </div>
                </form>
            )}

            {step === "forgot" && (
                <form onSubmit={handleForgot} className="space-y-4">
                    <p className="text-sm text-center text-gray-600 dark:text-gray-300">
                        Enter your account email and we'll send you a reset code.
                        <span className="block text-xs text-gray-400 mt-1">Signed up with Google? Use the Google button to log in.</span>
                    </p>
                    <TextInput
                        type="email"
                        placeholder="Email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <PrimaryButton type="submit" loading={loading}>
                        {loading ? "Sending..." : "Send reset code"}
                    </PrimaryButton>
                </form>
            )}

            {step === "reset" && (
                <form onSubmit={handleReset} className="space-y-4">
                    <TextInput
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit code"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                        className="text-center tracking-[0.4em]"
                        required
                    />
                    <PasswordInput
                        placeholder="New password (min 6 characters)"
                        autoComplete="new-password"
                        minLength={6}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <PrimaryButton type="submit" loading={loading}>
                        {loading ? "Saving..." : "Reset password"}
                    </PrimaryButton>
                </form>
            )}

            {step !== "login" ? (
                <p className="text-sm text-center">
                    <LinkButton onClick={() => goTo("login")}>← Back to log in</LinkButton>
                </p>
            ) : (
                <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                    Don’t have an account?
                    <Link to="/register" className="ml-1 text-[#00a884] font-medium hover:underline">
                        Create account
                    </Link>
                </p>
            )}
        </AuthLayout>
    );
};

export default Login;
