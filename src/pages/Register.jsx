import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import axios from "axios";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const Register = () => {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        phone: "",
    });

    const [otp, setOtp] = useState("");
    const [step, setStep] = useState("form"); // form | otp
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError("");
    };

    // STEP 1: Register → send OTP
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            await axios.post(`${API_BASE_URL}/api/auth/register`, {
                username: formData.name,
                email: formData.email,
                password: formData.password,
                phone: formData.phone,
            });

            setStep("otp");
        } catch (err) {
            setError(err.response?.data?.message || "Registration failed");
        } finally {
            setLoading(false);
        }
    };

    // STEP 2: Verify OTP
    const handleVerifyOTP = async () => {
        setLoading(true);

        try {
            const res = await axios.post(
                `${API_BASE_URL}/api/auth/verify-otp`,
                {
                    email: formData.email,
                    otp,
                }
            );

            // Save token manually (since useAuth register no longer used here)
            localStorage.setItem("token", res.data.accessToken);

            navigate("/");
        } catch (err) {
            setError(err.response?.data?.message || "OTP verification failed");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSuccess = async (credentialResponse) => {
        try {
            const res = await axios.post(
                `${API_BASE_URL}/api/auth/google`,
                {
                    credential: credentialResponse.credential, // ✅ FIXED
                }
            );

            localStorage.setItem("token", res.data.accessToken);
            navigate("/");
        } catch (err) {
            console.error("Google auth failed", err);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0b141a] via-[#111b21] to-[#202c33]">
            <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden">

                <div className="bg-[#00a884] text-white text-center py-6">
                    <h1 className="text-2xl font-semibold">WhatsApp</h1>
                    <p className="text-sm opacity-90">
                        {step === "form" ? "Create your account" : "Verify OTP"}
                    </p>
                </div>

                <div className="p-8 space-y-5">

                    {error && (
                        <p className="text-red-500 text-sm text-center">{error}</p>
                    )}

                    {step === "form" && (
                        <>
                            {/* Google */}
                            <div className="flex justify-center">
                                <GoogleLogin
                                    onSuccess={handleGoogleSuccess}
                                    onError={() => console.log("Google Login Failed")}
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
                                    name="name"
                                    placeholder="Your name"
                                    required
                                    value={formData.name}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border rounded-md"
                                />

                                <input
                                    type="number"
                                    name="phone"
                                    placeholder="Phone number"
                                    required
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border rounded-md"
                                />

                                <input
                                    type="email"
                                    name="email"
                                    placeholder="Email"
                                    required
                                    value={formData.email}
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
                                    {loading ? "Sending OTP..." : "Create Account"}
                                </button>
                            </form>
                        </>
                    )}

                    {step === "otp" && (
                        <>
                            <input
                                type="text"
                                placeholder="Enter OTP"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                className="w-full px-4 py-2 border rounded-md text-center tracking-widest"
                            />

                            <button
                                onClick={handleVerifyOTP}
                                disabled={loading}
                                className="w-full bg-[#00a884] text-white py-2 rounded-md"
                            >
                                {loading ? "Verifying..." : "Verify OTP"}
                            </button>
                        </>
                    )}

                    <p className="text-sm text-center text-gray-600">
                        Already have an account?
                        <Link to="/login" className="ml-1 text-[#00a884]">
                            Log in
                        </Link>
                    </p>

                </div>
            </div>
        </div>
    );
};

export default Register;