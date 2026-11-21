import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";
import { GOOGLE_CLIENT_ID, IS_NATIVE } from "../config";
import {
  AuthLayout, Alert, TextInput, PasswordInput, PrimaryButton, LinkButton, Divider, SlowHint, useSlowHint,
} from "../components/AuthUI";

const RESEND_SECONDS = 30;

const Register = () => {
  const { currentUser, register, verifyOtp, resendOtp, loginWithGoogle } = useAuth();

  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const slow = useSlowHint(loading);

  // tick the "resend" countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (currentUser) return <Navigate to="/" replace />;

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  // STEP 1 — create account, email an OTP
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await register({ username: form.name, email: form.email, password: form.password, phone: form.phone });
      setStep("otp");
      setCooldown(RESEND_SECONDS);
      setInfo(`We sent a 6-digit code to ${form.email}`);
    });
  };

  // STEP 2 — verify (the session is created inside verifyOtp, then <Navigate> redirects)
  const handleVerify = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await verifyOtp(form.email, otp);
    });
  };

  const handleResend = () =>
    run(async () => {
      await resendOtp(form.email);
      setCooldown(RESEND_SECONDS);
      setInfo("A new code has been sent.");
    });

  const handleGoogle = (response: CredentialResponse) => {
    if (!response.credential) return setError("Google sign-up failed");
    const credential = response.credential;
    run(async () => {
      await loginWithGoogle(credential);
    });
  };

  return (
    <AuthLayout subtitle={step === "form" ? "Create your account" : "Verify your email"}>
      <Alert type="error">{error}</Alert>
      <Alert type="success">{info}</Alert>
      <SlowHint show={slow} />

      {step === "form" && (
        <>
          {GOOGLE_CLIENT_ID && !IS_NATIVE && (
            <>
              <div className="flex justify-center">
                <GoogleLogin onSuccess={handleGoogle} onError={() => setError("Google sign-up failed")} />
              </div>
              <Divider />
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <TextInput
              type="text"
              name="name"
              placeholder="Your name"
              autoComplete="name"
              minLength={2}
              maxLength={50}
              required
              value={form.name}
              onChange={handleChange}
            />
            <TextInput
              type="tel"
              inputMode="tel"
              name="phone"
              placeholder="Phone number (e.g. +919876543210)"
              autoComplete="tel"
              pattern="\+?[0-9\s()\-]{7,18}"
              title="7–15 digits, optionally starting with +"
              required
              value={form.phone}
              onChange={handleChange}
            />
            <TextInput
              type="email"
              name="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={form.email}
              onChange={handleChange}
            />
            <PasswordInput
              name="password"
              placeholder="Password (min 6 characters)"
              autoComplete="new-password"
              minLength={6}
              required
              value={form.password}
              onChange={handleChange}
            />
            <PrimaryButton type="submit" loading={loading}>
              {loading ? "Sending code..." : "Create Account"}
            </PrimaryButton>
          </form>
        </>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerify} className="space-y-4">
          <TextInput
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="••••••"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="text-center tracking-[0.5em] text-lg"
            autoFocus
            required
          />
          <PrimaryButton type="submit" loading={loading || otp.length !== 6}>
            {loading ? "Verifying..." : "Verify & continue"}
          </PrimaryButton>

          <div className="flex items-center justify-between text-sm">
            <LinkButton
              onClick={() => {
                setStep("form");
                setOtp("");
                setError("");
                setInfo("");
              }}
            >
              ← Edit details
            </LinkButton>
            <LinkButton onClick={handleResend} disabled={loading || cooldown > 0}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </LinkButton>
          </div>
        </form>
      )}

      <p className="text-sm text-center text-gray-600 dark:text-gray-400">
        Already have an account?
        <Link to="/login" className="ml-1 text-[#00a884] font-medium hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
};

export default Register;
