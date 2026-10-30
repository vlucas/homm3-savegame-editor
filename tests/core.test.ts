import { describe, expect, it } from 'vitest';
import { getInt, getUint32, writeInt32, indexOfPattern, heroNamePattern } from '../src/core/bytes';
import { encodeWin1251, decodeWin1251 } from '../src/core/encoding';
import { Skills, Spells, loadAllArtifacts } from '../src/core/constants';

describe('bytes', () => {
  it('reads int16 from 4-byte span like desktop GetInt', () => {
    const buf = new Uint8Array(4);
    writeInt32(buf, 0, 0x12345678);
    expect(getInt(buf, 0)).toBe(0x5678);
  });

  it('reads uint32 for hero experience values above int16 range', () => {
    const buf = new Uint8Array(4);
    writeInt32(buf, 0, 62506);
    expect(getInt(buf, 0)).toBe(-3030);
    expect(getUint32(buf, 0)).toBe(62506);
  });

  it('finds byte patterns', () => {
    const hay = new TextEncoder().encode('hello Christian world');
    const needle = new TextEncoder().encode('Christian');
    expect(indexOfPattern(hay, needle)).toBe(6);
  });

  it('builds 13-byte hero name patterns', () => {
    const p = heroNamePattern('Orrin', encodeWin1251);
    expect(p.length).toBe(13);
    expect(new TextDecoder().decode(p.subarray(0, 5))).toBe('Orrin');
  });
});

describe('encoding', () => {
  it('round-trips windows-1251 cyrillic', () => {
    const text = 'Адела';
    const enc = encodeWin1251(text);
    expect(decodeWin1251(enc)).toBe(text);
  });
});

describe('constants', () => {
  it('loads artifact registry', () => {
    loadAllArtifacts();
    expect(Skills.getByCode(0)).toBe('Pathfinding');
    expect(Spells.getByCode(15)).toBe('Magic Arrow');
  });

  it('lists slot-specific artifacts in alphabetical order', async () => {
    const {
      getArtifactsForGearSlot,
      getInventoryArtifactGroups,
      sortArtifactNames,
    } = await import('../src/core/constants');
    loadAllArtifacts();

    const helms = getArtifactsForGearSlot('Helm');
    expect(helms).toEqual(sortArtifactNames(helms));
    expect(helms).toContain('Helm of Chaos');
    expect(helms).not.toContain("Centaur's Axe");

    const weapons = getArtifactsForGearSlot('Weapon');
    expect(weapons).toContain("Centaur's Axe");
    expect(weapons).not.toContain('Helm of Chaos');

    const items = getArtifactsForGearSlot('Item1');
    expect(items).toContain('Spell Scroll');
    expect(items).not.toContain("Centaur's Axe");

    const groups = getInventoryArtifactGroups();
    expect(groups.map((g) => g.label)).toEqual([
      'Helms', 'Neck', 'Armor', 'Cloak', 'Boots', 'Weapons', 'Shields', 'Rings', 'Miscellaneous', 'Special',
    ]);
    for (const group of groups) {
      expect(group.artifacts).toEqual(sortArtifactNames(group.artifacts));
    }
    expect(groups.find((g) => g.label === 'Special')?.artifacts).toEqual(['Grail']);
  });

  it('maps hero experience to levels using the HoMM3 table', async () => {
    const { experienceForLevel, levelForExperience, EXP_LEVELS } = await import('../src/core/constants');
    expect(Object.keys(EXP_LEVELS).length).toBe(75);
    expect(experienceForLevel(1)).toBe(0);
    expect(experienceForLevel(18)).toBe(57533);
    expect(levelForExperience(0)).toBe(1);
    expect(levelForExperience(999)).toBe(1);
    expect(levelForExperience(1000)).toBe(2);
    expect(levelForExperience(62506)).toBe(18);
    expect(levelForExperience(57532)).toBe(17);
    expect(levelForExperience(57533)).toBe(18);
    expect(levelForExperience(experienceForLevel(40))).toBe(40);
  });

  it('groups creatures by faction in level order with alphabetized neutrals', async () => {
    const { getCreatureGroups, Creatures, loadHotaItems, creatureGroupsForFaction, factionForHeroName, sortArtifactNames, Skills } = await import('../src/core/constants');
    loadAllArtifacts();
    loadHotaItems(true);

    const classic = getCreatureGroups({ isHota: false, withBulwark: true });
    expect(classic.map((g) => g.label)).toEqual([
      'Castle', 'Rampart', 'Tower', 'Inferno', 'Necropolis', 'Dungeon',
      'Stronghold', 'Fortress', 'Conflux', 'Neutral',
    ]);
    expect(classic[0].creatures[0]).toBe('Pikeman');
    expect(classic[0].creatures[13]).toBe('Archangel');
    const neutrals = classic.find((g) => g.label === 'Neutral')!.creatures;
    expect(neutrals).toEqual([...neutrals].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    ));

    const hota = getCreatureGroups({ isHota: true, withBulwark: true });
    expect(hota.map((g) => g.label)).toEqual([
      'Castle', 'Rampart', 'Tower', 'Inferno', 'Necropolis', 'Dungeon',
      'Stronghold', 'Fortress', 'Conflux', 'Cove', 'Factory', 'Bulwark', 'Neutral',
    ]);
    expect(hota.find((g) => g.label === 'Bulwark')!.creatures[0]).toBe('Kobold');
    expect(hota.find((g) => g.label === 'Cove')!.creatures).toContain('Haspid');
    expect(hota.find((g) => g.label === 'Factory')!.creatures[0]).toBe('Halfling');
    expect(hota.find((g) => g.label === 'Neutral')!.creatures).not.toContain('Halfling');
    expect(classic.find((g) => g.label === 'Neutral')!.creatures).toContain('Halfling');
    expect(Creatures.getByCode(186)).toBe('Kobold');

    const coveFirst = creatureGroupsForFaction(hota, 'Cove');
    expect(coveFirst[0].faction).toBe('Cove');
    expect(coveFirst.slice(1).map((group) => group.label)).toEqual(
      hota.filter((group) => group.faction !== 'Cove').map((group) => group.label),
    );
    expect(factionForHeroName('Corkes')).toBe('Cove');
    expect(factionForHeroName('Bertram')).toBe('Factory');
    expect(factionForHeroName('Haugir')).toBe('Bulwark');
    expect(factionForHeroName('Christian')).toBe('Castle');
    expect(factionForHeroName('Beatrice')).toBe('Castle');
    expect(factionForHeroName('Blinky7')).toBeNull();

    const skillNames = sortArtifactNames(Skills.names);
    expect(skillNames[0]).toBe('Air Magic');
    expect(skillNames).toEqual([...skillNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  });
});

describe('present heroes', () => {
  const HERO_POS = 31000;
  const BYTES_LEN = 40000;

  function plantHero(
    bytes: Uint8Array,
    name: string,
    pos = HERO_POS,
    player = 0,
    level = 5,
  ) {
    bytes.set(new TextEncoder().encode(name), pos);
    bytes[pos + -169] = player;
    bytes[pos + -126] = 2;
    bytes[pos + -125] = 0;
    bytes[pos + -124] = 0;
    bytes[pos + -123] = 0;
    bytes[pos + -120] = level;
  }

  function makeGame(bytes: Uint8Array) {
    bytes[0x08] = 42;
    bytes[0x0c] = 5;
    return import('../src/core/game').then(({ Game }) => new Game(bytes, 'test.gm1'));
  }

  it('lists only validated on-map heroes, not bare name tables', async () => {
    const bytes = new Uint8Array(BYTES_LEN);
    bytes.set(new TextEncoder().encode('Orrin'), 200);
    plantHero(bytes, 'Orrin');
    plantHero(bytes, 'Gelu', HERO_POS + 1200, 1);
    const game = await makeGame(bytes);
    const found = game.listPresentHeroes(['Orrin', 'Christian', 'Gelu']);
    expect(found.map((h) => h.label)).toEqual([
      'Orrin (Player 1 (Red))',
      'Gelu (Player 2 (Blue))',
    ]);
  });

  it('groups heroes by player then neutral', async () => {
    const { groupPresentHeroes } = await import('../src/core/game');
    type PresentHero = import('../src/core/game').PresentHero;
    const { NEUTRAL_PLAYER } = await import('../src/core/constants');
    const heroes: PresentHero[] = [
      { name: 'Ziph', player: 1, key: 'Ziph|1', label: 'Ziph (Player 2 (Blue))' },
      { name: 'Anwen', player: 0, key: 'Anwen|0', label: 'Anwen (Player 1 (Red))' },
      { name: 'Gelu', player: 0, key: 'Gelu|0', label: 'Gelu (Player 1 (Red))' },
      { name: 'Pandora', player: NEUTRAL_PLAYER, key: `Pandora|${NEUTRAL_PLAYER}`, label: 'Pandora' },
      { name: 'Mephala', player: NEUTRAL_PLAYER, key: `Mephala|${NEUTRAL_PLAYER}`, label: 'Mephala' },
    ];
    const groups = groupPresentHeroes(heroes);
    expect(groups.map((g) => g.label)).toEqual([
      'Player 1 (Red)',
      'Player 2 (Blue)',
      'Neutral or unclaimed',
    ]);
    expect(groups[0].heroes.map((h) => h.name)).toEqual(['Anwen', 'Gelu']);
    expect(groups[1].heroes.map((h) => h.name)).toEqual(['Ziph']);
    expect(groups[2].heroes.map((h) => h.name)).toEqual(['Mephala', 'Pandora']);
  });

  it('opens multiple different heroes', async () => {
    const bytes = new Uint8Array(BYTES_LEN);
    plantHero(bytes, 'Orrin');
    plantHero(bytes, 'Gelu', HERO_POS + 1200, 1);
    const game = await makeGame(bytes);
    expect(game.searchHero('Orrin')).toBe(true);
    expect(game.searchHero('Gelu')).toBe(true);
    expect(game.heroes).toHaveLength(2);
    expect(game.heroes.map((h) => h.name)).toEqual(['Orrin', 'Gelu']);
  });

  it('finds a second instance of the same hero', async () => {
    const bytes = new Uint8Array(BYTES_LEN);
    plantHero(bytes, 'Yog');
    plantHero(bytes, 'Yog', HERO_POS + 1200);
    const game = await makeGame(bytes);
    expect(game.searchHero('Yog')).toBe(true);
    expect(game.searchHero('Yog')).toBe(true);
    expect(game.heroes).toHaveLength(2);
    expect(game.heroes[0].bytePosition).toBe(HERO_POS);
    expect(game.heroes[1].bytePosition).toBe(HERO_POS + 1200);
  });
});

describe('hero-diff', () => {
  function stubHero(overrides: Record<string, unknown> = {}) {
    const equippedArtifacts = {
      Helm: '-', Neck: '-', Armor: '-', Cloak: '-', Boots: '-',
      Weapon: '-', Shield: '-', LeftRing: '-', RightRing: '-',
      Item1: '-', Item2: '-', Item3: '-', Item4: '-', Item5: '-',
    };
    return {
      attributes: new Int8Array([1, 1, 1, 1]),
      level: 5,
      experience: 1000,
      mana: 10,
      spellBookExist: false,
      skills: Array(8).fill(null),
      skillLevels: new Uint8Array(8),
      creatures: Array(7).fill(null),
      creatureAmounts: new Int32Array(7),
      warMachines: new Set<string>(),
      equippedArtifacts,
      equippedSpellScrolls: {
        Item1: '', Item2: '', Item3: '', Item4: '', Item5: '',
      },
      spellBook: new Set<string>(),
      inventory: [] as string[],
      inventorySpellScrolls: new Map<number, string>(),
      ...overrides,
    };
  }

  it('reports spellbook, skill, and artifact adds', async () => {
    const { snapshotHero, diffHero } = await import('../src/core/hero-diff');
    const baselineHero = stubHero({
      skills: ['Navigation', null, null, null, null, null, null, null],
      skillLevels: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]),
    }) as never;
    const baseline = snapshotHero(baselineHero);

    const current = stubHero({
      spellBookExist: true,
      skills: ['Logistics', null, null, null, null, null, null, null],
      skillLevels: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]),
      equippedArtifacts: {
        Helm: '-', Neck: '-', Armor: '-', Cloak: '-', Boots: 'Boots of Speed',
        Weapon: '-', Shield: '-', LeftRing: '-', RightRing: '-',
        Item1: '-', Item2: '-', Item3: '-', Item4: '-', Item5: '-',
      },
    }) as never;

    const lines = diffHero(baseline, current);
    expect(lines.map((l) => `${l.category}: ${l.text}`)).toEqual([
      'Item: Add Spellbook',
      'Skill: Add Logistics (Basic)',
      'Skill: Remove Navigation (Basic)',
      "Artifact: Add 'Boots of Speed' (Feet)",
    ]);
  });

  it('reports skill level changes', async () => {
    const { snapshotHero, diffHero } = await import('../src/core/hero-diff');
    const baseline = snapshotHero(stubHero({
      skills: ['Logistics', null, null, null, null, null, null, null],
      skillLevels: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]),
    }) as never);
    const current = stubHero({
      skills: ['Logistics', null, null, null, null, null, null, null],
      skillLevels: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0]),
    }) as never;
    expect(diffHero(baseline, current).map((l) => l.text)).toEqual([
      'Change Logistics (Basic → Expert)',
    ]);
  });
});

describe('town-diff', () => {
  it('reports owner, garrison, building, and spell changes', async () => {
    const { snapshotTown, diffTown } = await import('../src/core/town-diff');
    const { buildingDef, TOWN_BIT } = await import('../src/core/town-constants');
    const { playerFlagTitle } = await import('../src/ui/PlayerFlag');
    let owner = 0;
    let hall = 1;
    let tavern = true;
    let creatures: (string | null)[] = [null, null, null, null, null, null, null];
    let amounts = [0, 0, 0, 0, 0, 0, 0];
    let spells: string[] = [];
    const tavernDef = buildingDef('Tavern', TOWN_BIT.TAVERN);
    const town = {
      get owner() { return owner; },
      faction: 'Castle',
      get creatures() { return creatures; },
      get creatureAmounts() { return amounts; },
      getBuildingChainLevel: (chain: { id: string }) => (chain.id === 'hall' ? hall : 0),
      isBuildingBuilt: (def: { byte: number; bit: number }) => (
        def.byte === tavernDef.byte && def.bit === tavernDef.bit ? tavern : false
      ),
      spellNames: () => spells,
    };
    const baseline = snapshotTown(town as never);
    owner = 4;
    hall = 3;
    tavern = false;
    creatures = ['Pikeman', null, null, null, null, null, null];
    amounts = [20, 0, 0, 0, 0, 0, 0];
    spells = ['Magic Arrow'];

    expect(diffTown(baseline, town as never).map((line) => `${line.category}: ${line.text}`)).toEqual([
      'Owner: Change Owner (Player 1 (Red) → Player 5 (Orange))',
      'Garrison: Add 20 Pikeman',
      'Building: Change Hall (Town Hall → Capitol)',
      'Building: Remove Tavern',
      'Spell: Add Magic Arrow',
    ]);
    expect(playerFlagTitle(0)).toBe('Player 1 - Red');
    expect(playerFlagTitle(4)).toBe('Player 5 - Orange');
    expect(playerFlagTitle(255)).toBe('Neutral');
  });
});

describe('gzip wasm', () => {
  it('compresses and decompresses raw save bytes', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const { loadGzipModuleFromBytes, gzipCompressWithModule, gzipDecompressWithModule } = await import('../src/wasm/gzip');
    const wasmPath = join(dirname(fileURLToPath(import.meta.url)), '../public/wasm/homm3-gzip.wasm');
    const mod = await loadGzipModuleFromBytes(readFileSync(wasmPath).buffer);
    const original = new Uint8Array(256);
    for (let i = 0; i < original.length; i++) original[i] = i & 0xff;
    original[0x08] = 42;
    original[0x0c] = 5;
    const compressed = await gzipCompressWithModule(mod, original);
    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);
    const restored = await gzipDecompressWithModule(mod, compressed);
    expect(restored).toEqual(original);
  });
});
