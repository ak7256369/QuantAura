/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // QuantAura Design Tokens
        'bg-primary':    '#0a0b10',
        'bg-secondary':  '#0e1016',
        'bg-card':       'rgba(255,255,255,0.04)',
        'bg-card-solid': '#12141c',
        'accent':        '#818cf8',
        'accent-purple': '#8b5cf6',
        'accent-pink':   '#f472b6',
        'signal-buy':    '#34d399',
        'signal-sell':   '#f87171',
        'signal-hold':   '#fbbf24',
        'text-primary':  '#f4f6fb',
        'text-secondary':'#9aa4b8',
        'text-muted':    '#8b95ac',
        'text-accent':   '#a5b4fc',
        'border-subtle': 'rgba(255,255,255,0.06)',
        'border-card':   'rgba(255,255,255,0.08)',
        'border-glow':   'rgba(129,140,248,0.35)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'glow-buy':    'glowBuy 2s ease-in-out infinite alternate',
        'glow-sell':   'glowSell 2s ease-in-out infinite alternate',
        'price-flash': 'priceFlash 0.4s ease-out',
        'slide-up':    'slideUp 0.3s ease-out',
        'spin-slow':   'spin 3s linear infinite',
      },
      keyframes: {
        glowBuy: {
          '0%':   { boxShadow: '0 0 5px rgba(52,211,153,0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(52,211,153,0.7)' },
        },
        glowSell: {
          '0%':   { boxShadow: '0 0 5px rgba(248,113,113,0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(248,113,113,0.7)' },
        },
        priceFlash: {
          '0%':   { opacity: 0.3, transform: 'scale(1.05)' },
          '100%': { opacity: 1,   transform: 'scale(1)' },
        },
        slideUp: {
          '0%':   { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
