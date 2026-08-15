import { expect } from '@open-wc/testing';

/**
 * WCAG 2.1 contrast audit, run against the real tokens file.
 *
 * The palette is checked rather than eyeballed, and it is checked here rather
 * than in a one-off script so that changing a colour without re-checking it
 * fails the build. Contrast regressions are invisible to the person making
 * them — that is exactly why they need a test.
 *
 * Thresholds:
 *   4.5  normal text (AA, 1.4.3)
 *   3.0  large text, and interactive boundaries and graphics (AA, 1.4.11)
 */

const TOKENS_URL = '/src/ui/styles/tokens.css';

const channel = (value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => channel(parseInt(hex.slice(at, at + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pulls the `--c-*` hex values out of one block of the stylesheet. */
function palette(block) {
  const tokens = {};
  for (const [, name, value] of block.matchAll(/--(c-[\w-]+):\s*(#[0-9a-f]{6})\b/gi)) {
    tokens[name] = value;
  }
  return tokens;
}

/** [foreground, background, minimum ratio, what it is] */
const CHECKS = [
  ['c-text', 'c-bg', 4.5, 'body text on the page'],
  ['c-text', 'c-surface', 4.5, 'body text on a card'],
  ['c-text', 'c-surface-sunken', 4.5, 'body text on a sunken panel'],
  ['c-text-muted', 'c-bg', 4.5, 'muted text on the page'],
  ['c-text-muted', 'c-surface', 4.5, 'muted text on a card'],
  ['c-text-muted', 'c-surface-sunken', 4.5, 'muted text on a placeholder card'],
  ['c-on-accent', 'c-accent', 4.5, 'primary button label'],
  ['c-accent', 'c-surface', 4.5, 'accent text on a card'],
  ['c-accent', 'c-bg', 3, 'accent border on the page'],
  ['c-focus', 'c-bg', 3, 'focus ring against the page'],
  ['c-focus', 'c-surface', 3, 'focus ring against a card'],
  ['c-warning', 'c-warning-soft', 4.5, 'warning badge'],
  ['c-error', 'c-surface', 4.5, 'filled error badge'],
  ['c-error', 'c-error-soft', 4.5, 'error text on a soft background'],
  ['c-border', 'c-surface', 3, 'control border on a card'],
  ['c-border', 'c-bg', 3, 'control border on the page'],
  ['c-line', 'c-bg', 3, 'kinship lines, which carry the content'],
];

describe('palette contrast', () => {
  let themes;

  before(async () => {
    const css = await (await fetch(TOKENS_URL)).text();

    // The light palette is everything before the dark override; the dark one is
    // the block that follows it.
    const darkAt = css.indexOf('prefers-color-scheme: dark');
    expect(darkAt, 'dark theme block').to.be.above(0);

    const contrastAt = css.indexOf('prefers-contrast: more');

    themes = {
      light: palette(css.slice(0, darkAt)),
      dark: palette(css.slice(darkAt, contrastAt)),
    };
  });

  for (const theme of ['light', 'dark']) {
    describe(theme, () => {
      for (const [fg, bg, required, label] of CHECKS) {
        it(`${label} meets ${required}:1`, () => {
          const tokens = themes[theme];
          expect(tokens[fg], `--${fg} is defined`).to.be.a('string');
          expect(tokens[bg], `--${bg} is defined`).to.be.a('string');

          const ratio = contrast(tokens[fg], tokens[bg]);
          expect(
            ratio,
            `--${fg} on --${bg} is ${ratio.toFixed(2)}:1, needs ${required}:1`,
          ).to.be.at.least(required);
        });
      }
    });
  }

  it('defines every token in both themes', () => {
    const missing = Object.keys(themes.light).filter((name) => !(name in themes.dark));
    expect(missing, 'tokens missing from the dark theme').to.eql([]);
  });
});
