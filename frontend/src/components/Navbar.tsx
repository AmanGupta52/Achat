import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { APP_NAME } from "../config";
import { resizeToAvatar } from "../utils/image";
import { applyTheme, getInitialDark } from "../utils/theme";
import Avatar from "./Avatar";
import BlockedUsersModal from "./BlockedUsersModal";

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm max-h-full overflow-y-auto bg-panel rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full text-ink-3 hover:bg-wash">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const MenuItem = ({ children, onClick, danger = false }: { children: ReactNode; onClick: () => void; danger?: boolean }) => (
  <button
    role="menuitem"
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 text-[15px] text-left transition-colors
      ${danger
        ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
        : "text-ink hover:bg-wash"}`}
  >
    {children}
  </button>
);

const icon = (d: string) => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

const fieldClass =
  "w-full px-3 py-2 text-sm rounded-lg border bg-panel-2 border-line " +
  "text-ink placeholder-ink-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

type Panel = "profile" | "settings" | "blocked" | null;

const Navbar = () => {
  const { currentUser, logout, updateProfile, uploadAvatar, removeAvatar } = useAuth();

  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [darkMode, setDarkMode] = useState(getInitialDark);

  // profile form
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [profileError, setProfileError] = useState("");

  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Dark mode ──
  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    applyTheme(next);
  };

  // ── Close the menu on outside click ──
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openProfile = () => {
    setUsername(currentUser?.username || "");
    setPhone(currentUser?.phone || "");
    setAbout(currentUser?.about || "");
    setProfileError("");
    setPanel("profile");
    setOpen(false);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setProfileError("");
    try {
      await updateProfile({ username, phone, about });
      setPanel(null);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setProfileError("");
    try {
      await uploadAvatar(await resizeToAvatar(file));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not update your picture");
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = ""; // allow choosing the same file again
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoBusy(true);
    setProfileError("");
    try {
      await removeAvatar();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not remove your picture");
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <>
      <header className="flex-shrink-0 bg-bar text-white pt-safe shadow-md dark:border-b dark:border-line">
        <div className="h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <span className="font-bold text-xl tracking-tight">{APP_NAME}</span>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Open menu"
            aria-haspopup="menu"
            aria-expanded={open}
            className="rounded-full ring-2 ring-white/40 hover:ring-white/70 transition"
          >
            <Avatar user={currentUser} size="md" />
          </button>

          {open && (
            <div role="menu" className="absolute right-0 top-12 w-64 z-40 bg-panel text-ink rounded-xl shadow-xl border border-line overflow-hidden">
              <div className="px-4 py-3 border-b border-line">
                <div className="font-semibold truncate">{currentUser?.username}</div>
                <div className="text-xs text-ink-3 truncate">{currentUser?.email || currentUser?.phone}</div>
              </div>
              <div className="py-1">
                <MenuItem onClick={openProfile}>
                  {icon("M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z")}
                  Profile
                </MenuItem>
                <MenuItem onClick={() => { setPanel("blocked"); setOpen(false); }}>
                  {icon("M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636")}
                  Blocked users
                </MenuItem>
                <MenuItem onClick={() => { setPanel("settings"); setOpen(false); }}>
                  {icon("M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z")}
                  Settings
                </MenuItem>
                <MenuItem danger onClick={() => { setOpen(false); logout(); }}>
                  {icon("M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1")}
                  Logout
                </MenuItem>
              </div>
            </div>
          )}
        </div>
        </div>
      </header>

      {panel === "settings" && (
        <Modal title="Settings" onClose={() => setPanel(null)}>
          <div className="p-5">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[15px] font-medium text-ink">Dark mode</span>
              <button
                role="switch"
                aria-checked={darkMode}
                aria-label="Dark mode"
                onClick={toggleDark}
                className={`relative w-12 h-7 rounded-full transition-colors ${darkMode ? "bg-brand" : "bg-ink-3/50"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${darkMode ? "translate-x-5" : ""}`} />
              </button>
            </label>
          </div>
        </Modal>
      )}

      {panel === "blocked" && <BlockedUsersModal onClose={() => setPanel(null)} />}

      {panel === "profile" && (
        <Modal title="Profile" onClose={() => setPanel(null)}>
          <div className="p-5 space-y-4">
            {/* profile picture */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                aria-label="Change profile picture"
                className="relative rounded-full group"
              >
                <Avatar user={currentUser} size="xl" />
                <span className="absolute inset-0 rounded-full bg-black/40 text-white text-xs font-medium flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                  {photoBusy ? "Saving…" : "Change photo"}
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                aria-label="Choose profile picture"
                onChange={(e) => handlePhoto(e.target.files?.[0])}
              />
              <div className="flex gap-3 text-xs">
                <button onClick={() => fileRef.current?.click()} disabled={photoBusy} className="text-brand-text hover:underline disabled:opacity-50">
                  {currentUser?.avatarVersion ? "Change photo" : "Add photo"}
                </button>
                {!!currentUser?.avatarVersion && (
                  <button onClick={handleRemovePhoto} disabled={photoBusy} className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-3 mb-1">Name</label>
              <input className={fieldClass} value={username} maxLength={50} placeholder="Enter username" onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-3 mb-1">About</label>
              <input className={fieldClass} value={about} maxLength={140} placeholder="Say something about yourself" onChange={(e) => setAbout(e.target.value)} />
              <div className="text-right text-xs text-ink-3 mt-0.5">{about.length}/140</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-3 mb-1">Phone</label>
              <input className={fieldClass} type="tel" inputMode="tel" value={phone} placeholder="Phone number (optional)" onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-3 mb-1">Email</label>
              <input className={`${fieldClass} opacity-60 cursor-not-allowed`} value={currentUser?.email || ""} disabled readOnly />
            </div>

            {profileError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg px-3 py-2">
                {profileError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setPanel(null)} className="flex-1 py-2 rounded-full text-sm font-medium text-ink-2 bg-wash hover:bg-wash">
                Cancel
              </button>
              <button onClick={handleSaveProfile} disabled={saving || photoBusy} className="flex-1 py-2 rounded-full text-sm font-medium bg-brand hover:bg-brand-hover text-white disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default Navbar;
