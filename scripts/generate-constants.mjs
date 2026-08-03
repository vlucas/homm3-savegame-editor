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

function parseDictEntries(block) {
  const entries = [];
  const re = /\{([^,]+),\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  let m;
  while ((m = re.exec(block))) {
    let key = m[1].trim();
    if (key.startsWith('Empty')) key = '0xFF';
    if (key.includes('.')) continue; // skip const refs in artifact info
    const num = key.startsWith('0x') || key.startsWith('0X')
      ? parseInt(key, 16)
      : Number(key);
    if (Number.isNaN(num)) continue;
    entries.push([num, m[2]]);
  }
  return entries;
}

function extractClassBlock(className) {
  const re = new RegExp(`public class ${className}[\\s\\S]*?NamesByCode = new Dictionary<byte, string>[\\s\\S]*?\\{([\\s\\S]*?)\\};`, 'm');
  const m = cs.match(re);
  return m ? m[1] : '';
}

function extractHotaBlock(className) {
  const re = new RegExp(`public class ${className}[\\s\\S]*?HOTANamesByCode = new Dictionary<byte, string>[\\s\\S]*?\\{([\\s\\S]*?)\\};`, 'm');
  const m = cs.match(re);
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

// Heroes list
const heroesMatch = cs.match(/private static readonly List<string> _heroes =\s*\[([\s\S]*?)\];/);
const heroes = [...heroesMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const heroesHotaMatch = cs.match(/private static readonly List<string> _heroesHota =\s*\[([\s\S]*?)\];/);
const heroesHota = heroesHotaMatch ? [...heroesHotaMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];

// Exp levels
const expMatch = cs.match(/public static Dictionary<byte, int> ExpLevels[\s\S]*?=\s*new\(\)\s*\{([\s\S]*?)\};/);
const expLevels = toRecord(parseDictEntries(expMatch[1]));

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

const outDir = path.join(root, 'src/core/generated');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'lookup-data.json'),
  JSON.stringify({ classes: generated, heroes, heroesHota, expLevels, itemSpells }, null, 2),
);
console.log('Wrote', path.join(outDir, 'lookup-data.json'));
