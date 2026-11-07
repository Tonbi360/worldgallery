import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ios: {
          // System background hierarchy
          bg: '#F2F2F7',               // System Background Grouped Secondary
          card: '#FFFFFF',             // Inset Grouped Card Surface (Pure White)
          tertiary: '#E5E5EA',         // System Tertiary Fill
          quaternary: '#F2F2F7',       // System Quaternary Fill

          // Primary accent & interaction
          blue: '#007AFF',             // Apple System Blue
          'blue-pressed': '#0062CC',   // Pressed state

          // Semantic state colors
          green: '#34C759',            // iOS Green (Availability: Open)
          forest: '#2D6A4F',           // Legacy Brand Forest Green
          orange: '#FF9500',           // iOS Orange (Availability: Quiet / Selective)
          gray: '#8E8E93',             // iOS System Gray (Availability: Paused)
          red: '#FF3B30',              // iOS System Red (Destructive actions)

          // Labels & text hierarchy
          label: '#000000',            // Primary Label (Light mode)
          text: '#1C1C1E',             // Primary Ink Text
          secondary: '#3C3C43',        // Secondary Label base
          'secondary-muted': '#8E8E93',// Secondary Muted Label (Gray)
          tertiaryText: '#C7C7CC',     // Tertiary Label

          // Hairlines & separators
          separator: '#C6C6C8',        // Standard 0.5px hairline divider
          'separator-opaque': '#E5E5EA',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          'Inter',
          'system-ui',
          '-apple-system-body',
          'sans-serif',
        ],
      },
      borderWidth: {
        'hairline': '0.5px',
        '0.5': '0.5px',
      },
      borderRadius: {
        'ios-card': '14px',
        'ios-group': '16px',
        'ios-sheet': '20px',
        'ios-pill': '9999px',
      },
      boxShadow: {
        'ios-sheet': '0 -10px 40px -15px rgba(0, 0, 0, 0.15)',
        'ios-nav': '0 0.5px 0 0 rgba(0, 0, 0, 0.15)',
        'ios-tab': '0 -0.5px 0 0 rgba(0, 0, 0, 0.15)',
        'ios-card': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
      },
    },
  },
  plugins: [],
};

export default config;
