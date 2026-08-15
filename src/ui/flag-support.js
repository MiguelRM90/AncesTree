/**
 * Does this platform draw flag emoji?
 *
 * A flag is two Regional Indicator letters that the font is supposed to
 * combine into one glyph. Windows never does: Segoe UI Emoji ships without
 * country flags — a deliberate decision by Microsoft — so `🇪🇸` comes out as
 * two boxed letters. It is the font, not the browser, and it affects every
 * application on the machine.
 *
 * Measured rather than sniffed. A real flag is a single glyph, so the pair is
 * narrower than the two letters drawn side by side; if the widths match
 * exactly, nothing was combined. Sniffing the user agent would also be wrong
 * the moment somebody installs a font that does have them — and this way, if
 * they do, the flags simply start appearing.
 */

let cached = null;

export function supportsFlagEmoji() {
  if (cached !== null) return cached;

  try {
    const context = document.createElement('canvas').getContext('2d');
    context.font = '32px system-ui, sans-serif';

    const pair = context.measureText('\u{1F1EA}\u{1F1F8}').width;
    const separately =
      context.measureText('\u{1F1EA}').width + context.measureText('\u{1F1F8}').width;

    // A little slack: a combined glyph is far narrower, never marginally so.
    cached = pair > 0 && pair < separately * 0.9;
  } catch {
    cached = false;
  }

  return cached;
}
