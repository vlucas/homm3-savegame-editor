/**
 * One-time generator: extracts lookup tables from reference/Heroes3Editor/Models/Constants.cs
 * Run: node scripts/generate-constants.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const csPath = path.join(root, 'reference/Heroes3Editor/Models/Constants.cs');
const cs = fs.readFileSync(csPath, 'utf8');

function parseDictKey(key) {
  key = key.trim();
  if (key.startsWith('Empty')) return 0xff;
  if (key === 'BulwarkStartCode' || key.endsWith('.BulwarkStartCode')) return 186;
  if (key === 'BALLISTA' || key.endsWith('.BALLISTA')) return 0x04;
  if (key === 'TitansLightningBolt' || key.endsWith('.TitansLightningBolt')) return 57;
  if (key.includes('.')) return NaN;
  if (key.startsWith('0x') || key.startsWith('0X')) return parseInt(key, 16);
  const num = Number(key);
  return Number.isNaN(num) ? NaN : num;
}

function parseDictEntries(block) {
  const entries = [];
  const re = /\{([^,]+),\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  let m;
  while ((m = re.exec(block))) {
    const num = parseDictKey(m[1]);
    if (Number.isNaN(num)) continue;
    entries.push([num, m[2]]);
  }
  return entries;
}

/** Parse `{ level, xp }` int dictionaries such as ExpLevels. */
function parseIntDictEntries(block) {
  const entries = [];
  const re = /\{\s*(\d+)\s*,\s*(-?\d+)\s*\}/g;
  let m;
  while ((m = re.exec(block))) {
    entries.push([Number(m[1]), Number(m[2])]);
  }
  return entries;
}

function extractClassSection(className) {
  const re = new RegExp(`public class ${className}\\b([\\s\\S]*?)(?=\\n    public class )`, 'm');
  const m = cs.match(re);
  return m ? m[1] : '';
}

function extractClassBlock(className) {
  const section = extractClassSection(className);
  const m = section.match(/NamesByCode = new Dictionary<byte, string>\s*\{([\s\S]*?)\};/);
  return m ? m[1] : '';
}

function extractHotaBlock(className) {
  const section = extractClassSection(className);
  const m = section.match(/HOTANamesByCode = new Dictionary<byte, string>\s*\{([\s\S]*?)\};/);
  return m ? m[1] : '';
}

function toRecord(entries) {
  const o = {};
  for (const [k, v] of entries) o[k] = v;
  return o;
}

const classes = [
  'Skills', 'SkillLevels', 'Weapons', 'Shields', 'Helms', 'Armor', 'Cloak',
  'Boots', 'Neck', 'Rings', 'Items', 'WarMachines', 'Artifacts', 'Spells', 'Creatures',
];

const generated = {};
for (const cls of classes) {
  generated[cls] = {
    namesByCode: toRecord(parseDictEntries(extractClassBlock(cls))),
    hotaNamesByCode: toRecord(parseDictEntries(extractHotaBlock(cls))),
  };
}

function extractStringArray(name) {
  const re = new RegExp(`private static readonly string\\[\\] ${name} =\\s*\\[([\\s\\S]*?)\\];`, 'm');
  const m = cs.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

// Heroes list
const heroesMatch = cs.match(/private static readonly List<string> _heroes =\s*\[([\s\S]*?)\];/);
const heroes = [...heroesMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const heroesHota = [
  ...extractStringArray('_heroesHota'),
  ...extractStringArray('_heroesHotaBulwark'),
];

// Exp levels (level -> minimum experience)
const expMatch = cs.match(/public static Dictionary<byte, int> ExpLevels[\s\S]*?=\s*new\(\)\s*\{([\s\S]*?)\};/);
const expLevels = toRecord(parseIntDictEntries(expMatch?.[1] ?? ''));

// ItemSpells - simplified extraction
const itemSpellsBlock = cs.match(/public static readonly Dictionary<int, string\[\]> ItemSpells = new\(\)\s*\{([\s\S]*?)\};\s*\n\s*public const byte TitansLightningBolt/s)?.[1] ?? '';
const itemSpells = {};
const spellGroupRe = /\{\s*(?:Items\.(\w+)|Helms\.(\w+)|Weapons\.(\w+))\s*,\s*\[([\s\S]*?)\]\s*\}/g;
let sg;
while ((sg = spellGroupRe.exec(itemSpellsBlock))) {
  const keyName = sg[1] || sg[2] || sg[3];
  const spells = [...sg[4].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  itemSpells[keyName] = spells;
}

/** Spell levels per https://heroes.thelazy.net/index.php/List_of_spells */
const spellLevelByCode = {
  0: 1, 1: 2, 2: 2, 3: 1, 4: 2, 5: 1, 6: 5, 7: 4, 8: 5, 9: 4,
  10: 2, 11: 3, 12: 3, 13: 2, 14: 3, 15: 1, 16: 2, 17: 2, 18: 5, 19: 4,
  20: 3, 21: 3, 22: 4, 23: 4, 24: 2, 25: 3, 26: 4, 27: 1, 28: 3, 29: 4,
  30: 2, 31: 1, 32: 1, 33: 3, 34: 3, 35: 1, 36: 5, 37: 1, 38: 4, 39: 3,
  40: 5, 41: 1, 42: 1, 43: 1, 44: 2, 45: 2, 46: 1, 47: 2, 48: 4, 49: 3,
  50: 4, 51: 2, 52: 3, 53: 1, 54: 1, 55: 4, 56: 4, 57: 5, 58: 4, 59: 4,
  60: 3, 61: 3, 62: 2, 63: 3, 64: 2, 65: 4, 66: 5, 67: 5, 68: 5, 69: 5,
};

const outDir = path.join(root, 'src/core/generated');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'lookup-data.json'),
  JSON.stringify({ classes: generated, heroes, heroesHota, expLevels, itemSpells, spellLevelByCode }, null, 2),
);
console.log('Wrote', path.join(outDir, 'lookup-data.json'));
