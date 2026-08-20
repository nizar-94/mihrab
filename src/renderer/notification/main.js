const card = document.getElementById('card');

window.verseAPI.onVerse(({ ayah, sound }) => {
  document.getElementById('ayah').textContent = ayah.text;
  document.getElementById('ref').textContent = `${ayah.surahName} — الآية ${ayah.ayahNumber}`;
  if (sound.enabled) {
    const chime = document.getElementById('chime');
    chime.volume = sound.volume;
    // Audio failure must never break the notification.
    chime.play().catch(() => {});
  }
});

card.addEventListener('click', () => window.verseAPI.dismiss());
card.addEventListener('mouseenter', () => window.verseAPI.pauseTimer());
card.addEventListener('mouseleave', () => window.verseAPI.resumeTimer());
