/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0A0A0A', 900: '#0A0A0A', 800: '#111111', 700: '#1A1A1A', 600: '#2A2A2A', 500: '#3A3A3A' },
        silver: { DEFAULT: '#B9BEC5', light: '#EEF0F2', deep: '#6E737B' },
        smoke: '#B8B8B8',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      letterSpacing: { widest2: '0.35em' },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        rise: { '0%': { opacity: '0', transform: 'translateY(24px)' }, '100%': { opacity: '1', transform: 'none' } },
        breathe: { '0%,100%': { opacity: '.55' }, '50%': { opacity: '1' } },
      },
      animation: {
        shimmer: 'shimmer 6s linear infinite',
        rise: 'rise 1s cubic-bezier(.2,.7,.2,1) both',
        breathe: 'breathe 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
