import type { Config } from "tailwindcss";
const config: Config = { darkMode: ["class"], content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"], theme: { extend: { colors: { ink: "#101827", teal: "#38d6c1", violet: "#9285ff" }, fontFamily: { sans: ["var(--font-arabic)", "var(--font-latin)", "sans-serif"] }, boxShadow: { glass: "0 20px 60px rgba(15,23,42,.10)" } } }, plugins: [] };
export default config;
