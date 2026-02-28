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
        // ── Core backgrounds ──────────────────────────────
        'game-bg':          '#0A0806',
        'game-surface':     '#130E07',
        'game-elevated':    '#1C1409',
        'game-overlay':     '#251A0B',
        'game-panel':       'rgba(19,14,7,0.75)',

        // ── Borders ───────────────────────────────────────
        'game-border':      '#2E2010',
        'game-border-gold': '#7A5C12',
        'game-border-active': '#C9901A',

        // ── Text ─────────────────────────────────────────
        'game-text':        '#E8C96A',
        'game-text-secondary': '#9A7830',
        'game-text-muted':  '#4A3418',
        'game-text-white':  '#F5EDD5',

        // ── Gold palette ──────────────────────────────────
        'game-gold':        '#C9901A',
        'game-gold-bright': '#F0C030',
        'game-gold-dim':    '#8B6914',

        // ── Semantic accents ──────────────────────────────
        'game-red':         '#6B1010',
        'game-red-bright':  '#CC2222',
        'game-red-mid':     '#991515',
        'game-green':       '#1A4A10',
        'game-green-bright':'#3A7A20',
        'game-purple':      '#3A1A6A',
        'game-purple-bright':'#7A3ABA',
        'game-blue':        '#0E2850',
        'game-blue-bright': '#1E4A90',
        'game-orange':      '#7A3A0A',
        'game-orange-bright':'#C05A15',

        // ── Resources ─────────────────────────────────────
        'res-gold':   '#F0C030',
        'res-iron':   '#7A8A9A',
        'res-wood':   '#8B5A2A',
        'res-food':   '#6A9A2A',
        'res-mana':   '#2A4AAA',
        'res-turns':  '#AA2020',
      },

      fontFamily: {
        display:  ['var(--font-cinzel-decorative)', 'serif'],
        heading:  ['var(--font-cinzel)', 'serif'],
        body:     ['var(--font-source-sans)', 'sans-serif'],
      },

      fontSize: {
        'game-xs':   ['0.7rem',  { lineHeight: '1rem', letterSpacing: '0.05em' }],
        'game-sm':   ['0.8rem',  { lineHeight: '1.2rem' }],
        'game-base': ['0.95rem', { lineHeight: '1.5rem' }],
        'game-lg':   ['1.1rem',  { lineHeight: '1.6rem' }],
        'game-xl':   ['1.25rem', { lineHeight: '1.75rem' }],
        'game-2xl':  ['1.5rem',  { lineHeight: '2rem' }],
        'game-3xl':  ['1.875rem',{ lineHeight: '2.25rem' }],
        'game-4xl':  ['2.25rem', { lineHeight: '2.5rem' }],
        'game-5xl':  ['3rem',    { lineHeight: '1.1' }],
        'game-6xl':  ['3.75rem', { lineHeight: '1' }],
      },

      boxShadow: {
        'gold-glow':    '0 0 16px rgba(201,144,26,0.45), 0 0 40px rgba(201,144,26,0.15)',
        'gold-glow-sm': '0 0 8px rgba(201,144,26,0.3)',
        'red-glow':     '0 0 16px rgba(139,26,26,0.45)',
        'purple-glow':  '0 0 16px rgba(90,42,138,0.45)',
        'blue-glow':    '0 0 16px rgba(30,74,144,0.45)',
        'panel':        '0 4px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,144,26,0.12)',
        'inner-gold':   'inset 0 1px 0 rgba(240,192,48,0.1)',
      },

      borderRadius: {
        'game': '0.625rem',
        'game-lg': '0.875rem',
        'game-xl': '1.25rem',
      },

      spacing: {
        'sidebar': '240px',
        'header':  '60px',
      },

      maxWidth: {
        'content': '1400px',
      },

      backdropBlur: {
        'game': '12px',
      },

      animation: {
        'fade-in':       'fadeIn 0.25s ease-out',
        'fade-up':       'fadeUp 0.3s ease-out',
        'slide-in-right':'slideInRight 0.25s ease-out',
        'slide-in-left': 'slideInLeft 0.25s ease-out',
        'slide-up':      'slideUp 0.3s ease-out',
        'pulse-subtle':  'pulseSubtle 2.5s ease-in-out infinite',
        'pulse-gold':    'pulseGold 2s ease-in-out infinite',
        'float':         'float 4s ease-in-out infinite',
        'spin-slow':     'spin 8s linear infinite',
        'shimmer':       'shimmer 2s linear infinite',
        'glow-pulse':    'glowPulse 2s ease-in-out infinite',
      },

      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%':   { transform: 'translateX(110%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        slideInLeft: {
          '0%':   { transform: 'translateX(-110%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',     opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.65' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(201,144,26,0.3)' },
          '50%':      { boxShadow: '0 0 24px rgba(240,192,48,0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glowPulse: {
          '0%, 100%': { filter: 'brightness(1)' },
          '50%':      { filter: 'brightness(1.3)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
