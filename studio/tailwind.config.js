/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#F5F5F7',
        surface: '#FFFFFF',
        'surface-2': '#F0F0F5',
        primary: '#5E5CE6',
        'primary-600': '#4F4DD1',
        'primary-light': 'rgba(94, 92, 230, 0.10)',
        'primary-tint': 'rgba(94, 92, 230, 0.18)',
        text: '#1D1D1F',
        'text-2': '#6E6E73',
        'text-3': '#AEAEB2',
        border: 'rgba(0,0,0,0.08)',
        'border-strong': 'rgba(0,0,0,0.14)',
        sidebar: '#111111',
        'sidebar-2': '#181818',
        'sidebar-hover': 'rgba(255,255,255,0.06)',
        'sidebar-active': 'rgba(94,92,230,0.15)',
        success: '#34C759',
        warning: '#FF9F0A',
        danger: '#FF453A',
      },
      borderRadius: {
        card: '16px',
        img: '12px',
        pill: '999px',
        sm: '8px',
      },
      boxShadow: {
        card: '0 2px 20px rgba(0,0,0,0.06)',
        'card-hover': '0 8px 40px rgba(0,0,0,0.12)',
        'card-lifted': '0 16px 60px rgba(0,0,0,0.16)',
        glass: '0 4px 24px rgba(0,0,0,0.08)',
        'inner-border': 'inset 0 0 0 1px rgba(0,0,0,0.06)',
      },
      fontFamily: {
        sans: ['-apple-system','BlinkMacSystemFont','SF Pro Display','SF Pro Text','Inter','system-ui','sans-serif'],
        mono: ['SF Mono','ui-monospace','Menlo','monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

