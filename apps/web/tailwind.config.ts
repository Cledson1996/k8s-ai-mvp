import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#05131d",
        tide: "#0d4f52",
        sand: "#f4e8d4",
        ember: "#ef6f45",
        glow: "#e6fff9"
      },
      boxShadow: {
        halo: "0 24px 80px rgba(9, 31, 38, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
