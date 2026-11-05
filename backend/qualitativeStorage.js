const fs = require("fs");
const path = require("path");

// Decode the previous CSV format only when migrating existing robot files.
function decode(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('Unterminated CSV cell');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const fields = rows.shift() || [];
  return rows.filter(row => row.some(Boolean)).map(row => {
    if (row.length !== fields.length) throw new Error('Invalid scouting CSV row');
    return Object.fromEntries(fields.flatMap((field, i) =>
      row[i] === '' ? [] : [[field, JSON.parse(row[i])]]));
  });
}

function component(value) {
  const text = String(value);
  if (!/^[a-zA-Z0-9_-]+$/.test(text) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(text)) {
    throw new Error(`Invalid scouting storage identifier: ${text}`);
  }
  return text;
}

function createStore(dataDir = path.join(__dirname, 'data')) {
  const root = path.join(dataDir, 'qualitativeScoutingData');
  const legacy = path.join(dataDir, 'qualitativeScoutingData.json');
  function files(extension = '.json') {
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).flatMap(event =>
      fs.readdirSync(path.join(root, event.name), { withFileTypes: true }).filter(m => m.isDirectory()).flatMap(match =>
        fs.readdirSync(path.join(root, event.name, match.name)).filter(f => f.endsWith(extension)).map(file => ({
          event: event.name, match: match.name, team: file.slice(0, -extension.length),
          filename: path.join(root, event.name, match.name, file),
        }))));
  }
  function write(data) {
    // Validate and serialize everything before making any changes.
    const desired = new Map();
    for (const [event, teams] of Object.entries(data)) {
      for (const [team, matches] of Object.entries(teams)) {
        for (const [match, value] of Object.entries(matches)) {
          const entries = Array.isArray(value) ? value : [value];
          if (!entries.length) continue;
          const filename = path.join(root, component(event), component(match), `${component(team)}.json`);
          desired.set(filename, JSON.stringify(entries, null, 2) + '\n');
        }
      }
    }
    for (const event of Object.keys(data)) component(event);
    for (const event of Object.keys(data)) fs.mkdirSync(path.join(root, event), { recursive: true });
    for (const [filename, contents] of desired) {
      if (fs.existsSync(filename) && fs.readFileSync(filename, 'utf8') === contents) continue;
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      const temp = `${filename}.tmp`;
      fs.writeFileSync(temp, contents, 'utf8');
      fs.renameSync(temp, filename);
    }
    for (const file of files()) {
      if (!desired.has(file.filename)) fs.unlinkSync(file.filename);
    }
  }
  function migrateCsv() {
    for (const file of files('.csv')) {
      const entries = decode(fs.readFileSync(file.filename, 'utf8'));
      const target = file.filename.slice(0, -4) + '.json';
      if (!fs.existsSync(target)) {
        fs.writeFileSync(target + '.tmp', JSON.stringify(entries, null, 2) + '\n', 'utf8');
        fs.renameSync(target + '.tmp', target);
      }
      const backup = path.join(dataDir, 'qualitativeScoutingCsvBackup', file.event, file.match, path.basename(file.filename));
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.renameSync(file.filename, backup);
    }
  }
  function migrate() {
    migrateCsv();
    if (!fs.existsSync(legacy)) return;
    const backup = `${legacy}.backup`;
    if (fs.existsSync(backup)) throw new Error('Both legacy scouting JSON and its backup exist; resolve before migration');
    const data = JSON.parse(fs.readFileSync(legacy, 'utf8'));
    write(data);
    fs.renameSync(legacy, backup);
  }
  function read() {
    migrate();
    const data = {};
    if (fs.existsSync(root)) {
      for (const event of fs.readdirSync(root, { withFileTypes: true })) {
        if (event.isDirectory()) data[event.name] = {};
      }
    }
    for (const file of files()) {
      data[file.event] ||= {};
      data[file.event][file.team] ||= {};
      data[file.event][file.team][file.match] = JSON.parse(fs.readFileSync(file.filename, 'utf8'));
    }
    return data;
  }
  return { read, write: data => { migrate(); write(data); return true; } };
}
module.exports = { createStore };
