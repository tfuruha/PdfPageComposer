/**
 * @fileoverview Unit tests for shortcutController ensuring strict modal layer isolation,
 * no Escape/Space bleed-through, and isBusy operation guards.
 */

import {describe, expect, it, vi} from 'vitest';
import {
  dispatchKeyboardShortcut,
  resolveActiveLayer,
  type KeyboardEventLike,
  type ShortcutActions,
  type ShortcutContext,
} from './shortcutController';

function createEvent(
  key: string,
  opts: Partial<Omit<KeyboardEventLike, 'key' | 'preventDefault'>> = {},
) {
  const preventDefault = vi.fn();
  const event: KeyboardEventLike = {
    key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
    target: opts.target ?? null,
    preventDefault,
  };
  return {event, preventDefault};
}

function createActions(): ShortcutActions {
  return {
    closeExportMenu: vi.fn(),
    closeAboutModal: vi.fn(),
    cancelFileOrderModal: vi.fn(),
    confirmFileOrderModal: vi.fn(),
    closePreview: vi.fn(),
    previewPrev: vi.fn(),
    previewNext: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    selectAll: vi.fn(),
    cutSelection: vi.fn(),
    pasteCutPages: vi.fn(),
    cancelCut: vi.fn(),
    deletePages: vi.fn(),
    openPreview: vi.fn(),
    rotateSelection: vi.fn(),
    rotatePreviewPage: vi.fn(),
    deletePreviewPage: vi.fn(),
    selectAdjacent: vi.fn(),
    exportAll: vi.fn(),
    exportSelected: vi.fn(),
    newProject: vi.fn(),
  };
}

function createContext(overrides: Partial<ShortcutContext> = {}): ShortcutContext {
  return {
    activeLayer: 'workspace',
    isBusy: false,
    pageCount: 5,
    selectedCount: 2,
    hasCutPages: false,
    ...overrides,
  };
}

describe('shortcutController', () => {
  it('resolves active overlay layer by priority order', () => {
    expect(
      resolveActiveLayer({
        isExportMenuOpen: true,
        isAboutModalOpen: true,
        isFileOrderModalOpen: true,
        isPreviewModalOpen: true,
      }),
    ).toBe('exportMenu');

    expect(
      resolveActiveLayer({
        isExportMenuOpen: false,
        isAboutModalOpen: true,
        isFileOrderModalOpen: true,
        isPreviewModalOpen: true,
      }),
    ).toBe('about');

    expect(
      resolveActiveLayer({
        isExportMenuOpen: false,
        isAboutModalOpen: false,
        isFileOrderModalOpen: true,
        isPreviewModalOpen: true,
      }),
    ).toBe('fileOrder');

    expect(
      resolveActiveLayer({
        isExportMenuOpen: false,
        isAboutModalOpen: false,
        isFileOrderModalOpen: false,
        isPreviewModalOpen: true,
      }),
    ).toBe('preview');

    expect(
      resolveActiveLayer({
        isExportMenuOpen: false,
        isAboutModalOpen: false,
        isFileOrderModalOpen: false,
        isPreviewModalOpen: false,
      }),
    ).toBe('workspace');
  });

  it('closes PreviewModal on Space without re-opening workspace preview on the same event', () => {
    const actions = createActions();
    const {event, preventDefault} = createEvent(' ');

    const handled = dispatchKeyboardShortcut(
      event,
      createContext({activeLayer: 'preview'}),
      actions,
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(actions.closePreview).toHaveBeenCalledTimes(1);
    expect(actions.openPreview).not.toHaveBeenCalled();
  });

  it('prevents Escape from bleeding through overlays to cancelCut', () => {
    const layers = ['exportMenu', 'about', 'fileOrder', 'preview'] as const;

    for (const layer of layers) {
      const actions = createActions();
      const {event, preventDefault} = createEvent('Escape');

      const handled = dispatchKeyboardShortcut(
        event,
        createContext({activeLayer: layer, hasCutPages: true}),
        actions,
      );

      expect(handled).toBe(true);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(actions.cancelCut).not.toHaveBeenCalled();
    }
  });

  it('blocks workspace editing shortcuts while AboutModal, FileOrderModal, or exportMenu is open', () => {
    const modalLayers = ['exportMenu', 'about', 'fileOrder'] as const;

    for (const layer of modalLayers) {
      const actions = createActions();
      for (const [key, ctrlKey] of [
        ['Delete', false],
        ['r', false],
        [' ', false],
        ['ArrowRight', false],
        ['z', true],
        ['n', true],
        ['s', true],
      ] as const) {
        const {event} = createEvent(key, {ctrlKey});
        const handled = dispatchKeyboardShortcut(
          event,
          createContext({activeLayer: layer}),
          actions,
        );
        expect(handled).toBe(false);
      }

      expect(actions.deletePages).not.toHaveBeenCalled();
      expect(actions.rotateSelection).not.toHaveBeenCalled();
      expect(actions.openPreview).not.toHaveBeenCalled();
      expect(actions.selectAdjacent).not.toHaveBeenCalled();
      expect(actions.undo).not.toHaveBeenCalled();
      expect(actions.newProject).not.toHaveBeenCalled();
      expect(actions.exportAll).not.toHaveBeenCalled();
    }
  });

  it('handles FileOrderModal Enter only when focus is not on a button', () => {
    const actions = createActions();
    const nonButton = createEvent('Enter', {target: {tagName: 'DIV'}});
    expect(
      dispatchKeyboardShortcut(
        nonButton.event,
        createContext({activeLayer: 'fileOrder'}),
        actions,
      ),
    ).toBe(true);
    expect(actions.confirmFileOrderModal).toHaveBeenCalledTimes(1);

    const buttonTarget = createEvent('Enter', {target: {tagName: 'BUTTON'}});
    expect(
      dispatchKeyboardShortcut(
        buttonTarget.event,
        createContext({activeLayer: 'fileOrder'}),
        actions,
      ),
    ).toBe(false);
    expect(actions.confirmFileOrderModal).toHaveBeenCalledTimes(1);
  });

  it('blocks actions while isBusy is true while still calling preventDefault on Ctrl+S/Ctrl+N', () => {
    const actions = createActions();

    const saveEvt = createEvent('s', {ctrlKey: true});
    expect(
      dispatchKeyboardShortcut(saveEvt.event, createContext({isBusy: true}), actions),
    ).toBe(true);
    expect(saveEvt.preventDefault).toHaveBeenCalledTimes(1);
    expect(actions.exportAll).not.toHaveBeenCalled();

    const newEvt = createEvent('n', {ctrlKey: true});
    expect(
      dispatchKeyboardShortcut(newEvt.event, createContext({isBusy: true}), actions),
    ).toBe(true);
    expect(newEvt.preventDefault).toHaveBeenCalledTimes(1);
    expect(actions.newProject).not.toHaveBeenCalled();

    const delEvt = createEvent('Delete');
    expect(
      dispatchKeyboardShortcut(delEvt.event, createContext({isBusy: true}), actions),
    ).toBe(false);
    expect(actions.deletePages).not.toHaveBeenCalled();

    const previewRotEvt = createEvent('r');
    expect(
      dispatchKeyboardShortcut(
        previewRotEvt.event,
        createContext({activeLayer: 'preview', isBusy: true}),
        actions,
      ),
    ).toBe(false);
    expect(actions.rotatePreviewPage).not.toHaveBeenCalled();
  });

  it('ignores shortcuts when focus is inside an editable form element', () => {
    const actions = createActions();
    for (const target of [
      {tagName: 'INPUT'},
      {tagName: 'TEXTAREA'},
      {tagName: 'SELECT'},
      {tagName: 'DIV', isContentEditable: true},
    ]) {
      const {event, preventDefault} = createEvent('Delete', {target});
      expect(dispatchKeyboardShortcut(event, createContext(), actions)).toBe(false);
      expect(preventDefault).not.toHaveBeenCalled();
    }
    expect(actions.deletePages).not.toHaveBeenCalled();
  });
});
