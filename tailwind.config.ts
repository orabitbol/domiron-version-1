import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'game-bg':          '#0D0A07',
        'game-surface':     '#1A1208',
        'game-elevated':    '#241A0E',
        'game-overlay':     '#2E2010',
        // Borders
        'game-border':      '#3D2E1A',
        'game-border-gold': '#8B6914',
        'game-border-active': '#C9901A',
        // Text
        'game-text':        '#F0D080',
        'game-text-secondary': '#A08040',
        'game-text-muted':  '#5A4020',
        'game-text-white':  '#F5EDD5',
        // Accents
        'game-gold':        '#C9901A',
        'game-gold-bright': '#F0C030',
        'game-red':         '#8B1A1A',
        'game-red-bright':  '#CC2222',
        'game-green':       '#2A5A1A',
        'game-green-bright': '#4A8A2A',
        'game-purple':      '#5A2A8A',
        'game-purple-bright': '#8A4ACA',
        'game-blue':        '#1A3A6A',
        // Resource colors
        'res-gold':   '#F0C030',
        'res-iron':   '#8090A0',
        'res-wood':   '#8B5A2A',
        'res-food':   '#7AAA3A',
        'res-mana':   '#3A60C0',
        'res-turns':  '#C03030',
      },
      fontFamily: {
        display:  ['var(--font-cinzel-decorative)', 'serif'],
        heading:  ['var(--font-cinzel)', 'serif'],
        body:     ['var(--font-source-sans)', 'sans-serif'],
      },
      fontSize: {
        'game-xs':   ['0.75rem', { lineHeight: '1rem' }],
        'game-sm':   ['0.875rem', { lineHeight: '1.25rem' }],
        'game-base': ['1rem', { lineHeight: '1.5rem' }],
        'game-lg':   ['1.125rem', { lineHeight: '1.75rem' }],
        'game-xl':   ['1.25rem', { lineHeight: '1.75rem' }],
        'game-2xl':  ['1.5rem', { lineHeight: '2rem' }],
        'game-3xl':  ['1.875rem', { lineHeight: '2.25rem' }],
        'game-4xl':  ['2.25rem', { lineHeight: '2.5rem' }],
      },
      boxShadow: {
        'gold-glow': '0 0 12px rgba(201, 144, 26, 0.4)',
        'red-glow':  '0 0 12px rgba(139, 26, 26, 0.4)',
        'purple-glow': '0 0 12px rgba(90, 42, 138, 0.4)',
      },
      spacing: {
        'sidebar': '240px',
        'header':  '64px',
      },
      maxWidth: {
        'content': '960px',
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-in-right': 'slideInRight 0.25s ease-out',
        'slide-in-left':  'slideInLeft 0.25s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
}

export default config
