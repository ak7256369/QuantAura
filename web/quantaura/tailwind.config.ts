import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-primary)",
        foreground: "var(--text-primary)",
        primary: {
          // Follows the CSS-var design tokens (with alpha support) so
          // Tailwind-styled surfaces respond to light/dark like the dashboard
          DEFAULT: "rgb(var(--accent-primary-rgb, 99 102 241) / <alpha-value>)",
          hover: "#818cf8",
          glow: "rgb(var(--accent-primary-rgb, 99 102 241) / 0.5)",
        },
        secondary: {
          DEFAULT: "#8b5cf6",
          hover: "#a78bfa",
          glow: "rgba(139, 92, 246, 0.5)",
        },
        success: {
          DEFAULT: "#10b981",
          hover: "#059669",
        },
        glass: {
          bg: "rgba(255, 255, 255, 0.05)",
          border: "rgba(255, 255, 255, 0.1)",
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        heading: ["var(--font-syne)", "Syne", "sans-serif"],
      },
      animation: {
        'gradient-x': 'gradient-x 15s ease infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 8s linear infinite',
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': { 'background-size': '200% 200%', 'background-position': 'left center' },
          '50%': { 'background-size': '200% 200%', 'background-position': 'right center' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'shimmer': {
          '100%': { transform: 'translateX(100%)' },
        }
      },
      backgroundImage: {
        'radial-purple': 'radial-gradient(circle at center, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
        'radial-cyan': 'radial-gradient(circle at center, rgba(6, 182, 212, 0.15) 0%, transparent 70%)',
      }
    },
  },
  plugins: [],
};
export default config;
