/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta de marca del starter: azul neutro, pensado para reemplazarse
        // entero al adoptar la identidad real (los componentes solo usan los
        // nombres brand-*/accent-*, nunca hex sueltos, así que cambiar estas
        // dos escalas re-tematiza toda la app).
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb', // azul principal (botones, enlaces, theme-color)
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Ámbar de apoyo: avisos, destacados y el plan recomendado.
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        // Sombras tintadas con el navy de la marca en vez de negro puro: sobre
        // fondos claros el gris neutro se ve sucio.
        card: '0 1px 2px 0 rgb(23 37 84 / 0.04), 0 4px 16px -2px rgb(23 37 84 / 0.08)',
        'card-hover': '0 2px 4px 0 rgb(23 37 84 / 0.06), 0 12px 28px -6px rgb(23 37 84 / 0.14)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
      },
    },
  },
  plugins: [],
}
