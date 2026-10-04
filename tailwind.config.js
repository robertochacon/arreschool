/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta de marca CONSTRUIDA SOBRE EL LOGO. Los componentes solo usan
        // los nombres brand-*/accent-*, nunca hex sueltos, así que estas dos
        // escalas re-tematizan toda la app. Anclas exactas del logo:
        //   400 = cielo de «School» · 600 = azul del birrete · 900 = tinta.
        // 500 queda entre ambos para texto/íconos que deben leerse sobre blanco
        // (el cielo puro no llega a 4.5:1 como texto).
        brand: {
          50: '#eef7fe',
          100: '#d6ecfc',
          200: '#addaf8',
          300: '#74bff2',
          400: '#1e9be8', // cielo del logo
          500: '#1474d0',
          600: '#0b4aa8', // azul del birrete: botones, enlaces, theme-color
          700: '#093d8c',
          800: '#0b3373',
          900: '#0e2a5c', // tinta (texto de la landing)
          950: '#091c40',
        },
        // Naranja del logo (el niño de la derecha y la borla): avisos,
        // destacados y el plan recomendado. Sobre accent-400 el texto va
        // OSCURO (brand-950/arre-ink): el blanco no llega a 3:1.
        accent: {
          50: '#fff6eb',
          100: '#fee9cc',
          200: '#fdd199',
          300: '#fbb55c',
          400: '#f7931e', // naranja del logo
          500: '#e57c0a',
          600: '#c46a00',
          700: '#9e5400',
          800: '#7d4306',
          900: '#66380a',
          950: '#3a1e02',
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
          // Versiones profundas para RELLENOS CON TEXTO blanco encima (estados,
          // niveles de evaluación): las del logo no llegan a 4.5:1.
          'leaf-deep': '#2E8A35',
          'orange-deep': '#C46A00',
          paper: '#F4FAFF', // fondo: blanco con un punto de cielo
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
        card: '0 1px 2px 0 rgb(14 42 92 / 0.04), 0 4px 16px -2px rgb(14 42 92 / 0.08)',
        'card-hover': '0 2px 4px 0 rgb(14 42 92 / 0.06), 0 12px 28px -6px rgb(14 42 92 / 0.14)',
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
