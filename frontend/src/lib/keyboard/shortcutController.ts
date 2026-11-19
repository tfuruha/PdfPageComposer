/**
 * @fileoverview アプリケーション全体のキーボードショートカット制御ルーター。
 * アクティブな最前面モーダル/メニュー層を判定し、1回のキーイベントで必ず1層のみ処理する。
 */

export type ActiveOverlayLayer =
  | 'exportMenu'
  | 'about'
  | 'fileOrder'
  | 'preview'
  | 'workspace';

export interface OverlayFlags {
  readonly isExportMenuOpen: boolean;
  readonly isAboutModalOpen: boolean;
  readonly isFileOrderModalOpen: boolean;
  readonly isPreviewModalOpen: boolean;
}

export interface KeyboardEventTargetLike {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
}

export interface KeyboardEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly target: EventTarget | KeyboardEventTargetLike | null;
  preventDefault(): void;
}

export interface ShortcutContext {
  readonly activeLayer: ActiveOverlayLayer;
  readonly isBusy: boolean;
  readonly pageCount: number;
  readonly selectedCount: number;
  readonly hasCutPages: boolean;
}

export interface ShortcutActions {
  readonly closeExportMenu: () => void;
  readonly closeAboutModal: () => void;
  readonly cancelFileOrderModal: () => void;
  readonly confirmFileOrderModal: () => void;
  readonly closePreview: () => void;
  readonly previewPrev: () => void;
  readonly previewNext: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly selectAll: () => void;
  readonly cutSelection: () => void;
  readonly pasteCutPages: () => void;
  readonly cancelCut: () => void;
  readonly deletePages: () => void;
  readonly openPreview: () => void;
  readonly rotateSelection: (delta: 90 | -90) => void;
  readonly rotatePreviewPage: (delta: 90 | -90) => void;
  readonly deletePreviewPage: () => void;
  readonly selectAdjacent: (direction: -1 | 1, extend: boolean) => void;
  readonly exportAll: () => void;
  readonly exportSelected: () => void;
  readonly newProject: () => void;
}

/** 現在のモーダル・メニュー表示状態から最前面の1レイヤーのみを判定する。 */
export function resolveActiveLayer(flags: OverlayFlags): ActiveOverlayLayer {
  if (flags.isExportMenuOpen) {
    return 'exportMenu';
  }
  if (flags.isAboutModalOpen) {
    return 'about';
  }
  if (flags.isFileOrderModalOpen) {
    return 'fileOrder';
  }
  if (flags.isPreviewModalOpen) {
    return 'preview';
  }
  return 'workspace';
}

/** フォーム入力要素にフォーカスがあるか判定する。 */
export function isEditableTarget(
  target: EventTarget | KeyboardEventTargetLike | null,
): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }
  const candidate = target as KeyboardEventTargetLike;
  const tagName = typeof candidate.tagName === 'string' ? candidate.tagName.toUpperCase() : '';
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  return Boolean(candidate.isContentEditable);
}

function isButtonTarget(target: EventTarget | KeyboardEventTargetLike | null): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }
  const candidate = target as KeyboardEventTargetLike;
  return typeof candidate.tagName === 'string' && candidate.tagName.toUpperCase() === 'BUTTON';
}

function dispatchPreviewShortcut(
  event: KeyboardEventLike,
  context: ShortcutContext,
  actions: ShortcutActions,
): boolean {
  const lowerKey = event.key.toLowerCase();
  const isCtrlOrMeta = event.ctrlKey || event.metaKey;

  if (event.key === 'Escape' || event.key === ' ') {
    event.preventDefault();
    actions.closePreview();
    return true;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    actions.previewPrev();
    return true;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    actions.previewNext();
    return true;
  }

  // 処理中（isBusy）はプレビュー上の編集操作を抑止する
  if (context.isBusy) {
    return false;
  }

  if (isCtrlOrMeta && lowerKey === 'z') {
    event.preventDefault();
    if (event.shiftKey) {
      actions.redo();
    } else {
      actions.undo();
    }
    return true;
  }
  if (isCtrlOrMeta && lowerKey === 'y') {
    event.preventDefault();
    actions.redo();
    return true;
  }
  if (lowerKey === 'r' && !isCtrlOrMeta) {
    event.preventDefault();
    actions.rotatePreviewPage(event.shiftKey ? -90 : 90);
    return true;
  }
  if (lowerKey === 'l' && !isCtrlOrMeta) {
    event.preventDefault();
    actions.rotatePreviewPage(-90);
    return true;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    actions.deletePreviewPage();
    return true;
  }

  return false;
}

function dispatchWorkspaceShortcut(
  event: KeyboardEventLike,
  context: ShortcutContext,
  actions: ShortcutActions,
): boolean {
  const lowerKey = event.key.toLowerCase();
  const isCtrlOrMeta = event.ctrlKey || event.metaKey;

  // WebView 標準の保存・新規ウィンドウ動作は処理中でも抑止する
  if (isCtrlOrMeta && lowerKey === 's') {
    event.preventDefault();
    if (!context.isBusy) {
      if (event.shiftKey) {
        if (context.selectedCount > 0) {
          actions.exportSelected();
        }
      } else if (context.pageCount > 0) {
        actions.exportAll();
      }
    }
    return true;
  }

  if (isCtrlOrMeta && lowerKey === 'n') {
    event.preventDefault();
    if (!context.isBusy) {
      actions.newProject();
    }
    return true;
  }

  if (context.isBusy) {
    return false;
  }

  if (isCtrlOrMeta && lowerKey === 'z') {
    event.preventDefault();
    if (event.shiftKey) {
      actions.redo();
    } else {
      actions.undo();
    }
    return true;
  }

  if (isCtrlOrMeta && lowerKey === 'y') {
    event.preventDefault();
    actions.redo();
    return true;
  }

  if (isCtrlOrMeta && lowerKey === 'a') {
    if (context.pageCount > 0) {
      event.preventDefault();
      actions.selectAll();
      return true;
    }
    return false;
  }

  if (isCtrlOrMeta && lowerKey === 'x') {
    if (context.selectedCount > 0) {
      event.preventDefault();
      actions.cutSelection();
      return true;
    }
    return false;
  }

  if (isCtrlOrMeta && lowerKey === 'v') {
    if (context.hasCutPages) {
      event.preventDefault();
      actions.pasteCutPages();
      return true;
    }
    return false;
  }

  if (event.key === 'Escape') {
    if (context.hasCutPages) {
      event.preventDefault();
      actions.cancelCut();
      return true;
    }
    return false;
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (context.selectedCount > 0) {
      event.preventDefault();
      actions.deletePages();
      return true;
    }
    return false;
  }

  if (event.key === ' ') {
    if (context.pageCount > 0) {
      event.preventDefault();
      actions.openPreview();
      return true;
    }
    return false;
  }

  if (lowerKey === 'r' && !isCtrlOrMeta) {
    if (context.selectedCount > 0) {
      event.preventDefault();
      actions.rotateSelection(event.shiftKey ? -90 : 90);
      return true;
    }
    return false;
  }

  if (lowerKey === 'l' && !isCtrlOrMeta) {
    if (context.selectedCount > 0) {
      event.preventDefault();
      actions.rotateSelection(-90);
      return true;
    }
    return false;
  }

  if (event.key === 'ArrowLeft') {
    if (context.pageCount > 0) {
      event.preventDefault();
      actions.selectAdjacent(-1, event.shiftKey);
      return true;
    }
    return false;
  }

  if (event.key === 'ArrowRight') {
    if (context.pageCount > 0) {
      event.preventDefault();
      actions.selectAdjacent(1, event.shiftKey);
      return true;
    }
    return false;
  }

  return false;
}

/**
 * キーボードイベントを現在の最前面レイヤーに振り分けて実行する。
 * 1回の呼び出しで複数レイヤーへ貫通することは構造的に発生しない。
 */
export function dispatchKeyboardShortcut(
  event: KeyboardEventLike,
  context: ShortcutContext,
  actions: ShortcutActions,
): boolean {
  if (isEditableTarget(event.target) || event.altKey) {
    return false;
  }

  const isCtrlOrMeta = event.ctrlKey || event.metaKey;

  switch (context.activeLayer) {
    case 'exportMenu':
      if (event.key === 'Escape') {
        event.preventDefault();
        actions.closeExportMenu();
        return true;
      }
      return false;

    case 'about':
      if (event.key === 'Escape') {
        event.preventDefault();
        actions.closeAboutModal();
        return true;
      }
      return false;

    case 'fileOrder':
      if (event.key === 'Escape') {
        event.preventDefault();
        actions.cancelFileOrderModal();
        return true;
      }
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !isCtrlOrMeta &&
        !isButtonTarget(event.target)
      ) {
        event.preventDefault();
        actions.confirmFileOrderModal();
        return true;
      }
      return false;

    case 'preview':
      return dispatchPreviewShortcut(event, context, actions);

    case 'workspace':
      return dispatchWorkspaceShortcut(event, context, actions);
  }
}
