import { expect } from '@open-wc/testing';
import { parseDate, DateKind, Precision } from '../src/domain/date/parse.js';
import { isBefore, yearsBetween, Comparison } from '../src/domain/date/compare.js';
import { formatDate, formatYear, formatLifespan } from '../src/domain/date/format.js';
import { DateMode, buildRaw, describeDate } from '../src/domain/date/build.js';

describe('parseDate', () => {
  it('keeps raw as the source of truth', () => {
    expect(parseDate('ABT 1885').raw).to.equal('ABT 1885');
    expect(parseDate('  1912  ').raw).to.equal('1912');
  });

  it('parses an exact date', () => {
    const d = parseDate('12 MAY 1912');
    expect(d.kind).to.equal(DateKind.EXACT);
    expect(d.precision).to.equal(Precision.DAY);
    expect(d.earliest).to.equal('1912-05-12');
    expect(d.latest).to.equal('1912-05-12');
  });

  it('expands a month to the whole month', () => {
    const d = parseDate('MAY 1912');
    expect(d.kind).to.equal(DateKind.PARTIAL);
    expect(d.earliest).to.equal('1912-05-01');
    expect(d.latest).to.equal('1912-05-31');
  });

  it('expands a year to the whole year', () => {
    const d = parseDate('1912');
    expect(d.earliest).to.equal('1912-01-01');
    expect(d.latest).to.equal('1912-12-31');
  });

  it('widens ABT by the configured margin', () => {
    const d = parseDate('ABT 1885');
    expect(d.kind).to.equal(DateKind.ABOUT);
    expect(d.earliest).to.equal('1880-01-01');
    expect(d.latest).to.equal('1890-12-31');
  });

  it('leaves BEF open on the early side', () => {
    const d = parseDate('BEF 1900');
    expect(d.kind).to.equal(DateKind.BEFORE);
    expect(d.earliest).to.equal(null);
    expect(d.latest).to.equal('1899-12-31');
  });

  it('leaves AFT open on the late side', () => {
    const d = parseDate('AFT 1900');
    expect(d.earliest).to.equal('1901-01-01');
    expect(d.latest).to.equal(null);
  });

  it('parses BET ... AND ...', () => {
    const d = parseDate('BET 1900 AND 1905');
    expect(d.kind).to.equal(DateKind.BETWEEN);
    expect(d.earliest).to.equal('1900-01-01');
    expect(d.latest).to.equal('1905-12-31');
  });

  it('treats empty input as unknown', () => {
    const d = parseDate('');
    expect(d.kind).to.equal(DateKind.UNKNOWN);
    expect(d.earliest).to.equal(null);
    expect(d.latest).to.equal(null);
  });

  it('never discards an unparseable value', () => {
    const d = parseDate('sometime during the war');
    expect(d.kind).to.equal(DateKind.UNKNOWN);
    expect(d.raw).to.equal('sometime during the war');
  });

  it('rejects impossible calendar days', () => {
    expect(parseDate('31 FEB 1900').kind).to.equal(DateKind.UNKNOWN);
  });
});

describe('isBefore', () => {
  it('is CERTAIN when the intervals do not overlap', () => {
    expect(isBefore(parseDate('1900'), parseDate('1950'))).to.equal(Comparison.CERTAIN);
  });

  it('is IMPOSSIBLE when the order is reversed beyond doubt', () => {
    expect(isBefore(parseDate('1950'), parseDate('1900'))).to.equal(Comparison.IMPOSSIBLE);
  });

  // This is the case the whole severity policy rests on: an overlap can NEVER
  // produce an ERROR.
  it('is POSSIBLE when fuzzy intervals overlap', () => {
    expect(isBefore(parseDate('ABT 1900'), parseDate('1898'))).to.equal(Comparison.POSSIBLE);
  });

  it('is POSSIBLE when information is missing', () => {
    expect(isBefore(parseDate('1900'), parseDate(''))).to.equal(Comparison.POSSIBLE);
  });

  it('handles an open bound on either side', () => {
    expect(isBefore(parseDate('BEF 1900'), parseDate('1950'))).to.equal(Comparison.CERTAIN);
    expect(isBefore(parseDate('AFT 1960'), parseDate('1950'))).to.equal(Comparison.IMPOSSIBLE);
  });
});

describe('yearsBetween', () => {
  it('returns the range compatible with both intervals', () => {
    const { min, max } = yearsBetween(parseDate('1900'), parseDate('1925'));
    expect(min).to.equal(24);
    expect(max).to.equal(25);
  });

  it('returns nulls when a bound is open', () => {
    expect(yearsBetween(parseDate('BEF 1900'), parseDate('1925')).max).to.equal(null);
  });
});

describe('format', () => {
  // The numeric order follows the reader's locale rather than a convention
  // chosen by the app: dd/mm in Spain, mm/dd in the United States.
  it('formats an exact date in the reader locale', () => {
    expect(formatDate(parseDate('12 MAY 1912'), 'es-ES')).to.equal('12/05/1912');
    expect(formatDate(parseDate('12 MAY 1912'), 'en-US')).to.equal('05/12/1912');
    expect(formatDate(parseDate('12 MAY 1912'), 'en-GB')).to.equal('12/05/1912');
  });

  it('drops the day when the date only has month precision', () => {
    expect(formatDate(parseDate('MAY 1912'), 'es-ES')).to.equal('05/1912');
  });

  it('renders a year on its own without separators', () => {
    expect(formatDate(parseDate('1912'), 'es-ES')).to.equal('1912');
  });

  it('renders ranges', () => {
    expect(formatDate(parseDate('BET 1900 AND 1905'))).to.equal('between 1900 and 1905');
  });

  // What the user typed is shown, not the derived interval: "ABT 1885" reads
  // as "about 1885", never "about 1880".
  it('shows the written value, not the widened interval', () => {
    expect(formatDate(parseDate('ABT 1885'))).to.equal('about 1885');
    expect(formatDate(parseDate('EST 1885'))).to.equal('estimated 1885');
    expect(formatDate(parseDate('BEF 1900'))).to.equal('before 1900');
    expect(formatDate(parseDate('AFT 1900'))).to.equal('after 1900');
  });

  it('marks uncertain years with a tilde in the short form', () => {
    expect(formatYear(parseDate('1912'))).to.equal('1912');
    expect(formatYear(parseDate('ABT 1885'))).to.equal('~1885');
  });

  it('never renders a missing date as text', () => {
    for (const value of [null, undefined, parseDate('')]) {
      expect(formatDate(value)).to.equal('');
      expect(formatYear(value)).to.equal('');
    }
    expect(formatLifespan(null, null)).to.equal('');
  });

  it('keeps an open-ended lifespan readable', () => {
    const born = { date: parseDate('1885') };
    const died = { date: parseDate('1950') };
    expect(formatLifespan(born, died)).to.equal('1885 – 1950');
    expect(formatLifespan(born, null)).to.equal('1885 –');
    expect(formatLifespan(null, died)).to.equal('– 1950');
  });
});

/**
 * The editor builds a GEDCOM string out of whatever control the user picked,
 * and reads it back to reopen on the same control. Round-tripping is the whole
 * point, so it is tested both ways.
 */
describe('date builder', () => {
  it('builds GEDCOM from each editor mode', () => {
    expect(buildRaw(DateMode.EXACT, { date: '1912-05-12' })).to.equal('12 MAY 1912');
    expect(buildRaw(DateMode.MONTH, { month: '1912-05' })).to.equal('MAY 1912');
    expect(buildRaw(DateMode.YEAR, { year: '1912' })).to.equal('1912');
    expect(buildRaw(DateMode.ABOUT, { year: '1885' })).to.equal('ABT 1885');
    expect(buildRaw(DateMode.ESTIMATED, { year: '1885' })).to.equal('EST 1885');
    expect(buildRaw(DateMode.BEFORE, { year: '1900' })).to.equal('BEF 1900');
    expect(buildRaw(DateMode.AFTER, { year: '1900' })).to.equal('AFT 1900');
    expect(buildRaw(DateMode.BETWEEN, { from: '1900', to: '1905' })).to.equal('BET 1900 AND 1905');
    expect(buildRaw(DateMode.RAW, { text: '  ABT 1885 ' })).to.equal('ABT 1885');
  });

  it('yields an empty string when a control is left blank', () => {
    expect(buildRaw(DateMode.UNKNOWN, {})).to.equal('');
    expect(buildRaw(DateMode.EXACT, { date: '' })).to.equal('');
    expect(buildRaw(DateMode.YEAR, { year: '' })).to.equal('');
    expect(buildRaw(DateMode.BETWEEN, { from: '1900', to: '' })).to.equal('');
  });

  it('reopens each date on the control it was written with', () => {
    const cases = [
      ['12 MAY 1912', DateMode.EXACT, { date: '1912-05-12' }],
      ['MAY 1912', DateMode.MONTH, { month: '1912-05' }],
      ['1912', DateMode.YEAR, { year: 1912 }],
      ['ABT 1885', DateMode.ABOUT, { year: 1885 }],
      ['BEF 1900', DateMode.BEFORE, { year: 1900 }],
      ['BET 1900 AND 1905', DateMode.BETWEEN, { from: 1900, to: 1905 }],
      ['', DateMode.UNKNOWN, {}],
    ];

    for (const [raw, mode, values] of cases) {
      const described = describeDate(parseDate(raw));
      expect(described.mode, raw).to.equal(mode);
      expect(described.values, raw).to.eql(values);
    }
  });

  it('round-trips every mode back to the same GEDCOM string', () => {
    for (const raw of ['12 MAY 1912', 'MAY 1912', '1912', 'ABT 1885', 'BET 1900 AND 1905']) {
      const { mode, values } = describeDate(parseDate(raw));
      expect(buildRaw(mode, values), raw).to.equal(raw);
    }
  });

  // A day-precision qualified date has no dedicated control, so it stays as
  // raw text rather than losing its day.
  it('falls back to raw text for values no control can express', () => {
    const described = describeDate(parseDate('ABT 12 MAY 1885'));
    expect(described.mode).to.equal(DateMode.RAW);
    expect(buildRaw(described.mode, described.values)).to.equal('ABT 12 MAY 1885');
  });
});
