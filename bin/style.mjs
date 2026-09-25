// Visual condiviso per la TUI Ink: ASCII-art del wordmark + gradiente.
// Dep-free; i colori sono restituiti come hex per <Text color="#..">.

export const BRAND = '#ff4017';
// palette "splash" del banner (coral del brand spinto verso oro/magenta)
export const SPLASH = ['#e63610', '#ff4017', '#ff7a2f', '#ffb84d', '#ff4d8d'];

const hexRgb = (hx) => [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)];
const clamp = (v) => Math.max(0, Math.min(255, v));
const rgbHex = ([r, g, b]) => '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');

// interpola la palette in t∈[0,1] e ritorna un hex
export function lerpHex(stops, t) {
  const pts = stops.map(hexRgb);
  const seg = Math.min(Math.max(t, 0), 1) * (pts.length - 1);
  const k = Math.min(Math.floor(seg), pts.length - 2);
  const f = seg - k, a = pts[k], b = pts[k + 1];
  return rgbHex([0, 1, 2].map((j) => Math.round(a[j] + (b[j] - a[j]) * f)));
}

// ASCII-art del wordmark (figlet: Slant / Small Slant). String.raw preserva i backslash.
export const ART_SLANT = String.raw`
        __                    ____
  _____/ /__ _   _____  _____/ __ \____  _____
 / ___/ / _ \ | / / _ \/ ___/ / / / __ \/ ___/
/ /__/ /  __/ |/ /  __/ /  / /_/ / /_/ (__  )
\___/_/\___/|___/\___/_/   \____/ .___/____/
                               /_/
`.split('\n').slice(1, -1);

export const ART_SMALL = String.raw`
      __                 ____
 ____/ /__ _  _____ ____/ __ \___  ___
/ __/ / -_) |/ / -_) __/ /_/ / _ \(_-<
\__/_/\__/|___/\__/_/  \____/ .__/___/
                           /_/
`.split('\n').slice(1, -1);
