/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    // P6-11: explicit breakpoints so lg is unambiguous
    screens: {
      sm:  '640px',
      md:  '768px',
      lg:  '1024px',
      xl:  '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        deep: '#050D1E',
        dark: '#08111E',
        card: '#0D1E35',
        card2: '#101F38',
        border: '#1A3050',
        'border-dim': '#0F1E30',
        'text-pri': '#E0EEFF',
        'text-sec': '#7A9BB8',
        'text-dim': '#3A6080',
        green: '#10B981',
        red: '#EF4444',
        amber: '#F59E0B',
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'Fira Code', 'monospace'],
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
      },
      // P6-4: locked 6-step type scale — use these instead of text-[Xpx]
      // Apple-grade type scale — legible floor at 11px, comfortable body, clear hierarchy.
      fontSize: {
        'micro':   ['11px', { lineHeight: '1.35', letterSpacing: '0.04em' }],  // tiny labels / badges
        'nano':    ['12px', { lineHeight: '1.4',  letterSpacing: '0.03em' }],  // caps section labels
        'caption': ['13px', { lineHeight: '1.5',  letterSpacing: '0.01em' }],  // supporting text
        'body':    ['15px', { lineHeight: '1.55' }],                            // standard body
        'base':    ['17px', { lineHeight: '1.5' }],                             // prominent body
        'heading': ['21px', { lineHeight: '1.3',  letterSpacing: '-0.01em', fontWeight: '800' }],
      },
      letterSpacing: {
        'tracked-8': '0.08em',
        'tracked-10': '0.10em',
        'tracked-13': '0.13em',
        'tracked-15': '0.15em',
        'tracked-18': '0.18em',
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(135deg, #070F22, #0A1A3A)',
        'card-gradient': 'linear-gradient(135deg, rgba(7, 15, 34, 0.9), rgba(12, 29, 64, 0.9))',
      },
    },
  },
  plugins: [],
}
