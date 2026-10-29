import { describe, expect, it } from 'vitest';
import { guildSpellCapForLevel, guildSpellCapacity, TOWN_LIBRARY_BUILDING, TOWN_MAGE_GUILD_BUILDINGS } from '../src/core/town-constants';
import { getSpellLevel } from '../src/core/constants';

describe('town mage guild spell caps', () => {
  it('uses 5/4/3/2/1 without Library', () => {
    expect([1, 2, 3, 4, 5].map((level) => guildSpellCapForLevel(level, false))).toEqual([5, 4, 3, 2, 1]);
    expect(guildSpellCapacity(5, false)).toBe(15);
    expect(guildSpellCapacity(3, false)).toBe(12);
  });

  it('adds one slot per level when Library is present', () => {
    expect([1, 2, 3, 4, 5].map((level) => guildSpellCapForLevel(level, true))).toEqual([6, 5, 4, 3, 2]);
    expect(guildSpellCapacity(5, true)).toBe(20);
  });
});

describe('town spell selection rules', () => {
  it('keeps Library building bit aligned with HotA special / mage guild defs', () => {
    // MG1–5 are bits 0–4; Tower Library is Special 6 at bit 22; Grail is bit 26.
    expect(TOWN_MAGE_GUILD_BUILDINGS).toHaveLength(5);
    expect(TOWN_MAGE_GUILD_BUILDINGS[0]).toEqual({ label: 'Mage Guild 1', byte: 0, bit: 0 });
    expect(TOWN_MAGE_GUILD_BUILDINGS[4]).toEqual({ label: 'Mage Guild 5', byte: 0, bit: 4 });
    expect(TOWN_LIBRARY_BUILDING).toEqual({ label: 'Library', byte: 2, bit: 6 });
  });

  it('classifies common guild spells by level', () => {
    expect(getSpellLevel('Magic Arrow')).toBe(1);
    expect(getSpellLevel('Lightning Bolt')).toBe(2);
    expect(getSpellLevel('Fireball')).toBe(3);
    expect(getSpellLevel('Town Portal')).toBe(4);
    expect(getSpellLevel('Dimension Door')).toBe(5);
  });
});
