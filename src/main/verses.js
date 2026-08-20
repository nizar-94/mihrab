import { TOTAL_AYAHS } from './config.js';

export function selectIndex(order, position, rand = Math.random) {
  if (order === 'sequential') {
    const index = position % TOTAL_AYAHS;
    return { index, nextPosition: (index + 1) % TOTAL_AYAHS };
  }
  // Random must not disturb the saved sequential position.
  return { index: Math.floor(rand() * TOTAL_AYAHS), nextPosition: position };
}
