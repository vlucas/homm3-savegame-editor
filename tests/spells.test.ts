import { describe, expect, it } from 'vitest';
import lookupData from '../src/core/generated/lookup-data.json';
import { getSpellGroupsByLevel, sortArtifactNames, Spells } from '../src/core/constants';

/** Levels from https://heroes.thelazy.net/index.php/List_of_spells */
const SPELL_LEVEL_BY_NAME: Record<string, number> = {
  'Summon Boat': 1,
  'Scuttle Boat': 2,
  Visions: 2,
  'View Earth': 1,
  Disguise: 2,
  'View Air': 1,
  Fly: 5,
  'Water Walk': 4,
  'Dimension Door': 5,
  'Town Portal': 4,
  Quicksand: 2,
  'Land Mine': 3,
  'Force Field': 3,
  'Fire Wall': 2,
  Earthquake: 3,
  'Magic Arrow': 1,
  'Ice Bolt': 2,
  'Lightning Bolt': 2,
  Implosion: 5,
  'Chain Lightning': 4,
  'Frost Ring': 3,
  Fireball: 3,
  Inferno: 4,
  'Meteor Shower': 4,
  'Death Ripple': 2,
  'Destroy Undead': 3,
  Armageddon: 4,
  Shield: 1,
  'Air Shield': 3,
  'Fire Shield': 4,
  'Protection from Air': 2,
  'Protection from Fire': 1,
  'Protection from Water': 1,
  'Protection from Earth': 3,
  'Anti-Magic': 3,
  Dispel: 1,
  'Magic Mirror': 5,
  Cure: 1,
  Resurrection: 4,
  'Animate Dead': 3,
  Sacrifice: 5,
  Bless: 1,
  Curse: 1,
  Bloodlust: 1,
  Precision: 2,
  Weakness: 2,
  'Stone Skin': 1,
  'Disrupting Ray': 2,
  Prayer: 4,
  Mirth: 3,
  Sorrow: 4,
  Fortune: 2,
  Misfortune: 3,
  Haste: 1,
  Slow: 1,
  Slayer: 4,
  Frenzy: 4,
  "Titan's Lightning Bolt": 5,
  Counterstrike: 4,
  Berserk: 4,
  Hypnotize: 3,
  Forgetfulness: 3,
  Blind: 2,
  Teleport: 3,
  'Remove Obstacle': 2,
  Clone: 4,
  'Fire Elemental': 5,
  'Earth Elemental': 5,
  'Water Elemental': 5,
  'Air Elemental': 5,
};

describe('spell levels', () => {
  it('maps every known spell code to the wiki level', () => {
    for (const [code, name] of Object.entries(lookupData.classes.Spells.namesByCode)) {
      expect(SPELL_LEVEL_BY_NAME[name], `${name} (#${code})`).toBeDefined();
    }
    expect(Object.keys(lookupData.classes.Spells.namesByCode)).toHaveLength(70);
  });

  it('groups all spells by level without omissions', () => {
    const groups = getSpellGroupsByLevel(Spells.originalNames);
    const grouped = new Set(groups.flatMap((g) => g.spells));
    expect(grouped.size).toBe(70);
    for (const name of Spells.originalNames) {
      const expected = SPELL_LEVEL_BY_NAME[name];
      const group = groups.find((g) => g.spells.includes(name));
      expect(group?.level, name).toBe(expected);
    }
  });

  it('sorts spells alphabetically within each level', () => {
    const groups = getSpellGroupsByLevel(Spells.originalNames);
    for (const group of groups) {
      expect(group.spells).toEqual(sortArtifactNames(group.spells));
    }
  });
});
