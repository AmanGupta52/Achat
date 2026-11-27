/** Light / dark theme: saved choice first, otherwise follow the device setting. */
const KEY = "dark_mode";

export const getInitialDark = (): boolean => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "true" || saved === "false") return saved === "true";
  } catch {
    /* storage blocked → fall back to the device setting */
  }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
};

/** Switch the page (and the browser / Android status-bar colour) to the given theme. */
export const applyTheme = (dark: boolean, remember = true): void => {
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#202c33" : "#008069");
  if (remember) {
    try {
      localStorage.setItem(KEY, String(dark));
    } catch {
      /* ignore */
    }
  }
};
