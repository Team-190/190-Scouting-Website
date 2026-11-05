const crypto = require('crypto');

function flatten(data, kind) {
  const records = {};
  const add = (team, match, values) => {
    const entries = Array.isArray(values) ? values : values && typeof values === 'object' ? [values] : [];
    entries.forEach((entry, index) => {
      const { robotPicturePreview, ...withoutImage } = entry;
      const value = kind === 'pit' ? withoutImage : entry;
      const key = JSON.stringify([team, match, String(entry._entryId || index)]);
      records[key] = value;
    });
  };
  for (const [team, value] of Object.entries(data || {})) {
    if (kind === 'pit') add(team, '', value);
    else for (const [match, entries] of Object.entries(value || {})) add(team, match, entries);
  }
  return records;
}

function delta(data, kind, known = {}) {
  const records = flatten(data, kind);
  const upserts = {};
  for (const [key, entry] of Object.entries(records)) {
    const hash = crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex');
    if (known[key] !== hash) upserts[key] = entry;
  }
  return { upserts, deleted: Object.keys(known).filter(key => !(key in records)) };
}
module.exports = { flatten, delta };
