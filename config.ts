// Central configuration for the Manga Reader app
export const SERVER_URL = 'http://192.168.1.2:3000';

// Unified color palette — Kotatsu-inspired modern dark theme
export const COLORS = {
  // Backgrounds (darkest → lightest)
  bg: '#0f0f0f',           // Deepest background (reader screens)
  surface: '#161616',       // Primary surface (screen backgrounds)
  card: '#1c1c1c',          // Card / elevated surface
  cardHover: '#242424',     // Pressed / active card
  border: '#2a2a2a',        // Subtle dividers & borders
  inputBg: '#1e1e1e',       // Text input backgrounds

  // Text
  textPrimary: '#f0f0f0',   // Main text (slightly off-white)
  textSecondary: '#9a9a9a',  // Subtitles
  textTertiary: '#555',      // Disabled / hint text
  textMuted: '#666',         // De-emphasized

  // Accent
  accent: '#4a9eff',         // Primary accent (links, active, progress)
  accentDim: '#2a4a7a',      // Muted accent for tinted backgrounds
  accentSoft: 'rgba(74,158,255,0.12)', // Selection / active highlight
  accentGlow: 'rgba(74,158,255,0.25)', // Glow borders

  // Semantic
  error: '#ff6b6b',
  success: '#6bcb77',
  warning: '#ffa500',
  heart: '#ff5b5b',

  // Gradients
  gradientStart: '#1a1a2e',   // Deep navy-black
  gradientEnd: '#161616',     // Fades into surface

  // Overlays
  barBg: 'rgba(16,16,16,0.94)',  // Glassmorphic bottom bars
  overlay: 'rgba(0,0,0,0.6)',    // Modal backdrops
  overlayHeavy: 'rgba(0,0,0,0.85)', // Card text overlay gradient end
};
