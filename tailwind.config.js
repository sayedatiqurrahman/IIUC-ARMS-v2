/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0a0f1e',
          bg2: '#111827',
          bg3: '#1a2236',
          border: '#2a3a5c',
          text: '#e8edf5',
          text2: '#94a3b8',
        },
        qsis: '#22c55e',
        'qsis-dark': '#16a34a',
        accent: '#10b981',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
};
