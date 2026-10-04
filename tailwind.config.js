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
        // Colores del LOGO de ArreSchool, con nombre propio. Los usa la landing
        // (que habla el idioma visual de la marca); la app sigue con brand/accent.
        arre: {
          ink: '#0E2A5C', // texto: el navy del birrete, oscurecido para leer
          navy: '#0B4AA8', // birrete y «Arre»
          sky: '#1E9BE8', // «School» y la página izquierda del libro
          teal: '#14B3A3', // el niño de la izquierda
          orange: '#F7931E', // el niño de la derecha y la borla
          leaf: '#45B649', // la página derecha del libro
          paper: '#F4FAFF', // fondo: blanco con un punto de cielo
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
        // Solo la landing: Fredoka (títulos, redondeada como el logotipo) y
        // Nunito (texto). La app sigue en Inter, que rinde mejor en tablas densas.
        display: ['Fredoka', 'Nunito', 'system-ui', 'sans-serif'],
        rounded: ['Nunito', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
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
        // Casilleros del hero de la landing: aparecen como etiquetas pegadas.
        'pop-in': {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.94) rotate(-1.5deg)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1) rotate(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        // `backwards`: invisible durante su retraso escalonado, sin dejar la
        // opacidad a 0 si el navegador no anima (motion-safe lo aplica).
        'pop-in': 'pop-in 0.5s cubic-bezier(0.2, 0.8, 0.3, 1.15) backwards',
      },
    },
  },
  plugins: [],
}
