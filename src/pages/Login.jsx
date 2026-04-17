import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GoogleLogin } from "@react-oauth/google";
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const Login = () => {
    const navigate = useNavigate();
    const { login, loginWithGoogle } = useAuth();

    const [formData, setFormData] = useState({
        loginId: "",
        password: "",
    });

    const [step, setStep] = useState("login"); // login | forgot | reset
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError("");
    };

    // 🔐 LOGIN
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await login(formData);

            navigate("/");
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.message ||
                "Login failed"
            );
        } finally {
            setLoading(false);
        }
    };

    // 🔵 GOOGLE LOGIN (FIXED)
    const handleGoogleSuccess = async (credentialResponse) => {
        try {
            const res = await axios.post(
                `${API_BASE_URL}/api/auth/google`,
                {
                    credential: credentialResponse.credential,
                }
            );

            // IMPORTANT: sync context state
            loginWithGoogle(credentialResponse.credential);

            navigate("/");
        } catch (err) {
            setError("Google login failed");
        }
    };
    // 🔁 SEND OTP (forgot password)
    const handleForgotPassword = async () => {
        setLoading(true);
        try {
            await axios.post(
                `${API_BASE_URL}/api/auth/forgot-password`,
                { email: formData.loginId }
            );
            setStep("reset");
        } catch (err) {
            setError(err.response?.data?.message || "Failed to send OTP");
        } finally {
            setLoading(false);
        }
    };

    // 🔁 RESET PASSWORD
    const handleResetPassword = async () => {
        setLoading(true);
        try {
            await axios.post(
                `${API_BASE_URL}/api/auth/reset-password`,
                {
                    email: formData.loginId,
                    otp,
                    newPassword,
                }
            );

            setStep("login");
            setError("Password reset successful. Please login.");
        } catch (err) {
            setError(err.response?.data?.message || "Reset failed");
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0b141a] via-[#111b21] to-[#202c33]">
            <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden">

                <div className="bg-[#00a884] text-white text-center py-6">
                    <h1 className="text-2xl font-semibold">WhatsApp</h1>
                    <p className="text-sm opacity-90">
                        {step === "login" && "Log in to continue"}
                        {step === "reset" && "Reset your password"}
                    </p>
                </div>

                <div className="p-8 space-y-5">

                    {error && (
                        <p className="text-red-500 text-sm text-center">{error}</p>
                    )}

                    {step === "login" && (
                        <>
                            {/* Google */}
                            <div className="flex justify-center">
                                <GoogleLogin
                                    onSuccess={handleGoogleSuccess}
                                    onError={() => setError("Google login failed")}
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-px bg-gray-300"></div>
                                <span className="text-sm text-gray-500">OR</span>
                                <div className="flex-1 h-px bg-gray-300"></div>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">

                                <input
                                    type="text"
                                    name="loginId"
                                    placeholder="Phone or Email"
                                    required
                                    value={formData.loginId}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border rounded-md"
                                />

                                <input
                                    type="password"
                                    name="password"
                                    placeholder="Password"
                                    required
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border rounded-md"
                                />

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-[#00a884] text-white py-2 rounded-md"
                                >
                                    {loading ? "Logging in..." : "Log In"}
                                </button>
                            </form>

                            <p
                                className="text-sm text-center text-blue-500 cursor-pointer"
                                onClick={handleForgotPassword}
                            >
                                Forgot Password?
                            </p>
                        </>
                    )}

                    {step === "reset" && (
                        <>
                            <input
                                type="text"
                                placeholder="Enter OTP"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                className="w-full px-4 py-2 border rounded-md text-center"
                            />

                            <input
                                type="password"
                                placeholder="New Password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-4 py-2 border rounded-md"
                            />

                            <button
                                onClick={handleResetPassword}
                                className="w-full bg-[#00a884] text-white py-2 rounded-md"
                            >
                                Reset Password
                            </button>
                        </>
                    )}

                    <p className="text-sm text-center text-gray-600">
                        Don’t have an account?
                        <Link to="/register" className="ml-1 text-[#00a884]">
                            Create account
                        </Link>
                    </p>

                </div>
            </div>
        </div>
    );
};

export default Login;