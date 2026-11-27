/** @type {import('tailwindcss').Config} */

// Semantic colours are CSS variables (see src/index.css), so one class such as `bg-panel`
// is correct in BOTH light and dark mode. The <alpha-value> placeholder keeps `bg-brand/20` working.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        app: token("app"), // page background
        panel: token("panel"), // cards, sidebars, dialogs
        "panel-2": token("panel-2"), // headers, search wells, inputs
        wash: token("wash"), // hover / selected rows
        line: token("line"), // borders and dividers
        bar: token("bar"), // top app bar
        ink: { DEFAULT: token("ink"), 2: token("ink-2"), 3: token("ink-3") },
        brand: {
          DEFAULT: token("brand"), // filled buttons (white text on it passes AA)
          hover: token("brand-hover"),
          text: token("brand-text"), // brand-coloured text / links
          soft: token("brand-soft"), // tinted backgrounds
        },
        "bubble-in": token("bubble-in"),
        "bubble-out": token("bubble-out"),
        "chat-bg": token("chat-bg"),
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", '"Segoe UI"', "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
