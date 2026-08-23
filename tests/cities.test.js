import { describe, it, expect } from 'vitest';
import { searchCities, normalise, manualLocation } from '../src/main/location/cities.js';

// Rows are [name, ascii, country, admin1, lat, lon, timezone, population],
// pre-sorted by population descending — the order tools/make-cities.mjs
// produces, which the search relies on for ranking.
const rows = [
  ['London', '', 'GB', 'ENG', 51.5085, -0.1257, 'Europe/London', 8961989],
  ['New York City', '', 'US', 'NY', 40.7143, -74.006, 'America/New_York', 8804190],
  ['Jerusalem', '', 'IL', '06', 31.769, 35.2163, 'Asia/Jerusalem', 971800],
  ['Zürich', 'Zurich', 'CH', 'ZH', 47.3667, 8.55, 'Europe/Zurich', 341730],
  ['Nābulus', 'Nabulus', 'PS', 'WE', 32.2211, 35.2544, 'Asia/Hebron', 130326],
  ['New Haven', '', 'US', 'CT', 41.3082, -72.9282, 'America/New_York', 130250],
  ['Longview', '', 'US', 'TX', 32.5007, -94.7405, 'America/Chicago', 81638],
  ['Yorketown', '', 'AU', 'SA', -35.0167, 137.6, 'Australia/Adelaide', 20000]
];

const countries = { GB: 'United Kingdom', US: 'United States', IL: 'Israel', CH: 'Switzerland', PS: 'Palestine', AU: 'Australia' };

describe('normalise', () => {
  it('strips diacritics and folds case', () => {
    expect(normalise('Zürich')).toBe('zurich');
    expect(normalise('Nābulus')).toBe('nabulus');
    expect(normalise('  LONDON ')).toBe('london');
  });
});

describe('searchCities — ranking', () => {
  it('ranks prefix matches above substring matches', () => {
    // "long" prefixes Longview but only appears mid-word in... nothing here,
    // so use "york": prefix-matches Yorketown, substring-matches New York City.
    const results = searchCities(rows, 'york', { countries });
    expect(results[0].name).toBe('Yorketown');
    expect(results.map((r) => r.name)).toContain('New York City');
  });

  it('ranks by population within the prefix group', () => {
    // Both London and Longview prefix-match "lo"; London is larger.
    const results = searchCities(rows, 'lo', { countries });
    expect(results[0].name).toBe('London');
    expect(results.map((r) => r.name)).toContain('Longview');
  });

  it('finds a diacritic name typed without diacritics', () => {
    expect(searchCities(rows, 'zurich', { countries })[0].name).toBe('Zürich');
    expect(searchCities(rows, 'nabulus', { countries })[0].name).toBe('Nābulus');
  });

  it('still finds it when typed WITH diacritics', () => {
    expect(searchCities(rows, 'Zürich', { countries })[0].name).toBe('Zürich');
  });
});

describe('searchCities — edges', () => {
  it('returns nothing for a query shorter than two characters', () => {
    // One character matches thousands of cities and is never a real search.
    expect(searchCities(rows, 'l', { countries })).toEqual([]);
    expect(searchCities(rows, '', { countries })).toEqual([]);
    expect(searchCities(rows, '  ', { countries })).toEqual([]);
  });

  it('returns an empty array for no match, rather than throwing', () => {
    expect(searchCities(rows, 'zzzznowhere', { countries })).toEqual([]);
  });

  it('honours the limit', () => {
    expect(searchCities(rows, 'new', { countries, limit: 1 })).toHaveLength(1);
  });
});

describe('searchCities — hydration', () => {
  it('expands a packed row into a usable city', () => {
    const [city] = searchCities(rows, 'jerusalem', { countries });
    expect(city).toEqual({
      name: 'Jerusalem',
      country: 'IL',
      countryName: 'Israel',
      admin1: '06',
      latitude: 31.769,
      longitude: 35.2163,
      timezone: 'Asia/Jerusalem',
      population: 971800,
      label: 'Jerusalem, Israel'
    });
  });

  it('falls back to the country code when no name is known', () => {
    const [city] = searchCities(rows, 'jerusalem', {});
    expect(city.countryName).toBe('IL');
    expect(city.label).toBe('Jerusalem, IL');
  });

  it('always includes the country in the label — city names are not unique', () => {
    for (const city of searchCities(rows, 'new', { countries })) {
      expect(city.label).toContain(',');
    }
  });
});

describe('manualLocation', () => {
  it('accepts valid coordinates', () => {
    expect(manualLocation(31.7683, 35.2137, 'Asia/Jerusalem', 'Home')).toEqual({
      name: 'Home',
      latitude: 31.7683,
      longitude: 35.2137,
      timezone: 'Asia/Jerusalem'
    });
  });

  it('labels itself with the coordinates when no name is given', () => {
    expect(manualLocation(31.7683, 35.2137, 'Asia/Jerusalem').name).toBe('31.7683, 35.2137');
    expect(manualLocation(31.7683, 35.2137, 'Asia/Jerusalem', '   ').name).toBe('31.7683, 35.2137');
  });

  it('rejects out-of-range coordinates', () => {
    expect(manualLocation(91, 0, 'UTC')).toBeNull();
    expect(manualLocation(-91, 0, 'UTC')).toBeNull();
    expect(manualLocation(0, 181, 'UTC')).toBeNull();
    expect(manualLocation(0, -181, 'UTC')).toBeNull();
  });

  it('rejects non-numeric input and a missing timezone', () => {
    expect(manualLocation('abc', 0, 'UTC')).toBeNull();
    expect(manualLocation(0, 0, '')).toBeNull();
    expect(manualLocation(0, 0, null)).toBeNull();
  });

  it('accepts the extremes of the valid range', () => {
    expect(manualLocation(90, 180, 'UTC')).not.toBeNull();
    expect(manualLocation(-90, -180, 'UTC')).not.toBeNull();
  });
});
