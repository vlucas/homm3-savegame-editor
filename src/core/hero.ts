import type { Game } from './game';
import {
  Artifacts,
  Creatures,
  EMPTY,
  GEAR_SLOTS,
  getItemSpellsByCode,
  ItemsCodes,
  ON,
  Skills,
  Spells,
  WarMachines,
  type GearSlot,
} from './constants';
import { getInt, writeInt32 } from './bytes';

export class Hero {
  readonly name: string;
  readonly bytePosition: number;
  level: number;
  mana: number;
  experience: number;
  attributes: Int8Array = new Int8Array(4);
  numOfSkills = 0;
  skills: (string | null)[] = Array(8).fill(null);
  skillLevels = new Uint8Array(8);
  spells = new Set<string>();
  spellBook = new Set<string>();
  spellBookExist = false;
  creatures: (string | null)[] = Array(7).fill(null);
  creatureAmounts = new Int32Array(7);
  warMachines = new Set<string>();
  equippedArtifacts: Record<GearSlot, string> = {
    Helm: '-', Neck: '-', Armor: '-', Cloak: '-', Boots: '-',
    Weapon: '-', Shield: '-', LeftRing: '-', RightRing: '-',
    Item1: '-', Item2: '-', Item3: '-', Item4: '-', Item5: '-',
  };
  equippedSpellScrolls: Record<string, string> = {
    Item1: '', Item2: '', Item3: '', Item4: '', Item5: '',
  };
  inventorySpellScrolls = new Map<number, string>();
  inventory: string[] = [];
  game: Game;

  constructor(name: string, game: Game, bytePosition: number) {
    this.name = name;
    this.game = game;
    this.bytePosition = bytePosition;
    const o = game.offsets;
    const b = game.bytes;

    this.level = b[bytePosition + o.HeroLevel];
    this.mana = b[bytePosition + o.ManaPoints];
    this.experience = getInt(b, bytePosition + o.Experience);

    for (let i = 0; i < 4; i++) {
      this.attributes[i] = b[bytePosition + o.Attributes + i] << 24 >> 24;
    }

    this.numOfSkills = b[bytePosition + o.NumOfSkills];
    for (let i = 0; i < Skills.names.length; i++) {
      const slotIndex = b[bytePosition + o.SkillSlots + i];
      if (slotIndex !== 0 && slotIndex <= 8) {
        this.skills[slotIndex - 1] = Skills.getByCode(i);
        this.skillLevels[slotIndex - 1] = b[bytePosition + o.Skills + i];
      }
    }

    this.spellBookExist = b[bytePosition + o.SpellBookSlot] === ON;
    for (let i = 0; i < 70; i++) {
      if (b[bytePosition + o.Spells + i] === 1) this.spells.add(Spells.getByCode(i));
      if (b[bytePosition + o.SpellBook + i] === 1) this.spellBook.add(Spells.getByCode(i));
    }

    for (let i = 0; i < 7; i++) {
      const code = b[bytePosition + o.Creatures + i * 4];
      if (code !== EMPTY) {
        this.creatures[i] = Creatures.getByCode(code);
        this.creatureAmounts[i] = getInt(b, bytePosition + o.CreatureAmounts + i * 4);
      }
    }

    for (const wm of WarMachines.originalNames) {
      if (b[bytePosition + o[wm as keyof typeof o]] === WarMachines.getCode(wm)) {
        this.warMachines.add(wm);
      }
    }

    for (const gear of GEAR_SLOTS) {
      const pos = bytePosition + o[gear];
      const code = b[pos];
      if (code === EMPTY) continue;
      this.equippedArtifacts[gear] = Artifacts.getByCode(code);
      if (gear.startsWith('Item') && code === ItemsCodes.SpellScroll) {
        const spellCode = b[pos + 4];
        this.equippedSpellScrolls[gear] = Spells.getByCode(spellCode);
      }
    }

    const invPos = bytePosition + o.Inventory;
    for (let i = 0; i < 64; i++) {
      const code = b[invPos + i * 8];
      if (code === EMPTY || code === ON) continue;
      this.inventory.push(Artifacts.getByCode(code));
      if (code === ItemsCodes.SpellScroll) {
        this.inventorySpellScrolls.set(i, Spells.getByCode(b[invPos + i * 8 + 4]));
      }
    }
  }

  updateAttribute(i: number, value: number) {
    this.attributes[i] = value;
    this.game.bytes[this.bytePosition + this.game.offsets.Attributes + i] = value & 0xff;
  }

  updateSkill(slot: number, skill: string | null) {
    const o = this.game.offsets;
    if (skill === null) {
      const old = this.skills[slot];
      if (!old) return;
      this.skills[slot] = null;
      this.skillLevels[slot] = 0;
      const oldCode = Skills.getCode(old);
      this.game.bytes[this.bytePosition + o.Skills + oldCode] = 0;
      this.game.bytes[this.bytePosition + o.SkillSlots + oldCode] = 0;
      this.numOfSkills--;
      this.game.bytes[this.bytePosition + o.NumOfSkills] = this.numOfSkills;
      return;
    }
    if (slot < 0 || slot > this.numOfSkills) return;
    if (this.skills.includes(skill)) return;

    let skillLevel = 1;
    if (slot < this.numOfSkills) {
      const old = this.skills[slot]!;
      const oldCode = Skills.getCode(old);
      skillLevel = this.game.bytes[this.bytePosition + o.Skills + oldCode];
      this.game.bytes[this.bytePosition + o.Skills + oldCode] = 0;
      this.game.bytes[this.bytePosition + o.SkillSlots + oldCode] = 0;
    }

    const code = Skills.getCode(skill);
    this.skills[slot] = skill;
    this.skillLevels[slot] = skillLevel;
    this.game.bytes[this.bytePosition + o.Skills + code] = skillLevel;
    this.game.bytes[this.bytePosition + o.SkillSlots + code] = slot + 1;
    if (slot === this.numOfSkills) {
      this.numOfSkills++;
      this.game.bytes[this.bytePosition + o.NumOfSkills] = this.numOfSkills;
    }
  }

  updateSkillLevel(slot: number, level: number) {
    if (slot < 0 || slot > this.numOfSkills || level < 1 || level > 3) return;
    const skill = this.skills[slot];
    if (!skill) return;
    this.skillLevels[slot] = level;
    this.game.bytes[this.bytePosition + this.game.offsets.Skills + Skills.getCode(skill)] = level;
  }

  addSpellToSpellBook(spell: string) {
    if (!this.spellBook.add(spell)) return;
    const pos = this.bytePosition + this.game.offsets.SpellBook + Spells.getCode(spell);
    this.game.bytes[pos] = 1;
  }

  addSpellToSpells(spell: string) {
    if (!this.spells.add(spell)) return;
    this.game.bytes[this.bytePosition + this.game.offsets.Spells + Spells.getCode(spell)] = 1;
  }

  removeSpellFromSpells(spell: string) {
    if (!this.spells.delete(spell)) return;
    this.game.bytes[this.bytePosition + this.game.offsets.Spells + Spells.getCode(spell)] = 0;
  }

  removeSpellFromSpellBook(spell: string) {
    if (!this.spellBook.delete(spell)) return;
    this.game.bytes[this.bytePosition + this.game.offsets.SpellBook + Spells.getCode(spell)] = 0;
  }

  toggleSpellBook(enable: boolean) {
    const pos = this.bytePosition + this.game.offsets.SpellBookSlot;
    const v = enable ? ON : EMPTY;
    this.game.bytes[pos] = v;
    this.game.bytes[pos + 1] = v;
    this.game.bytes[pos + 2] = v;
    this.game.bytes[pos + 3] = v;
    this.spellBookExist = enable;
  }

  updateCreature(i: number, creature: string | null) {
    const o = this.game.offsets;
    if (creature === null) {
      this.creatureAmounts[i] = 0;
      this.updateCreatureAmount(i, 0);
      this.creatures[i] = null;
      for (let j = 0; j < 4; j++) this.game.bytes[this.bytePosition + o.Creatures + i * 4 + j] = EMPTY;
      return;
    }
    if (!this.creatures[i]) {
      this.creatureAmounts[i] = 1;
      this.updateCreatureAmount(i, 1);
    }
    this.creatures[i] = creature;
    this.game.bytes[this.bytePosition + o.Creatures + i * 4] = Creatures.getCode(creature);
    for (let j = 1; j < 4; j++) this.game.bytes[this.bytePosition + o.Creatures + i * 4 + j] = ON;
  }

  updateCreatureAmount(i: number, amount: number) {
    this.creatureAmounts[i] = amount;
    writeInt32(this.game.bytes, this.bytePosition + this.game.offsets.CreatureAmounts + i * 4, amount);
  }

  addWarMachine(warMachine: string) {
    if (!this.warMachines.add(warMachine)) return;
    const pos = this.bytePosition + this.game.offsets[warMachine as keyof typeof this.game.offsets];
    this.game.bytes[pos] = WarMachines.getCode(warMachine);
    for (let j = 1; j < 4; j++) this.game.bytes[pos + j] = ON;
  }

  removeWarMachine(warMachine: string) {
    if (!this.warMachines.delete(warMachine)) return;
    const pos = this.bytePosition + this.game.offsets[warMachine as keyof typeof this.game.offsets];
    for (let j = 0; j < 4; j++) this.game.bytes[pos + j] = EMPTY;
  }

  updateEquippedArtifact(gear: GearSlot, artifact: string, spell?: string) {
    const pos = this.bytePosition + this.game.offsets[gear];
    const equipped = this.equippedArtifacts[gear];
    const equippedKey = Artifacts.getCode(Artifacts.getOriginalValue(equipped));

    if (artifact !== '-') {
      this.equippedArtifacts[gear] = artifact;
      const artKey = Artifacts.getCode(artifact);
      this.game.bytes[pos] = artKey;
      for (let j = 1; j < 4; j++) this.game.bytes[pos + j] = ON;

      if (artKey === ItemsCodes.SpellScroll) {
        if (!spell) throw new Error('Spell required for scroll');
        this.game.bytes[pos + 4] = Spells.getCode(spell);
        for (let j = 5; j < 8; j++) this.game.bytes[pos + j] = ON;
        this.equippedSpellScrolls[gear] = spell;
        this.addSpellToSpellBook(spell);
      }

      const tomeSpells = getItemSpellsByCode().get(artKey);
      if (tomeSpells) {
        for (const sc of tomeSpells) {
          this.addSpellToSpellBook(Spells.getByCode(sc));
        }
      }
    } else {
      this.updateRemovedSpells(equippedKey, gear);
      this.equippedArtifacts[gear] = '-';
      for (let j = 0; j < 4; j++) this.game.bytes[pos + j] = EMPTY;
      if (gear.startsWith('Item')) {
        this.equippedSpellScrolls[gear] = '';
        for (let j = 4; j < 8; j++) this.game.bytes[pos + j] = EMPTY;
      }
    }
  }

  private updateRemovedSpells(equippedArtKey: number, gear: string) {
    const equippedSpells = this.getAllEquippedSpells(gear);
    const tomeSpells = getItemSpellsByCode().get(equippedArtKey);
    if (tomeSpells) {
      for (const sc of tomeSpells) {
        const orig = Spells.getByCode(sc);
        if (equippedSpells.includes(orig)) continue;
        this.removeSpellFromSpellBook(orig);
      }
    }
    if (gear.startsWith('Item') && equippedArtKey === ItemsCodes.SpellScroll) {
      const scroll = this.equippedSpellScrolls[gear];
      const orig = Spells.getOriginalValue(scroll);
      if (!equippedSpells.includes(orig)) this.removeSpellFromSpellBook(scroll);
    }
  }

  private getAllEquippedSpells(exceptGear?: string): string[] {
    const spells: string[] = [];
    for (const [gear, art] of Object.entries(this.equippedArtifacts) as [GearSlot, string][]) {
      if (exceptGear && gear === exceptGear) continue;
      if (art === '-') continue;
      const artKey = Artifacts.getCode(Artifacts.getOriginalValue(art));
      const tome = getItemSpellsByCode().get(artKey);
      if (tome) spells.push(...tome.map((c) => Spells.getByCode(c)));
      if (gear.startsWith('Item') && artKey === ItemsCodes.SpellScroll) {
        spells.push(Spells.getOriginalValue(this.equippedSpellScrolls[gear]));
      }
    }
    return [...new Set(spells)];
  }

  updateInventory(newArtifact?: string, spell?: string) {
    if (newArtifact) {
      this.inventory.push(newArtifact);
      const artKey = Artifacts.getCode(newArtifact);
      if (artKey === ItemsCodes.SpellScroll && spell) {
        this.inventorySpellScrolls.set(this.inventory.length - 1, spell);
      }
    }
    const o = this.game.offsets;
    for (let i = 0; i < 64; i++) {
      const pos = this.bytePosition + o.Inventory + i * 8;
      if (this.inventory.length > i) {
        const artifact = this.inventory[i];
        const artKey = Artifacts.getCode(artifact);
        this.game.bytes[pos] = artKey;
        for (let j = 1; j < 8; j++) this.game.bytes[pos + j] = ON;
        if (artKey === ItemsCodes.SpellScroll) {
          const sp = this.inventorySpellScrolls.get(i)!;
          this.game.bytes[pos + 4] = Spells.getCode(sp);
        }
      } else {
        this.game.bytes[pos] = EMPTY;
        for (let j = 1; j < 4; j++) this.game.bytes[pos + j] = EMPTY;
        for (let j = 4; j < 8; j++) this.game.bytes[pos + j] = ON;
        this.inventorySpellScrolls.delete(i);
      }
    }
  }

  removeFromInventory(index: number) {
    this.inventory.splice(index, 1);
    if (this.inventorySpellScrolls.has(index)) this.inventorySpellScrolls.delete(index);
    const scrolls = [...this.inventorySpellScrolls.entries()];
    this.inventorySpellScrolls.clear();
    for (const [key, spell] of scrolls) {
      if (key > index) this.inventorySpellScrolls.set(key - 1, spell);
      else this.inventorySpellScrolls.set(key, spell);
    }
    this.updateInventory();
  }

  updateLevel(value: number) {
    this.level = value;
    this.game.bytes[this.bytePosition + this.game.offsets.HeroLevel] = value;
  }

  updateExperience(value: number) {
    this.experience = value;
    writeInt32(this.game.bytes, this.bytePosition + this.game.offsets.Experience, value);
  }

  updateMana(value: number) {
    this.mana = value;
    writeInt32(this.game.bytes, this.bytePosition + this.game.offsets.ManaPoints, value);
  }
}
