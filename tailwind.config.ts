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
        'game-bg':          '#0A0806',
        'game-surface':     '#120E08',
        'game-elevated':    '#1A150D',
        'game-overlay':     '#241C10',
        'game-panel':       'rgba(18,14,8,0.82)',
        'game-parchment':   '#2A2014',

        'game-border':        '#2E2010',
        'game-border-gold':   '#7A5C12',
        'game-border-active': '#C9901A',

        'game-text':          '#E8C96A',
        'game-text-secondary':'#9A7830',
        'game-text-muted':    '#4A3418',
        'game-text-white':    '#F5EDD5',

        'game-gold':        '#C9901A',
        'game-gold-bright': '#F0C030',
        'game-gold-dim':    '#8B6914',

        'game-copper':        '#8B5E3C',
        'game-copper-bright': '#C4855A',

        'game-red':           '#6B1010',
        'game-red-bright':    '#D42B2B',
        'game-red-mid':       '#991515',
        'game-green':         '#1A4A10',
        'game-green-bright':  '#44A028',
        'game-purple':        '#3A1A6A',
        'game-purple-bright': '#8A44CC',
        'game-blue':          '#0E2850',
        'game-blue-bright':   '#2A5EAA',
        'game-orange':        '#7A3A0A',
        'game-orange-bright': '#D06A18',

        'res-gold':   '#F0C030',
        'res-iron':   '#8A9AAE',
        'res-wood':   '#A06830',
        'res-food':   '#70AA30',
        'res-mana':   '#4466CC',
        'res-turns':  '#CC3030',
      },

      fontFamily: {
        display:  ['Cinzel Decorative', 'serif'],
        heading:  ['Cinzel', 'serif'],
        body:     ['Source Sans 3', 'sans-serif'],
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
        'gold-glow':      '0 0 18px rgba(201,144,26,0.5), 0 0 48px rgba(201,144,26,0.15)',
        'gold-glow-sm':   '0 0 8px rgba(201,144,26,0.35)',
        'gold-glow-lg':   '0 0 30px rgba(240,192,48,0.4), 0 0 60px rgba(201,144,26,0.15)',
        'gold-inset':     'inset 0 1px 0 rgba(240,192,48,0.15), inset 0 -1px 0 rgba(0,0,0,0.3)',
        'red-glow':       '0 0 18px rgba(180,30,30,0.5)',
        'purple-glow':    '0 0 18px rgba(120,50,180,0.5)',
        'blue-glow':      '0 0 18px rgba(40,80,160,0.5)',
        'green-glow':     '0 0 18px rgba(50,140,30,0.5)',
        'panel':          '0 4px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(201,144,26,0.1)',
        'panel-ornate':   '0 6px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(201,144,26,0.15), inset 0 1px 0 rgba(240,192,48,0.08), inset 0 -1px 0 rgba(0,0,0,0.4)',
        'inner-gold':     'inset 0 1px 0 rgba(240,192,48,0.12)',
        'emboss':         'inset 0 1px 0 rgba(240,192,48,0.18), inset 0 -1px 2px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)',
        'engrave':        'inset 0 2px 4px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(240,192,48,0.06)',
      },

      borderRadius: {
        'game':    '0.5rem',
        'game-lg': '0.75rem',
        'game-xl': '1rem',
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
        'fade-in':        'fadeIn 0.25s ease-out',
        'fade-up':        'fadeUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.25s ease-out',
        'slide-in-left':  'slideInLeft 0.25s ease-out',
        'slide-up':       'slideUp 0.3s ease-out',
        'pulse-subtle':   'pulseSubtle 2.5s ease-in-out infinite',
        'pulse-gold':     'pulseGold 2s ease-in-out infinite',
        'float':          'float 4s ease-in-out infinite',
        'spin-slow':      'spin 8s linear infinite',
        'shimmer':        'shimmer 2s linear infinite',
        'glow-pulse':     'glowPulse 2s ease-in-out infinite',
        'glow-breathe':   'glowBreathe 3s ease-in-out infinite',
        'bar-fill':       'barFill 0.8s ease-out',
      },

      keyframes: {
        fadeIn:        { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeUp:        { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInRight:  { '0%': { transform: 'translateX(110%)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
        slideInLeft:   { '0%': { transform: 'translateX(-110%)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
        slideUp:       { '0%': { transform: 'translateY(20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        pulseSubtle:   { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.65' } },
        pulseGold:     { '0%, 100%': { boxShadow: '0 0 8px rgba(201,144,26,0.3)' }, '50%': { boxShadow: '0 0 28px rgba(240,192,48,0.65)' } },
        float:         { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        shimmer:       { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        glowPulse:     { '0%, 100%': { filter: 'brightness(1)' }, '50%': { filter: 'brightness(1.3)' } },
        glowBreathe:   { '0%, 100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
        barFill:       { '0%': { width: '0%' }, '100%': { width: 'var(--bar-width)' } },
      },
    },
  },
  plugins: [],
}

export default config
