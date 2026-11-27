import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { APP_NAME } from "../config";

/** Shared building blocks for the Login / Register screens. */

/**
 * True when something has been "loading" for a while. Free hosting (e.g. Render) puts the
 * server to sleep, and the first request can take up to a minute — tell people instead of
 * letting them think the app is broken.
 */
export const useSlowHint = (active: boolean, delayMs = 4000): boolean => {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active, delayMs]);

  return active && slow;
};

export const AuthLayout = ({ subtitle, children }: { subtitle: string; children: ReactNode }) => (
  <div className="min-h-dvh flex items-center justify-center px-4 py-8 pt-safe pb-safe bg-gradient-to-br from-[#0b141a] via-[#111b21] to-[#1f2c34]">
    <main className="w-full max-w-md bg-panel rounded-2xl shadow-2xl overflow-hidden border border-white/10">
      <header className="bg-brand text-white text-center py-7 px-4">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-white/20 flex items-center justify-center">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
        <p className="text-[15px] text-white/90 mt-1">{subtitle}</p>
      </header>
      <div className="p-6 sm:p-8 space-y-5">{children}</div>
    </main>
  </div>
);

export const Alert = ({ type = "error", children }: { type?: "error" | "success" | "info"; children?: ReactNode }) => {
  if (!children) return null;
  const styles = {
    error: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-900",
    success: "bg-brand-soft text-brand-text border-brand/30",
    info: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900",
  };
  return (
    <p role={type === "error" ? "alert" : "status"} className={`text-sm text-center border rounded-lg px-3 py-2.5 ${styles[type]}`}>
      {children}
    </p>
  );
};

/** Shown under a submit button while a slow (sleeping) server wakes up. */
export const SlowHint = ({ show }: { show: boolean }) =>
  show ? (
    <Alert type="info">
      Waking up the server — free hosting sleeps when idle, so the first request can take up to a minute. Hang tight…
    </Alert>
  ) : null;

const inputClass =
  "w-full px-4 py-3 text-base sm:text-[15px] rounded-xl border outline-none transition-colors " +
  "bg-panel-2 border-line text-ink placeholder-ink-3 " +
  "focus:border-brand focus:bg-panel focus:ring-2 focus:ring-brand/25";

export const TextInput = ({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`${inputClass} ${className}`} />
);

export const PasswordInput = (props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${inputClass} pr-16`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-xs font-semibold text-ink-2 hover:text-ink hover:bg-wash"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
};

export const PrimaryButton = ({
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
  <button
    {...props}
    disabled={loading || props.disabled}
    className="w-full bg-brand hover:bg-brand-hover active:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed text-white text-base font-semibold py-3 rounded-xl shadow-sm transition-colors"
  >
    {children}
  </button>
);

export const LinkButton = ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" {...props} className="text-sm font-medium text-brand-text hover:underline disabled:opacity-50 disabled:no-underline">
    {children}
  </button>
);

export const Divider = ({ label = "OR" }: { label?: string }) => (
  <div className="flex items-center gap-3" role="separator">
    <div className="flex-1 h-px bg-line" />
    <span className="text-xs font-medium text-ink-3">{label}</span>
    <div className="flex-1 h-px bg-line" />
  </div>
);
