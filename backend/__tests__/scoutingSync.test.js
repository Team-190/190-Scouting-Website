const { delta, flatten } = require('../scoutingSync');
const crypto = require('crypto');
const revisions = records => Object.fromEntries(Object.entries(records).map(([key, entry]) =>
  [key, crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex')]));

describe('submission delta sync', () => {
  const first = { _entryId: 'a', Team: '190', qual: { path: [[{ x: 12, y: 4 }]] } };
  const second = { _entryId: 'b', Team: '190', ScouterName: 'Other' };
  test('transfers only new or edited submissions and reports deletions', () => {
    const original = { '190': { '3': [first, second] } };
    const known = revisions(flatten(original, 'qual'));
    expect(delta(original, 'qual', known)).toEqual({ upserts: {}, deleted: [] });
    const changed = { '190': { '3': [{ ...first, ScouterName: 'Edited' }], '4': [second] } };
    const result = delta(changed, 'qual', known);
    expect(Object.values(result.upserts)).toEqual([changed['190']['3'][0], second]);
    expect(result.deleted).toEqual([JSON.stringify(['190', '3', 'b'])]);
  });
  test('deleting a robot file removes every submission on that robot', () => {
    const known = revisions(flatten({ '190': { '3': [first, second] } }, 'qual'));
    expect(delta({}, 'qual', known)).toEqual({ upserts: {}, deleted: Object.keys(known) });
  });
  test('pit deltas omit photos and preserve multiple scouters', () => {
    const result = delta({ '190': [{ ...first, robotPicturePreview: 'large-image' }, second] }, 'pit');
    expect(Object.values(result.upserts)).toEqual([first, second]);
  });
  test('legacy entries without IDs stay distinct', () => {
    expect(Object.keys(flatten({ '190': { '3': [{ note: 'one' }, { note: 'two' }] } }, 'qual'))).toHaveLength(2);
  });
});
