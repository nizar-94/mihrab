import { describe, it, expect, vi } from 'vitest';
import { menuTemplate, tooltipFor } from '../src/main/tray.js';

// menuTemplate is pure — it returns plain objects, never a built Electron
// Menu — so everything below runs under plain Node with no Electron process.
// buildMenu() is deliberately not covered here: it is a one-line adapter
// whose only statement is Menu.buildFromTemplate(menuTemplate(...)), and
// Menu is undefined outside Electron.

const handlers = {
  onShowNow: vi.fn(),
  onTogglePause: vi.fn(),
  onSettings: vi.fn(),
  onCheckForUpdates: vi.fn(),
  onQuit: vi.fn()
};

const baseState = {
  paused: false,
  failing: false,
  errorLabel: null,
  updateLabel: null,
  version: null
};

const labels = (state) =>
  menuTemplate(handlers, state)
    .filter((item) => item.label)
    .map((item) => item.label);

const find = (state, predicate) => menuTemplate(handlers, state).find(predicate);

describe('menuTemplate — version line', () => {
  it('renders the version as a disabled item when a version is supplied', () => {
    const item = find({ ...baseState, version: '1.0.0' }, (i) => i.label === 'Muslim App v1.0.0');
    expect(item).toBeDefined();
    expect(item.enabled).toBe(false);
    expect(item.click).toBeUndefined();
  });

  it('omits the version item entirely rather than rendering "v null"', () => {
    expect(labels(baseState).some((l) => l.startsWith('Muslim App v'))).toBe(false);
  });

  it('reflects whatever version it is given — this is what makes an applied update visible', () => {
    expect(labels({ ...baseState, version: '1.0.1' })).toContain('Muslim App v1.0.1');
  });

  it('sits immediately before the update item, so version and update status read together', () => {
    const template = menuTemplate(handlers, { ...baseState, version: '1.0.0' });
    const versionIndex = template.findIndex((i) => i.label === 'Muslim App v1.0.0');
    const updateIndex = template.findIndex((i) => i.click === handlers.onCheckForUpdates);
    expect(updateIndex).toBe(versionIndex + 1);
  });
});

describe('menuTemplate — existing behaviour still holds', () => {
  it('names the action a click will take, not the current state', () => {
    expect(labels(baseState)).toContain('Pause reminders');
    expect(labels({ ...baseState, paused: true })).toContain('Resume reminders');
  });

  it('shows a plain "Check for updates" while idle', () => {
    expect(labels(baseState)).toContain('Check for updates');
  });

  it('folds a status label into the update item when one exists', () => {
    const state = { ...baseState, updateLabel: 'Muslim App is up to date' };
    expect(labels(state)).toContain('Updates: Muslim App is up to date');
    expect(labels(state)).not.toContain('Check for updates');
  });

  it('adds the failure item only when failing, and routes it to Settings', () => {
    expect(labels(baseState).some((l) => l.includes('stopped'))).toBe(false);
    const failing = { ...baseState, failing: true, errorLabel: 'Reminders stopped: boom' };
    const item = find(failing, (i) => i.label === 'Reminders stopped: boom');
    expect(item).toBeDefined();
    expect(item.click).toBe(handlers.onSettings);
  });

  it('falls back to a generic failure label when no errorLabel is set', () => {
    const failing = { ...baseState, failing: true };
    expect(labels(failing)).toContain('Reminders have stopped — click for Settings');
  });

  it('always offers Show verse now, Settings and Quit', () => {
    const l = labels({ ...baseState, version: '1.0.0' });
    expect(l).toContain('Show verse now');
    expect(l).toContain('Settings');
    expect(l).toContain('Quit');
  });
});

describe('tooltipFor', () => {
  it('prioritises failing over paused over update status', () => {
    expect(tooltipFor({ ...baseState, failing: true, paused: true, updateLabel: 'x' }))
      .toBe('Muslim App — reminders have stopped');
    expect(tooltipFor({ ...baseState, paused: true, updateLabel: 'x' }))
      .toBe('Muslim App — reminders paused');
    expect(tooltipFor({ ...baseState, updateLabel: 'Muslim App is up to date' }))
      .toBe('Muslim App — Muslim App is up to date');
  });

  it('falls back to the bare product name', () => {
    expect(tooltipFor(baseState)).toBe('Muslim App');
  });

  // The version deliberately does NOT appear in the tooltip: the tooltip is
  // for transient status, and a permanently-displayed version string would
  // crowd out the paused/failing messages that matter more at a glance.
  it('does not include the version', () => {
    expect(tooltipFor({ ...baseState, version: '1.0.0' })).toBe('Muslim App');
  });
});
