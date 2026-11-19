/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        disaster: {
          dark: '#EDF1ED',
          surface: '#FBFCFA',
          card: '#F4F7F3',
          border: '#D7DFD9',
          critical: '#BB432F',
          medium: '#986018',
          low: '#447757',
          accent: '#315D4D',
        }
      },
      fontFamily: {
        sans: ['Segoe UI', 'Noto Sans', 'Arial', 'sans-serif'],
        mono: ['Consolas', 'SFMono-Regular', 'monospace'],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      }
    },
  },
  plugins: [],
}
