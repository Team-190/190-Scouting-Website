// The wire representation uses one stable key and SHA-256 revision per submission.
export function flattenScouting(data, kind) {
  const records = {};
  const add = (team, match, values) => {
    const entries = Array.isArray(values) ? values : values && typeof values === 'object' ? [values] : [];
    entries.forEach((entry, index) => {
      const { robotPicturePreview, ...withoutImage } = entry;
      records[JSON.stringify([team, match, String(entry._entryId || index)])] = kind === 'pit' ? withoutImage : entry;
    });
  };
  for (const [team, value] of Object.entries(data || {})) {
    if (kind === 'pit') add(team, '', value);
    else for (const [match, entries] of Object.entries(value || {})) add(team, match, entries);
  }
  return records;
}

export async function scoutingRevisions(records) {
  const known = {};
  for (const [key, entry] of Object.entries(records)) {
    const bytes = new TextEncoder().encode(JSON.stringify(entry));
    if (!globalThis.crypto?.subtle) { known[key] = ''; continue; }
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    known[key] = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return known;
}

export function applyScoutingDelta(records, delta, kind) {
  const merged = { ...records, ...delta.upserts };
  for (const key of delta.deleted) delete merged[key];
  const data = {};
  for (const [key, entry] of Object.entries(merged)) {
    const [team, match] = JSON.parse(key);
    if (kind === 'pit') (data[team] ||= []).push(entry);
    else {
      data[team] ||= {};
      (data[team][match] ||= []).push(entry);
    }
  }
  return data;
}
