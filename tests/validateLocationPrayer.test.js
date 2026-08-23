import { describe, it, expect } from 'vitest';
import { validateLocation, validatePrayer, validateLanguage, DEFAULT_LANGUAGE } from '../src/main/validate.js';
import { migrate, DEFAULT_CONFIG } from '../src/main/config.js';
import { DEFAULT_PER_PRAYER } from '../src/main/prayer/schedule.js';

describe('validateLocation', () => {
  const valid = { name: 'Jerusalem', latitude: 31.7683, longitude: 35.2137, timezone: 'Asia/Jerusalem' };

  it('accepts a well-formed location', () => {
    expect(validateLocation(valid)).toEqual({ ok: true, value: valid });
  });

  it('treats null as valid — "nowhere chosen yet" is the state every user starts in', () => {
    expect(validateLocation(null)).toEqual({ ok: true, value: null });
  });

  it('rejects out-of-range coordinates', () => {
    expect(validateLocation({ ...valid, latitude: 91 }).ok).toBe(false);
    expect(validateLocation({ ...valid, latitude: -91 }).ok).toBe(false);
    expect(validateLocation({ ...valid, longitude: 181 }).ok).toBe(false);
    expect(validateLocation({ ...valid, longitude: -181 }).ok).toBe(false);
  });

  it('accepts the exact extremes', () => {
    expect(validateLocation({ ...valid, latitude: 90, longitude: 180 }).ok).toBe(true);
    expect(validateLocation({ ...valid, latitude: -90, longitude: -180 }).ok).toBe(true);
  });

  it('rejects an unknown timezone before it can throw on a scheduler tick', () => {
    // Intl throws a RangeError on an unknown zone. Catching it here turns a
    // crash deep in the scheduler into a visible settings error.
    expect(validateLocation({ ...valid, timezone: 'Mars/Olympus' }).ok).toBe(false);
    expect(validateLocation({ ...valid, timezone: '' }).ok).toBe(false);
    expect(validateLocation({ ...valid, timezone: 42 }).ok).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(validateLocation({ ...valid, name: '   ' }).ok).toBe(false);
    expect(validateLocation({ ...valid, name: undefined }).ok).toBe(false);
  });

  it('trims the name and coerces numeric strings', () => {
    const r = validateLocation({ ...valid, name: '  Gaza  ', latitude: '31.5', longitude: '34.4' });
    expect(r.value.name).toBe('Gaza');
    expect(r.value.latitude).toBe(31.5);
  });
});

describe('validatePrayer', () => {
  const valid = {
    method: 'MuslimWorldLeague',
    school: 'standard',
    highLatitudeRule: 'recommended',
    polarCircleResolution: 'AqrabBalad',
    offsets: {},
    perPrayer: DEFAULT_PER_PRAYER
  };

  it('accepts a well-formed config', () => {
    expect(validatePrayer(valid).ok).toBe(true);
  });

  it('falls back to defaults for unknown ids rather than rejecting everything', () => {
    // A config naming a method removed in a later version should cost the
    // user their method choice, not every prayer setting they have.
    const r = validatePrayer({ ...valid, method: 'NoSuchMethod', school: 'nonsense' });
    expect(r.ok).toBe(true);
    expect(r.value.method).toBe(DEFAULT_CONFIG.prayer.method);
    expect(r.value.school).toBe(DEFAULT_CONFIG.prayer.school);
  });

  it('accepts the Palestine preset as a real method', () => {
    expect(validatePrayer({ ...valid, method: 'PalestineLegacy' }).value.method).toBe('PalestineLegacy');
  });

  it('rejects offsets that are not whole minutes, or out of range', () => {
    expect(validatePrayer({ ...valid, offsets: { asr: 1.5 } }).ok).toBe(false);
    expect(validatePrayer({ ...valid, offsets: { asr: 60 } }).ok).toBe(false);
    expect(validatePrayer({ ...valid, offsets: { asr: -60 } }).ok).toBe(false);
  });

  it('accepts offsets at the edge of the range, including negative', () => {
    expect(validatePrayer({ ...valid, offsets: { asr: 59, fajr: -59 } }).ok).toBe(true);
  });

  it('rejects a lead time outside 0..120', () => {
    const perPrayer = { ...DEFAULT_PER_PRAYER, fajr: { enabled: true, remindAt: true, remindBefore: 121 } };
    expect(validatePrayer({ ...valid, perPrayer }).ok).toBe(false);
    const negative = { ...DEFAULT_PER_PRAYER, fajr: { enabled: true, remindAt: true, remindBefore: -1 } };
    expect(validatePrayer({ ...valid, perPrayer: negative }).ok).toBe(false);
  });

  it('normalises perPrayer booleans, defaulting remindAt to true', () => {
    const perPrayer = { ...DEFAULT_PER_PRAYER, isha: { enabled: 'yes', remindBefore: 0 } };
    const r = validatePrayer({ ...valid, perPrayer });
    // 'yes' is not true, so enabled must be false — the main process never
    // trusts the renderer's types.
    expect(r.value.perPrayer.isha.enabled).toBe(false);
    expect(r.value.perPrayer.isha.remindAt).toBe(true);
  });

  it('rejects a missing object outright', () => {
    expect(validatePrayer(null).ok).toBe(false);
    expect(validatePrayer('nope').ok).toBe(false);
  });
});

describe('config migration v1 -> v2', () => {
  it('gives a v1 config the new sections without touching what it had', () => {
    const v1 = {
      version: 1,
      schedule: { mode: 'interval', everyMinutes: 45 },
      quietHours: { enabled: true, from: '22:00', to: '06:00' },
      verseOrder: 'sequential',
      sequencePosition: 1234,
      sound: { enabled: false, volume: 0.2 },
      notification: { durationMs: 20000, position: 'bottom-right' },
      startWithWindows: false,
      autostartInitialised: true,
      lastFiredAt: null
    };
    const migrated = migrate(v1);

    expect(migrated.version).toBe(2);
    // Nothing the user had configured is disturbed.
    expect(migrated.schedule).toEqual(v1.schedule);
    expect(migrated.quietHours).toEqual(v1.quietHours);
    expect(migrated.verseOrder).toBe('sequential');
    expect(migrated.sequencePosition).toBe(1234);
    expect(migrated.sound).toEqual(v1.sound);
    expect(migrated.startWithWindows).toBe(false);

    // The new sections arrive at their defaults. location stays null: a
    // v1 user is prompted for one on next launch rather than being silently
    // assigned somewhere they do not live.
    expect(migrated.location).toBeNull();
    expect(migrated.prayer).toEqual(DEFAULT_CONFIG.prayer);
  });

  it('drops a corrupt location rather than letting it reach the calculator', () => {
    // Latitude 500 would make every prayer time garbage. Falling back to
    // null degrades to "no prayer times", which is visible and fixable —
    // deliberately NOT to the Jerusalem default, because silently relocating
    // someone to another country is worse than showing them nothing.
    const migrated = migrate({ location: { name: 'X', latitude: 500, longitude: 0, timezone: 'UTC' } });
    expect(migrated.location).toBeNull();
  });

  it('keeps a valid location through migration', () => {
    const location = { name: 'Gaza', latitude: 31.5, longitude: 34.47, timezone: 'Asia/Gaza' };
    expect(migrate({ location }).location).toEqual(location);
  });

  it('repairs a corrupt prayer section instead of failing the whole config', () => {
    const migrated = migrate({ prayer: { method: 'Nonsense', offsets: { asr: 'x' } } });
    expect(migrated.prayer).toEqual(DEFAULT_CONFIG.prayer);
  });
});

describe('DEFAULT_CONFIG — first-run location', () => {
  it('starts with no location, so "not chosen" stays a real state', () => {
    // A hardcoded default city was tried and reverted: it gives every user
    // elsewhere confidently wrong prayer times. The app asks instead — see
    // the first-run block in index.js.
    expect(DEFAULT_CONFIG.location).toBeNull();
  });

  it('has not yet shown the prompt', () => {
    // Separate from location being null, so someone who dismissed the
    // prompt is not nagged on every launch.
    expect(DEFAULT_CONFIG.onboarded).toBe(false);
  });

  it('enables the location-dependent features by default', () => {
    // Safe precisely BECAUSE the app asks for a location: the user will
    // have set one before any of these matter, and every provider is still
    // location-gated if they dismiss the prompt.
    expect(DEFAULT_CONFIG.azkar.morning.enabled).toBe(true);
    expect(DEFAULT_CONFIG.azkar.evening.enabled).toBe(true);
    expect(DEFAULT_CONFIG.fasting.whiteDays).toBe(true);
    for (const prayer of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
      expect(DEFAULT_CONFIG.prayer.perPrayer[prayer].enabled, prayer).toBe(true);
    }
    // Sunrise stays off — it is not a prayer.
    expect(DEFAULT_CONFIG.prayer.perPrayer.sunrise.enabled).toBe(false);
  });

  it('accepts null as a valid location, so the default survives its own validator', () => {
    expect(validateLocation(DEFAULT_CONFIG.location).ok).toBe(true);
  });
});

describe('Settings language', () => {
  it('defaults to Arabic', () => {
    // The app's content is Arabic throughout — Quran text, prayer names,
    // adhkar — so an English chrome around it was the odd one out.
    expect(DEFAULT_CONFIG.language).toBe('ar');
    expect(DEFAULT_LANGUAGE).toBe('ar');
  });

  it('accepts both supported languages', () => {
    expect(validateLanguage('ar').value).toBe('ar');
    expect(validateLanguage('en').value).toBe('en');
  });

  it('falls back to the DEFAULT rather than to English', () => {
    // Falling back to 'en' while the default is 'ar' would silently switch
    // anyone whose stored value got corrupted.
    for (const bad of ['fr', '', null, undefined, 42, {}]) {
      expect(validateLanguage(bad).value).toBe(DEFAULT_LANGUAGE);
    }
  });

  it('repairs a corrupt language through migration', () => {
    expect(migrate({ language: 'klingon' }).language).toBe('ar');
    expect(migrate({ language: 'en' }).language).toBe('en');
  });
});
