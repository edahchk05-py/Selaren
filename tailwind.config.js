/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c1916",
        paper: "#f3efe8",
        mist: "#ebe4d9",
        line: "#e0d8ce",
        accent: "#2c4a42",
        gold: "#8a7350",
        surface: "#fffcf7",
        muted: "#6b645c",
        warn: "#8b3a32",
      },
      fontFamily: {
        sans: ["var(--font-serif)", "Georgia", "serif"],
        ui: ["var(--font-ui)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(28, 25, 22, 0.04), 0 8px 24px rgba(28, 25, 22, 0.04)",
        inner: "inset 0 1px 1px rgba(28, 25, 22, 0.03)",
      },
    },
  },
  plugins: [],
};
