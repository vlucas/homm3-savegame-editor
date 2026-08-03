import type { LangData } from './lang';
import {
  Artifacts,
  Creatures,
  GameExpansion,
  HEADER_OFFSETS,
  HERO_LANG_MARKERS,
  HERO_OFFSETS,
  Heroes,
  Items,
  Helms,
  Armor,
  Cloak,
  Boots,
  Neck,
  Rings,
  Shields,
  Weapons,
  ItemsCodes,
  Skills,
  Spells,
  Towns,
  WarMachines,
  WeaponsCodes,
  loadAllArtifacts,
  loadHotaItems,
  removeHotaReferenceCodes,
} from './constants';
import { heroNamePattern, indexOfPattern, startsWith } from './bytes';
import { decodeSaveString, encodeWin1251 } from './encoding';
import { Hero } from './hero';
import { gzipCompress, gzipDecompress } from '../wasm/gzip';

export interface Town {
  name: string;
  faction: string;
  factionLang: string;
  position: number;
}

export class Game {
  isHOTA = false;
  versionText = '';
  version: { minor: number; major: number } = { minor: 0, major: 0 };
  expansion: GameExpansion = GameExpansion.RoE;
  lang = 'en';
  bytes: Uint8Array;
  fileName: string;
  mapName = '';
  mapDescription = '';
  heroes: Hero[] = [];
  towns: Town[] = [];

  private heroOffsets = { ...HERO_OFFSETS };
  private headerOffsets = { ...HEADER_OFFSETS };

  constructor(bytes: Uint8Array, fileName: string) {
    this.bytes = bytes;
    this.fileName = fileName;

    const chronPattern = new TextEncoder().encode('HCHRONSVG');
    if (startsWith(bytes, chronPattern)) {
      this.version = { minor: bytes[0x0c + 1], major: bytes[0x08 + 1] };
    } else {
      this.version = { minor: bytes[0x0c], major: bytes[0x08] };
    }

    if (this.version.major >= 44 && this.version.minor >= 5) {
      this.lang = this.searchHeroExt(HERO_LANG_MARKERS.pl) > 0
        ? 'pl'
        : this.searchHeroExt(HERO_LANG_MARKERS.ruHota) > 0 ? 'ru' : 'en';
      this.setHota();
    } else {
      this.lang = this.searchHeroExt(HERO_LANG_MARKERS.pl) > 0
        ? 'pl'
        : this.searchHeroExt(HERO_LANG_MARKERS.ruClassic) > 0 ? 'ru' : 'en';
      this.setClassic();
    }

    this.mapName = this.getStringByOffset(this.headerOffsets.MapName);
    this.mapDescription = this.getStringByOffset(this.headerOffsets.MapName + 2 + this.mapName.length);
    this.versionText = `${this.version.major}.${this.version.minor} (${this.expansionLabel()})`;
    loadAllArtifacts();
    this.searchTowns();
  }

  get offsets() {
    return this.heroOffsets;
  }

  expansionLabel(): string {
    const labels: Record<GameExpansion, string> = {
      [GameExpansion.RoEHD]: 'The Restoration of Erathia (HD Edition)',
      [GameExpansion.RoE]: 'The Restoration of Erathia',
      [GameExpansion.Chronicles]: 'Heroes Chronicles',
      [GameExpansion.AB]: "Armageddon's Blade",
      [GameExpansion.SoD]: 'The Shadow of Death',
      [GameExpansion.WoG]: 'In the Wake of Gods',
      [GameExpansion.HotA]: 'Horn of the Abyss',
    };
    return labels[this.expansion];
  }

  setHota() {
    this.isHOTA = true;
    const withBulwark = this.version.minor >= 10;
    this.expansion = GameExpansion.HotA;
    loadHotaItems(withBulwark);
    this.heroOffsets.SkillSlots = 923;
    this.headerOffsets.MapName = this.version.minor >= 9 ? 0x5f : 0x44;
  }

  setClassic() {
    this.isHOTA = false;
    this.heroOffsets.SkillSlots = 41;
    removeHotaReferenceCodes();
    if (this.version.major === 42 && this.version.minor > 0) this.expansion = GameExpansion.SoD;
    if ((this.version.major === 42 && this.version.minor === 0) || (this.version.major === 43 && this.version.minor >= 5)) {
      this.expansion = GameExpansion.Chronicles;
      this.headerOffsets.MapName = 0x3b;
    }
    if (this.version.major === 18) {
      this.expansion = GameExpansion.RoEHD;
      this.headerOffsets.MapName = 0x36;
    }
  }

  applyLang(data: LangData | null) {
    if (!data) {
      Skills.setLang(null);
      Spells.setLang(null);
      Creatures.setLang(null);
      Heroes.setLang();
      Towns.setLang();
      loadAllArtifacts();
      return;
    }
    Skills.setLang(data.skills ?? null);
    Spells.setLang(data.spells ?? null);
    Creatures.setLang(data.creatures ?? null);
    Artifacts.setLang(data.commonArtifacts ?? null);
    Weapons.setLang(data.weapons ?? null, data.hotaWeapons);
    Shields.setLang(data.shields ?? null, data.hotaShields);
    Helms.setLang(data.helms ?? null, data.hotaHelms);
    Armor.setLang(data.armor ?? null, data.hotaArmor);
    Cloak.setLang(data.cloak ?? null, data.hotaCloak);
    Boots.setLang(data.boots ?? null, data.hotaBoots);
    Neck.setLang(data.neck ?? null, data.hotaNeck);
    Rings.setLang(data.rings ?? null, data.hotaRings);
    Items.setLang(data.items ?? null, data.hotaItems);
    WarMachines.setLang(data.warMachines ?? null);
    Heroes.setLang(data.heroes, data.hotaHeroes, data.uniqueHeroes, data.roeHDHeroes);
    Towns.setLang(data.towns, data.hotaTowns, data.factions, data.hotaFactions);
    loadAllArtifacts();
  }

  private getStringByOffset(offset: number): string {
    return decodeSaveString(this.bytes, offset, this.lang);
  }

  searchHeroExt(name: string): number {
    const pattern = heroNamePattern(name, encodeWin1251);
    return indexOfPattern(this.bytes, pattern);
  }

  searchHero(name: string): boolean {
    const bytePosition = this.searchHeroExt(name);
    if (bytePosition > 0) {
      this.heroes.push(new Hero(name, this, bytePosition));
      return true;
    }
    return false;
  }

  validateData(): string[] {
    const result: string[] = [];
    for (const hero of this.heroes) {
      if (
        hero.equippedArtifacts.Weapon === "Titan's Thunder" &&
        !hero.spellBookExist
      ) {
        result.push(`${hero.name}: must have Spell Book with Titan's Thunder`);
      }
    }
    return result;
  }

  async exportCompressed(): Promise<Uint8Array> {
    const errors = this.validateData();
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return gzipCompress(this.bytes);
  }

  searchTowns() {
    this.towns = [];
    let position = this.bytes.length;
    for (const faction of Towns.factions) {
      for (const town of Towns.get(faction)) {
        const found = this.searchTown(town, faction, position);
        if (found) position = found.position;
      }
    }
  }

  private searchTown(town: string, faction: string, position: number): Town | null {
    const isCyrillic = /\p{Script=Cyrillic}/u.test(town);
    const pattern = isCyrillic ? encodeWin1251(town) : new TextEncoder().encode(town);
    for (let i = position - pattern.length; i > 0; i--) {
      let found = true;
      for (let j = 0; j < pattern.length; j++) {
        if (this.bytes[i + j] !== pattern[j]) {
          found = false;
          break;
        }
      }
      if (!found) continue;
      if (this.towns.some((t) => t.position === i)) return null;
      const prev = this.bytes[i - 1];
      const next = this.bytes[i + pattern.length];
      if (isLetter(prev) || isLetter(next) || prev === 0x20 || next === 0x20) continue;
      const entry: Town = {
        name: town,
        faction,
        factionLang: Towns.getLangFactionValue(faction),
        position: i,
      };
      this.towns.push(entry);
      return entry;
    }
    return null;
  }
}

function isLetter(b: number): boolean {
  return (b >= 65 && b <= 90) || (b >= 97 && b <= 122);
}

export async function loadGame(file: File, langData: LangData | null): Promise<Game> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const isBin = !name.endsWith('.cgm') && !name.endsWith('.gm1') && !name.endsWith('.gm2');
  const bytes = isBin ? buf : await gzipDecompress(buf);
  const game = new Game(bytes, file.name);
  game.applyLang(langData);
  return game;
}

export { gzipDecompress, gzipCompress, ItemsCodes, WeaponsCodes };
