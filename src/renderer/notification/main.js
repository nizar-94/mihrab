const card = document.getElementById('card');
const pinBtn = document.getElementById('pin');

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

window.verseAPI.onVerse(({ ayah, sound }) => {
  const ayahEl = document.getElementById('ayah');
  ayahEl.textContent = ayah.text;
  // Long-ayah font stepping (see the .ayah.long/.xlong rules in index.html):
  // must happen before measureHeight() runs below, so the measured height
  // reflects the scaled-down font rather than the default 22px.
  ayahEl.classList.toggle('long', ayah.text.length > 300 && ayah.text.length <= 600);
  ayahEl.classList.toggle('xlong', ayah.text.length > 600);
  document.getElementById('ref').textContent = `${ayah.surahName} — الآية ${ayah.ayahNumber}`;
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
