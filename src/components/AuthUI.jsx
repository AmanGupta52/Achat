import { useState } from "react";

/** Shared building blocks for the Login / Register screens. */

export const AuthLayout = ({ subtitle, children }) => (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-gradient-to-br from-[#0b141a] via-[#111b21] to-[#202c33]">
        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-white/5">
            <div className="bg-[#00a884] text-white text-center py-6 px-4">
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-white/20 flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                </div>
                <h1 className="text-2xl font-semibold">WhatsApp Clone</h1>
                <p className="text-sm opacity-90 mt-0.5">{subtitle}</p>
            </div>
            <div className="p-6 sm:p-8 space-y-5">{children}</div>
        </div>
    </div>
);

export const Alert = ({ type = "error", children }) => {
    if (!children) return null;
    const styles = {
        error: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/40",
        success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/40",
    };
    return (
        <p role="alert" className={`text-sm text-center border rounded-lg px-3 py-2 ${styles[type]}`}>
            {children}
        </p>
    );
};

const inputClass =
    "w-full px-4 py-2.5 text-sm rounded-lg border outline-none transition-colors " +
    "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 " +
    "text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 " +
    "focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/20";

export const TextInput = (props) => <input {...props} className={`${inputClass} ${props.className || ""}`} />;

export const PasswordInput = (props) => {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <input {...props} type={visible ? "text" : "password"} className={`${inputClass} pr-16`} />
            <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                tabIndex={-1}
            >
                {visible ? "Hide" : "Show"}
            </button>
        </div>
    );
};

export const PrimaryButton = ({ loading, children, ...props }) => (
    <button
        {...props}
        disabled={loading || props.disabled}
        className="w-full bg-[#00a884] hover:bg-[#019374] active:bg-[#018066] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors"
    >
        {children}
    </button>
);

export const LinkButton = ({ children, ...props }) => (
    <button type="button" {...props} className="text-sm text-[#00a884] hover:underline disabled:opacity-50 disabled:no-underline">
        {children}
    </button>
);

export const Divider = ({ label = "OR" }) => (
    <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <span className="text-xs text-gray-400">{label}</span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
);
