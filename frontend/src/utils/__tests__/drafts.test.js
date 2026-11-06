import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraft, readDraft } from '../drafts';
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('persistent scouting drafts', () => {
  it('saves nested form state and keeps events separate', async () => {
    const draft = createDraft('qual', 'event-a');
    draft.schedule({ match: 3, paths: [[{ x: 1, y: 2 }]], comments: 'unfinished' });
    await vi.advanceTimersByTimeAsync(250);
    expect(readDraft('qual', 'event-a').comments).toBe('unfinished');
    expect(readDraft('qual', 'event-b')).toBeNull();
  });
  it('flushes the latest pending changes when the document is hidden or closed', () => {
    const draft = createDraft('pit', 'event-a'); const stop = draft.start();
    draft.schedule({ notes: 'latest' }); window.dispatchEvent(new Event('pagehide'));
    expect(readDraft('pit', 'event-a')).toEqual({ notes: 'latest' }); stop();
  });
  it('reports storage failures and retries without dropping the draft', () => {
    const states = []; const listener = event => states.push(event.detail.state);
    window.addEventListener('draft-status', listener);
    const draft = createDraft('pit', 'event-a'); const stop = draft.start();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    draft.schedule({ notes: 'do not lose' }); draft.flush(); expect(states.at(-1)).toBe('error');
    write.mockRestore(); window.dispatchEvent(new Event('retry-drafts'));
    expect(readDraft('pit', 'event-a').notes).toBe('do not lose');
    stop(); window.removeEventListener('draft-status', listener);
  });
});
