import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['var(--font-book)', 'Georgia', 'serif'],
        display: ['var(--font-display)', 'var(--font-book)', 'serif'],
      },
      colors: {
        gold: "#ffd700",
      },
    },
  },
  plugins: [],
};
export default config;
