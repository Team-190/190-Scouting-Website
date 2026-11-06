import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import SaveStatus from '../../components/SaveStatus.svelte';
beforeEach(() => { localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());
describe('saving and connectivity status', () => {
  it('shows queued submission counts and upload progress', async () => {
    render(SaveStatus);
    localStorage.setItem('scoutingData', JSON.stringify([{ entryId: 'a' }, { entryId: 'b' }]));
    window.dispatchEvent(new Event('scouting-queue-changed'));
    await waitFor(() => expect(screen.getByText(/2 waiting to upload/)).toBeInTheDocument());
    window.dispatchEvent(new CustomEvent('queue-sync-status', { detail: { syncing: true } }));
    await waitFor(() => expect(screen.getByText(/Uploading 2 submissions/)).toBeInTheDocument());
  });
  it('keeps a failed draft visible even when another draft saves successfully', async () => {
    render(SaveStatus);
    window.dispatchEvent(new CustomEvent('draft-status', { detail: { key: 'qual', state: 'error' } }));
    window.dispatchEvent(new CustomEvent('draft-status', { detail: { key: 'pit', state: 'saved' } }));
    await waitFor(() => expect(screen.getByText(/Device storage unavailable/)).toBeInTheDocument());
    window.dispatchEvent(new CustomEvent('draft-status', { detail: { key: 'qual', state: 'saved' } }));
    await waitFor(() => expect(screen.queryByText(/Device storage unavailable/)).not.toBeInTheDocument());
  });
});
