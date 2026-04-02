import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLastId, setIndexedDBStore, getIndexedDBStore, clearIndexedDBStore, clearAllStores } from '../indexedDB';

describe('IndexedDB Utils', () => {
    describe('getLastId', () => {
        it('should return 0 for an empty array', async () => {
            const data = [];
            const result = await getLastId(data);
            expect(result).toBe(0);
        });

        it('should return the maximum Id value', async () => {
             const data = [
                { Id: 1 },
                { Id: 5 },
                { Id: 3 }
             ];
             const result = await getLastId(data);
             expect(result).toBe(5);
        });

        it('should handle negative Ids if they exist', async () => {
             const data = [
                { Id: -5 },
                { Id: -1 }
             ];
             const result = await getLastId(data);
             expect(result).toBe(-1);
        });
    });

    // We can also mock indexedDB using 'fake-indexeddb' but for this scope we'll focus
    // on pure utilities, and potentially mocking the global indexedDB if needed.
    // Testing the integration wrapper over indexedDB might require more complex polyfills.
});
