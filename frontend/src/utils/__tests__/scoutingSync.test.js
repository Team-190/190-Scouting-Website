import { describe, it, expect } from 'vitest';
import { webcrypto, createHash } from 'node:crypto';
import { flattenScouting, scoutingRevisions, applyScoutingDelta } from '../scoutingSync';

describe('scouting delta client', () => {
  it('matches server SHA-256 revisions and preserves nested values', async () => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const entry = { _entryId: 'a', qual: { path: [[{ x: 1, y: 2 }]] }, note: '?' };
    const records = flattenScouting({ '190': { '3': [entry] } }, 'qual');
    const revisions = await scoutingRevisions(records);
    expect(Object.values(revisions)).toEqual([createHash('sha256').update(JSON.stringify(entry)).digest('hex')]);
    expect(applyScoutingDelta({}, { upserts: records, deleted: [] }, 'qual')).toEqual({ '190': { '3': [entry] } });
  });
  it('applies server edits and deletions instead of retaining stale local records', () => {
    const original = flattenScouting({ '190': { '3': [{ _entryId: 'a', note: 'old' }, { _entryId: 'b' }] } }, 'qual');
    const [first, second] = Object.keys(original);
    expect(applyScoutingDelta(original, { upserts: { [first]: { _entryId: 'a', note: 'new' } }, deleted: [second] }, 'qual'))
      .toEqual({ '190': { '3': [{ _entryId: 'a', note: 'new' }] } });
  });
  it('keeps deletion detection working without WebCrypto on HTTP LAN origins', async () => {
    const previous = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try { expect(await scoutingRevisions({ a: {} })).toEqual({ a: '' }); }
    finally { Object.defineProperty(globalThis, 'crypto', { value: previous, configurable: true }); }
  });
});
