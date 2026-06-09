/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        cairo: ['Cairo', 'sans-serif'],
      },
      colors: {
        bg:      '#0d1117',
        surface: '#161b22',
        surface2:'#1f2937',
        border:  '#30363d',
        accent:  '#f59e0b',
        accent2: '#d97706',
        green:   '#10b981',
        red:     '#ef4444',
        blue:    '#3b82f6',
        purple:  '#8b5cf6',
        muted:   '#8b949e',
      },
    },
  },
  plugins: [],
}
