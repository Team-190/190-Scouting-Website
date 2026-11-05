const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../qualitativeStorage');

describe('qualitative JSON storage', () => {
  let dir, store;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qual-storage-')); store = createStore(dir); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const entry = { Team: '190', Match: 1, comments: 'Quotes " and, commas\nnewlines', qual: { path: [[{ x: 1, y: 2 }]], value: null }, _entryId: 'abc' };
  test('migrates JSON losslessly, retains backup, and does not restore deleted robot files', () => {
    const data = { '2026test': { '190': { '1': [entry, { ...entry, _entryId: 'def' }] } } };
    fs.writeFileSync(path.join(dir, 'qualitativeScoutingData.json'), JSON.stringify(data));
    expect(store.read()).toEqual(data);
    expect(fs.existsSync(path.join(dir, 'qualitativeScoutingData.json.backup'))).toBe(true);
    fs.unlinkSync(path.join(dir, 'qualitativeScoutingData', '2026test', '1', '190.json'));
    expect(store.read()).toEqual({ '2026test': {} });
  });
  test('isolates six robots by event and match and preserves updates', () => {
    const teams = Object.fromEntries([190, 254, 8, 9, 10, 11].map(team => [team, { '1': [entry] }]));
    const data = { '2026test': teams, '2026other': { '190': { '2': [entry] } } };
    store.write(data);
    expect(fs.readdirSync(path.join(dir, 'qualitativeScoutingData', '2026test', '1'))).toHaveLength(6);
    expect(store.read()).toEqual(data);
    data['2026test']['190']['1'].push({ ...entry, _entryId: 'second' });
    store.write(data);
    expect(store.read()).toEqual(data);
  });
  test('converts existing robot CSVs to JSON and preserves a backup', () => {
    const folder = path.join(dir, 'qualitativeScoutingData', '2026test', '1');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, '190.csv'), '"Team","Match"\r\n"""190""","1"\r\n');
    expect(store.read()).toEqual({ '2026test': { '190': { '1': [{ Team: '190', Match: 1 }] } } });
    expect(JSON.parse(fs.readFileSync(path.join(folder, '190.json'), 'utf8'))).toEqual([{ Team: '190', Match: 1 }]);
    expect(fs.existsSync(path.join(folder, '190.csv'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'qualitativeScoutingCsvBackup', '2026test', '1', '190.csv'))).toBe(true);
  });
  test('rejects unsafe identifiers before writing', () => {
    expect(() => store.write({ '../escape': { '190': { '1': [entry] } } })).toThrow('Invalid scouting storage identifier');
    expect(store.read()).toEqual({});
  });
  test('does not clear malformed legacy data', () => {
    const filename = path.join(dir, 'qualitativeScoutingData.json');
    fs.writeFileSync(filename, '{bad');
    expect(() => store.read()).toThrow();
    expect(fs.readFileSync(filename, 'utf8')).toBe('{bad');
  });
});
