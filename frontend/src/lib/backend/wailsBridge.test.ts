/**
 * @fileoverview Unit tests for wailsBridge covering file-drop subscription,
 * Wails runtime OnFileDrop initialization, and listener cleanup.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import type {SourcePDF} from '../types';
import {subscribeToFileDrop} from './wailsBridge';

type EventCallback = (...data: unknown[]) => void;

describe('subscribeToFileDrop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a no-op unsubscribe function when window.runtime is absent', () => {
    vi.stubGlobal('window', {});

    const unsubscribe = subscribeToFileDrop(vi.fn(), vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });

  it('initializes window.runtime.OnFileDrop with useDropTarget=false and forwards drop events', () => {
    const handlers = new Map<string, EventCallback>();
    const offDropped = vi.fn();
    const offError = vi.fn();
    const onFileDrop = vi.fn();
    const onFileDropOff = vi.fn();

    const eventsOn = vi.fn((eventName: string, callback: EventCallback) => {
      handlers.set(eventName, callback);
      return eventName === 'pdf:files-dropped' ? offDropped : offError;
    });

    vi.stubGlobal('window', {
      runtime: {
        EventsOn: eventsOn,
        OnFileDrop: onFileDrop,
        OnFileDropOff: onFileDropOff,
      },
    });

    const onFilesDropped = vi.fn();
    const onDropError = vi.fn();

    const unsubscribe = subscribeToFileDrop(onFilesDropped, onDropError);

    expect(onFileDrop).toHaveBeenCalledTimes(1);
    expect(onFileDrop).toHaveBeenCalledWith(expect.any(Function), false);
    expect(eventsOn).toHaveBeenCalledWith('pdf:files-dropped', expect.any(Function));
    expect(eventsOn).toHaveBeenCalledWith('pdf:drop-error', expect.any(Function));

    const sampleSources: SourcePDF[] = [
      {
        id: 'src_1',
        filePath: '/tmp/sample.pdf',
        fileName: 'sample.pdf',
        pageCount: 2,
      },
    ];

    handlers.get('pdf:files-dropped')?.(sampleSources);
    expect(onFilesDropped).toHaveBeenCalledTimes(1);
    expect(onFilesDropped).toHaveBeenCalledWith(sampleSources);

    // 非配列データは無視されること
    handlers.get('pdf:files-dropped')?.('invalid');
    expect(onFilesDropped).toHaveBeenCalledTimes(1);

    handlers.get('pdf:drop-error')?.('PDF読み込みエラー');
    expect(onDropError).toHaveBeenCalledTimes(1);
    expect(onDropError).toHaveBeenCalledWith('PDF読み込みエラー');

    // 非文字列エラーは無視されること
    handlers.get('pdf:drop-error')?.(123);
    expect(onDropError).toHaveBeenCalledTimes(1);

    // クリーンアップ時は個別リスナーのみ解除し、OnFileDropOffは呼ばないこと
    unsubscribe();
    expect(offDropped).toHaveBeenCalledTimes(1);
    expect(offError).toHaveBeenCalledTimes(1);
    expect(onFileDropOff).not.toHaveBeenCalled();
  });
});
