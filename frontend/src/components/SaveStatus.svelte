<script>
  import { onMount } from 'svelte';
  let online = true;
  let pending = 0;
  let syncing = false;
  let draft = '';
  let failedDrafts = new Set();
  let storageError = false;
  onMount(() => {
    const refresh = event => {
      online = navigator.onLine;
      try {
        pending = ['pitScouting', 'scoutingData'].reduce((sum, key) => {
          const queue = JSON.parse(localStorage.getItem(key) || '[]');
          return sum + (Array.isArray(queue) ? queue.length : 0);
        }, 0);
        storageError = false;
      } catch { storageError = true; }
      if (event?.type === 'queue-sync-status') syncing = event.detail.syncing;
    };
    const updateDraft = event => {
      draft = event.detail.state;
      if (draft === 'error') failedDrafts.add(event.detail.key);
      if (draft === 'saved') failedDrafts.delete(event.detail.key);
      failedDrafts = new Set(failedDrafts);
    };
    const events = ['online', 'offline', 'storage', 'scouting-queue-changed', 'queue-sync-status'];
    events.forEach(name => window.addEventListener(name, refresh));
    window.addEventListener('draft-status', updateDraft);
    refresh();
    return () => {
      events.forEach(name => window.removeEventListener(name, refresh));
      window.removeEventListener('draft-status', updateDraft);
    };
  });
</script>
<div class="save-status" role="status" aria-live="polite" class:warning={failedDrafts.size > 0 || storageError}>
  <span class="connection" class:offline={!online}>{online ? 'Online' : 'Offline'}</span>
  {#if failedDrafts.size > 0 || storageError}
    <span>Device storage unavailable. Keep this page open.</span>
    <button onclick={() => window.dispatchEvent(new Event("retry-drafts"))}>Retry saving</button>
  {:else if syncing && pending}<span>Uploading {pending} {pending === 1 ? 'submission' : 'submissions'}...</span>
  {:else if pending}<span>Saved on device � {pending} waiting to upload</span>
  {:else if draft === 'saving'}<span>Saving draft...</span>
  {:else if draft === 'saved'}<span>Draft saved on device</span>
  {:else}<span>No uploads waiting</span>{/if}
</div>
<style>
  .save-status { position: fixed; bottom: 0; right: 0; left: 80px; z-index: 1100; display: flex;
    align-items: center; gap: .65rem; padding: .35rem .8rem; background: #242424; color: #f5f5f5;
    border-top: 1px solid #666; font-size: .8rem; min-height: 32px; }
  .connection { color: #a2e0b0; }
  .connection.offline { color: #ffc877; }
  .warning { background: #672519; }
  @media(max-width: 768px) { .save-status { left: 0; } }
</style>
