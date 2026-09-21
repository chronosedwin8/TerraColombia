/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Paleta institucional sobria. Los estados del semáforo llevan SIEMPRE texto e icono
        // además del color (WCAG AA: nunca depender solo del color).
        brand: {
          50: '#eef6f3',
          100: '#d4e9e1',
          200: '#a9d3c4',
          300: '#76b8a3',
          400: '#479a82',
          500: '#2d7d67',
          600: '#226352',
          700: '#1c4f42',
          800: '#173f35',
          900: '#12302a',
        },
        semaphore: {
          ok: '#1a7f4b',
          caution: '#8a5a00',
          blocker: '#a4232b',
          unknown: '#4a5568',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f6f7f8',
          sunken: '#eceef0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        sheet: '0 -8px 24px -8px rgb(0 0 0 / 0.18)',
        panel: '0 2px 12px -4px rgb(0 0 0 / 0.16)',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
      },
      zIndex: {
        map: '0',
        overlay: '20',
        sheet: '30',
        modal: '40',
        toast: '50',
      },
    },
  },
  plugins: [],
};
