// Prayer calculation presets: method, Asr school, and the two rules that
// keep high latitudes from producing nonsense.
//
// Pure data plus one factory function. `adhan` is imported here and in
// times.js only — no other module in the project may import it, so the
// library stays swappable and everything downstream is testable without it.

import * as adhan from 'adhan';

/**
 * Calculation methods, in the order they appear in Settings.
 *
 * These differ mainly in the solar depression angle used for Fajr and Isha,
 * and they disagree by 20+ minutes on those two prayers. There is no
 * "correct" one — it is a matter of which convention the user's local
 * mosque follows, which is why this is a visible setting rather than a
 * constant.
 */
export const METHODS = Object.freeze([
  { id: 'MuslimWorldLeague', label: 'Muslim World League' },
  { id: 'Egyptian', label: 'Egyptian General Authority' },
  { id: 'Karachi', label: 'University of Islamic Sciences, Karachi' },
  { id: 'UmmAlQura', label: 'Umm Al-Qura, Makkah' },
  { id: 'Dubai', label: 'Dubai' },
  { id: 'Qatar', label: 'Qatar' },
  { id: 'Kuwait', label: 'Kuwait' },
  { id: 'MoonsightingCommittee', label: 'Moonsighting Committee' },
  { id: 'NorthAmerica', label: 'ISNA (North America)' },
  { id: 'Singapore', label: 'Singapore' },
  { id: 'Turkey', label: 'Diyanet (Turkey)' },
  { id: 'Tehran', label: 'Tehran' },
  // Not an adhan method — see PRESETS below.
  { id: 'PalestineLegacy', label: 'Palestine (legacy)' }
]);

export const DEFAULT_METHOD = 'MuslimWorldLeague';

/**
 * Asr school. The two differ by roughly an hour in summer: Standard takes
 * Asr when an object's shadow equals its own length plus its noon shadow,
 * Hanafi when it equals twice its length plus the noon shadow. Not a
 * detail — getting it wrong makes Asr visibly wrong every day.
 */
export const SCHOOLS = Object.freeze([
  { id: 'standard', label: 'Standard (Shafi, Maliki, Hanbali)', madhab: adhan.Madhab.Shafi },
  { id: 'hanafi', label: 'Hanafi', madhab: adhan.Madhab.Hanafi }
]);

export const DEFAULT_SCHOOL = 'standard';

/**
 * How to derive Fajr and Isha when twilight never reaches the required
 * angle — which happens every summer above roughly 48 degrees latitude.
 * 'recommended' asks adhan to pick based on the coordinates, and is the
 * default because the right answer genuinely depends on where you are.
 */
export const HIGH_LATITUDE_RULES = Object.freeze([
  { id: 'recommended', label: 'Recommended for my location', rule: null },
  { id: 'middleofthenight', label: 'Middle of the night', rule: adhan.HighLatitudeRule.MiddleOfTheNight },
  { id: 'seventhofthenight', label: 'One seventh of the night', rule: adhan.HighLatitudeRule.SeventhOfTheNight },
  { id: 'twilightangle', label: 'Twilight angle', rule: adhan.HighLatitudeRule.TwilightAngle }
]);

export const DEFAULT_HIGH_LATITUDE_RULE = 'recommended';

/**
 * Inside the polar circles there are days when the sun does not rise or set
 * at all, so sunrise and Maghrib have no astronomical value — a different
 * and more severe problem than twilight, and one HighLatitudeRule does NOT
 * solve.
 *
 * Measured at Tromso (69.6N) across 365 days:
 *   Unresolved  -> Fajr, Sunrise, Maghrib and Isha are Invalid Date in summer
 *   AqrabBalad  -> 0 invalid days, 3 days with any duplicate times
 *
 * AqrabBalad ("nearest locality") substitutes the nearest latitude at which
 * the times are defined, and is the default for that reason. Leaving this
 * unset is not a viable option: it ships an app that is simply broken for
 * two months a year for anyone in northern Scandinavia, Alaska or northern
 * Canada.
 */
export const POLAR_RESOLUTIONS = Object.freeze([
  { id: 'AqrabBalad', label: 'Nearest location where times exist', value: adhan.PolarCircleResolution.AqrabBalad },
  { id: 'AqrabYaum', label: 'Nearest day when times exist', value: adhan.PolarCircleResolution.AqrabYaum },
  { id: 'Unresolved', label: 'Leave undefined', value: adhan.PolarCircleResolution.Unresolved }
]);

export const DEFAULT_POLAR_RESOLUTION = 'AqrabBalad';

/**
 * Presets are a method plus fixed per-prayer minute adjustments.
 *
 * PalestineLegacy reproduces the retired Railway API this project used
 * before. It is an EMPIRICAL match, not a published convention.
 *
 * The offsets were measured by running THIS library against 363 days of
 * tests/fixtures/prayer-times/railway.json (the two Asia/Jerusalem DST
 * transition days excluded) — mean delta, api minus adhan:
 *
 *   fajr -0.81   sunrise -3.04   dhuhr -1.56
 *   asr  -0.43   maghrib +6.02   isha +4.96
 *
 * Note these are measured against adhan specifically, NOT against aladhan.
 * The two libraries differ by about a minute on Dhuhr and one to two on
 * Asr, so offsets derived from one do not transfer to the other. Deriving
 * them from the library that actually computes the times is the only way
 * the preset reproduces the API.
 *
 * The lengthened day at both ends — sunrise early, maghrib late — is the
 * signature of an elevation/horizon correction that a sea-level
 * calculation does not apply. Jerusalem sits around 750 m.
 *
 * Do not "tidy" these numbers away. They exist so the project's first users
 * see the times they are used to, and they are covered by
 * tests/prayerFixtures.test.js.
 */
export const PRESETS = Object.freeze({
  PalestineLegacy: {
    method: 'MuslimWorldLeague',
    adjustments: { fajr: -1, sunrise: -3, dhuhr: -2, asr: 0, maghrib: 6, isha: 5 }
  }
});

const PRAYER_FIELDS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

function methodParams(methodId) {
  const preset = PRESETS[methodId];
  const effective = preset ? preset.method : methodId;
  const factory = adhan.CalculationMethod[effective];
  if (typeof factory !== 'function') {
    throw new Error(`Unknown calculation method: ${methodId}`);
  }
  return factory();
}

/**
 * Build adhan CalculationParameters from this project's config shape.
 *
 * @param {object} prayerConfig - config.prayer
 * @param {{latitude:number, longitude:number}} coordinates
 * @returns {import('adhan').CalculationParameters}
 */
export function paramsFor(prayerConfig, coordinates) {
  const params = methodParams(prayerConfig?.method ?? DEFAULT_METHOD);

  const school = SCHOOLS.find((s) => s.id === (prayerConfig?.school ?? DEFAULT_SCHOOL));
  params.madhab = (school ?? SCHOOLS[0]).madhab;

  const hlrId = prayerConfig?.highLatitudeRule ?? DEFAULT_HIGH_LATITUDE_RULE;
  const hlr = HIGH_LATITUDE_RULES.find((r) => r.id === hlrId);
  params.highLatitudeRule = hlr?.rule
    ?? adhan.HighLatitudeRule.recommended(new adhan.Coordinates(coordinates.latitude, coordinates.longitude));

  const polarId = prayerConfig?.polarCircleResolution ?? DEFAULT_POLAR_RESOLUTION;
  const polar = POLAR_RESOLUTIONS.find((p) => p.id === polarId) ?? POLAR_RESOLUTIONS[0];
  params.polarCircleResolution = polar.value;

  // Preset correction plus the user's own offsets, SUMMED into
  // `adjustments`.
  //
  // Both must land in `adjustments` and never in `methodAdjustments`.
  // `methodAdjustments` is not a spare slot — it carries the calculation
  // method's own built-in corrections, and Muslim World League ships
  // `{dhuhr: 1}` there. Writing a preset into that field silently destroys
  // the method's correction: a preset of dhuhr -2 became a net -3, which
  // is exactly the one-minute drift that broke the Jerusalem fixture
  // comparison before this was found.
  const preset = PRESETS[prayerConfig?.method ?? DEFAULT_METHOD];
  const userOffsets = prayerConfig?.offsets ?? {};
  for (const key of PRAYER_FIELDS) {
    const fromPreset = preset?.adjustments?.[key] ?? 0;
    const fromUser = Number.isInteger(userOffsets[key]) ? userOffsets[key] : 0;
    params.adjustments[key] = fromPreset + fromUser;
  }

  return params;
}
