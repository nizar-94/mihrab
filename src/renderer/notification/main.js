const card = document.getElementById('card');
const pinBtn = document.getElementById('pin');
const sampleBadge = document.getElementById('sample-badge');

// Every card type calls this before measuring, so the badge's height is
// included in the measurement rather than overflowing afterwards.
function setSample(isSample) {
  sampleBadge.classList.toggle('hidden', !isSample);
}

// FIX 1: the window is created at a placeholder size and stays hidden
// (show: false in main) until we measure the card's real height and report
// it to main over IPC. Measured after document.fonts.ready + a couple of
// animation frames so the Amiri webfont has settled and layout has
// flushed — measuring earlier produces a wrong (usually smaller) height.
function measureHeight() {
  const rect = card.getBoundingClientRect();
  const style = getComputedStyle(card);
  const marginTop = parseFloat(style.marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  return Math.ceil(rect.height + marginTop + marginBottom);
}

window.verseAPI.onVerse(({ ayah, sound, notification }) => {
  setSample(false);
  const ayahEl = document.getElementById('ayah');
  // Applied before the long/xlong classes and before measureHeight() below:
  // the measured height must reflect the size actually being rendered, or
  // the window is sized for the wrong font and the card is clipped or
  // floats in empty space.
  if (notification?.verseFontSize) {
    document.documentElement.style.setProperty('--verse-size', `${notification.verseFontSize}px`);
  }
  ayahEl.textContent = ayah.text;
  // Long-ayah font stepping (see the .ayah.long/.xlong rules in index.html):
  // must happen before measureHeight() runs below, so the measured height
  // reflects the scaled-down font rather than the default 22px.
  ayahEl.classList.toggle('long', ayah.text.length > 300 && ayah.text.length <= 600);
  ayahEl.classList.toggle('xlong', ayah.text.length > 600);
  const transEl = document.getElementById('trans');
  transEl.textContent = ayah.translation ?? '';
  // Arabic, Urdu, Persian and Hebrew translations need RTL; everything else
  // must stay LTR inside this RTL card.
  transEl.classList.toggle('rtl', /[\u0600-\u06FF]/.test(ayah.translation ?? ''));
  document.getElementById('ref').textContent = `${ayah.surahName} — الآية ${ayah.ayahNumber}`;

  // Khitmah progress, sequential order only. Set before the measurement
  // below so the bar's height is part of the card's measured size.
  const khitmah = document.getElementById('khitmah');
  if (ayah.progress) {
    khitmah.classList.remove('hidden');
    document.getElementById('khitmah-fill').style.width = `${ayah.progress.percent}%`;
    document.getElementById('khitmah-text').textContent =
      `Khitmah ${ayah.progress.percent}% — ${ayah.progress.read.toLocaleString()} of ${ayah.progress.total.toLocaleString()} ayat`;
  } else {
    khitmah.classList.add('hidden');
  }
  if (sound.enabled) {
    const chime = document.getElementById('chime');
    chime.volume = sound.volume;
    // Audio failure must never break the notification.
    chime.play().catch(() => {});
  }

  document.fonts.ready.then(() => {
    // Double rAF: one to flush the post-font-load layout, one more so the
    // measurement reflects a fully settled frame before we report it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Measured while still in the pre-animation (translateX/opacity 0)
        // state — that state doesn't affect layout size, so it's safe to
        // measure before triggering the slide-in below.
        window.verseAPI.reportSize(measureHeight());
        // Trigger the slide-in only now: main resizes/repositions and
        // reveals the window in response to reportSize, so kicking off the
        // CSS transition here means it plays out as (or just after) the
        // window becomes visible, instead of finishing invisibly while the
        // window is still hidden.
        card.classList.add('show');
      });
    });
  });
});

// Prayer cards reuse this window, the same measurement path and the same
// dismiss/pin/hover behaviour — only the content differs. The verse block
// is hidden rather than emptied so that a stale ayah can never flash behind
// the prayer content during the pre-show frame.
window.verseAPI.onPrayer(({ prayer, sound, sample }) => {
  setSample(sample);
  document.getElementById('ayah').classList.add('hidden');
  document.getElementById('ref').classList.add('hidden');
  document.getElementById('prayer').classList.remove('hidden');

  document.getElementById('prayer-ar').textContent = prayer.ar;
  document.getElementById('prayer-en').textContent =
    prayer.kind === 'before' ? `${prayer.en} soon` : `It is time for ${prayer.en}`;
  document.getElementById('prayer-time').textContent = prayer.time ?? '';
  document.getElementById('prayer-loc').textContent = prayer.location ?? '';

  if (sound.enabled) {
    const chime = document.getElementById('chime');
    chime.volume = sound.volume;
    chime.play().catch(() => {});
  }

  // Identical settle-then-measure dance as the verse path above: the Amiri
  // webfont must have loaded before the height is measured, or the card is
  // sized for a fallback font and ends up the wrong height on screen.
  document.fonts.ready.then(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.verseAPI.reportSize(measureHeight());
        card.classList.add('show');
      });
    });
  });
});

card.addEventListener('click', () => window.verseAPI.dismiss());
card.addEventListener('mouseenter', () => window.verseAPI.pauseTimer());
card.addEventListener('mouseleave', () => window.verseAPI.resumeTimer());

// FEATURE 4: pin cancels auto-dismiss so the user can read at leisure.
// stopPropagation so clicking the pin does not also trigger the card's
// own dismiss-on-click handler above.
pinBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (pinBtn.classList.contains('pinned')) return;
  pinBtn.classList.add('pinned');
  pinBtn.setAttribute('aria-pressed', 'true');
  window.verseAPI.pin();
});

// Fasting reminders arrive the day before the fast, so everything here is
// phrased in the future tense. Reuses the same window, measurement and
// dismiss behaviour as the other two card types.
window.verseAPI.onFasting(({ fasting, sound, sample }) => {
  setSample(sample);
  document.getElementById('ayah').classList.add('hidden');
  document.getElementById('ref').classList.add('hidden');
  document.getElementById('fasting').classList.remove('hidden');

  document.getElementById('fasting-kicker').textContent = 'Fasting reminder';
  document.getElementById('fasting-title').textContent =
    `Tomorrow is ${fasting.weekday} — a day you fast`;
  // One line per reason: a day can be both a white day and a Monday, and
  // naming both is more useful than picking one.
  const list = document.getElementById('fasting-reasons');
  list.replaceChildren();
  for (const reason of fasting.reasons) {
    const line = document.createElement('div');
    line.textContent = reason;
    list.append(line);
  }
  document.getElementById('fasting-hijri').textContent = fasting.hijri ?? '';

  if (sound.enabled) {
    const chime = document.getElementById('chime');
    chime.volume = sound.volume;
    chime.play().catch(() => {});
  }

  document.fonts.ready.then(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.verseAPI.reportSize(measureHeight());
        card.classList.add('show');
      });
    });
  });
});

// Azkar cards reuse the verse text size, because the Arabic here is also
// meant to be read aloud — someone who enlarged the verse text did so
// because of their eyesight, not because of the genre.
window.verseAPI.onDhikr(({ dhikr, sound, notification, sample }) => {
  setSample(sample);
  document.getElementById('ayah').classList.add('hidden');
  document.getElementById('ref').classList.add('hidden');
  document.getElementById('dhikr').classList.remove('hidden');

  if (notification?.verseFontSize) {
    document.documentElement.style.setProperty('--verse-size', `${notification.verseFontSize}px`);
  }

  document.getElementById('dhikr-kicker').textContent =
    dhikr.session === 'morning' ? 'Morning adhkar' : 'Evening adhkar';
  document.getElementById('dhikr-ar').textContent = dhikr.ar;
  document.getElementById('dhikr-translit').textContent = dhikr.translit ?? '';
  document.getElementById('dhikr-en').textContent = dhikr.en ?? '';
  document.getElementById('dhikr-count').textContent = dhikr.countLabel ?? '';
  // Position in the set, so the card is not a lone fragment with no sense
  // of where it sits.
  document.getElementById('dhikr-pos').textContent = `${dhikr.index + 1} of ${dhikr.total}`;

  if (sound.enabled) {
    const chime = document.getElementById('chime');
    chime.volume = sound.volume;
    chime.play().catch(() => {});
  }

  document.fonts.ready.then(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.verseAPI.reportSize(measureHeight());
        card.classList.add('show');
      });
    });
  });
});
