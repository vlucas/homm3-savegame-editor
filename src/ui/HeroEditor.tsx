import { useMemo, useState } from 'react';
import type { Hero } from '../core/hero';
import {
  GEAR_SLOTS,
  gearSlotArtifactOptions,
  creatureStackGroups,
  experienceForLevel,
  levelForExperience,
  getSpellGroupsByLevel,
  sortArtifactNames,
  MAX_HERO_LEVEL,
  MIN_HERO_LEVEL,
  type ArtifactGroup,
  type CreatureGroup,
} from '../core/constants';
import { SpellPicker } from './SpellPicker';

interface Props {
  hero: Hero;
  skills: string[];
  skillLevels: string[];
  spells: string[];
  creatureGroups: CreatureGroup[];
  inventoryArtifactGroups: ArtifactGroup[];
  warMachines: string[];
  onChange?: () => void;
}

export function HeroEditor({
  hero,
  skills,
  skillLevels,
  spells,
  creatureGroups,
  inventoryArtifactGroups,
  warMachines,
  onChange,
}: Props) {
  const [, tick] = useState(0);
  const refresh = () => {
    tick((n) => n + 1);
    onChange?.();
  };
  const spellGroups = useMemo(() => getSpellGroupsByLevel(spells), [spells]);
  const sortedSkills = useMemo(() => sortArtifactNames(skills), [skills]);
  const sortedSpells = useMemo(() => sortArtifactNames(spells), [spells]);

  return (
    <section
      className="panel hero-editor"
      id={`hero-editor-${hero.bytePosition}`}
      data-hero-pos={hero.bytePosition}
    >
      <h2>{hero.name}</h2>

      <fieldset>
        <legend>Primary</legend>
        <div className="primary-stats">
          {['Attack', 'Defense', 'Spell Power', 'Knowledge'].map((label, i) => (
            <label key={label}>
              {label}
              <input
                type="number"
                min={0}
                max={127}
                value={hero.attributes[i]}
                onChange={(e) => { hero.updateAttribute(i, Number(e.target.value)); refresh(); }}
              />
            </label>
          ))}
          <label>
            Level
            <input
              type="number"
              min={MIN_HERO_LEVEL}
              max={MAX_HERO_LEVEL}
              value={hero.level}
              onChange={(e) => {
                const level = Math.min(MAX_HERO_LEVEL, Math.max(MIN_HERO_LEVEL, Number(e.target.value) || MIN_HERO_LEVEL));
                hero.updateLevel(level);
                hero.updateExperience(experienceForLevel(level));
                refresh();
              }}
            />
          </label>
          <label>
            Exp (lvl {hero.level})
            <input
              type="number"
              min={0}
              value={hero.experience}
              onChange={(e) => {
                const xp = Math.max(0, Number(e.target.value) || 0);
                hero.updateExperience(xp);
                hero.updateLevel(levelForExperience(xp));
                refresh();
              }}
            />
          </label>
          <label>
            Mana
            <input type="number" min={0} value={hero.mana} onChange={(e) => { hero.updateMana(Number(e.target.value)); refresh(); }} />
          </label>
          <label className="check primary-spellbook">
            <input type="checkbox" checked={hero.spellBookExist} onChange={(e) => { hero.toggleSpellBook(e.target.checked); refresh(); }} />
            Spellbook
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Secondary skills</legend>
        <div className="skills-grid">
          {hero.skills.map((skill, slot) => (
            <div className="row" key={slot}>
              <select
                value={skill ?? ''}
                onChange={(e) => { hero.updateSkill(slot, e.target.value || null); refresh(); }}
              >
                <option value="">— empty —</option>
                {sortedSkills.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={hero.skillLevels[slot] || 1}
                disabled={!skill}
                onChange={(e) => { hero.updateSkillLevel(slot, Number(e.target.value)); refresh(); }}
              >
                {skillLevels.map((_, i) => <option key={i + 1} value={i + 1}>{['Basic', 'Advanced', 'Expert'][i]}</option>)}
              </select>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Army</legend>
        <div className="army">
          {hero.creatures.map((cr, i) => (
            <div className="army-row" key={i}>
              <select
                value={cr ?? ''}
                onChange={(e) => { hero.updateCreature(i, e.target.value || null); refresh(); }}
              >
                <option value="">— empty —</option>
                {creatureStackGroups(cr, creatureGroups).map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.creatures.map((c) => <option key={`${group.label}-${c}`} value={c}>{c}</option>)}
                  </optgroup>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={hero.creatureAmounts[i]}
                disabled={!cr}
                onChange={(e) => { hero.updateCreatureAmount(i, Number(e.target.value)); refresh(); }}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>War machines</legend>
        {warMachines.map((wm) => (
          <label key={wm} className="check">
            <input
              type="checkbox"
              checked={hero.warMachines.has(wm)}
              onChange={(e) => {
                if (e.target.checked) hero.addWarMachine(wm);
                else hero.removeWarMachine(wm);
                refresh();
              }}
            />
            {wm}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Equipped artifacts</legend>
        <div className="artifacts-grid">
          {GEAR_SLOTS.map((slot) => (
            <label key={slot}>
              {slot}
              <select
                value={hero.equippedArtifacts[slot]}
                onChange={(e) => {
                  const val = e.target.value;
                  const spell = val === 'Spell Scroll' ? spells[0] : undefined;
                  hero.updateEquippedArtifact(slot, val, spell);
                  refresh();
                }}
              >
                <option value="-">—</option>
                {gearSlotArtifactOptions(slot, hero.equippedArtifacts[slot]).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              {slot.startsWith('Item') && hero.equippedArtifacts[slot] === 'Spell Scroll' && (
                <select
                  value={hero.equippedSpellScrolls[slot]}
                  onChange={(e) => {
                    hero.updateEquippedArtifact(slot, 'Spell Scroll', e.target.value);
                    refresh();
                  }}
                >
                  {sortedSpells.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Spellbook</legend>
        <SpellPicker
          groups={spellGroups}
          isChecked={(spell) => hero.spellBook.has(spell)}
          onToggle={(spell, checked) => {
            if (checked) hero.addSpellToSpellBook(spell);
            else hero.removeSpellFromSpellBook(spell);
            refresh();
          }}
          disabled={!hero.spellBookExist}
        />
      </fieldset>

      <fieldset>
        <legend>Inventory ({hero.inventory.length}/64)</legend>
        <div className="row">
          <select id={`inv-add-${hero.bytePosition}`} defaultValue="">
            <option value="">Add artifact…</option>
            {inventoryArtifactGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.artifacts.map((a) => <option key={`${group.label}-${a}`} value={a}>{a}</option>)}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const sel = document.getElementById(`inv-add-${hero.bytePosition}`) as HTMLSelectElement;
              if (sel.value) {
                hero.updateInventory(sel.value, sel.value === 'Spell Scroll' ? spells[0] : undefined);
                refresh();
              }
            }}
          >
            Add
          </button>
        </div>
        <ul className="inventory-list">
          {hero.inventory.map((art, i) => (
            <li key={i}>
              {art}
              {art === 'Spell Scroll' && (
                <select
                  value={hero.inventorySpellScrolls.get(i) ?? spells[0]}
                  onChange={(e) => {
                    hero.inventorySpellScrolls.set(i, e.target.value);
                    hero.updateInventory();
                    refresh();
                  }}
                >
                  {sortedSpells.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <button type="button" onClick={() => { hero.removeFromInventory(i); refresh(); }}>Remove</button>
            </li>
          ))}
        </ul>
      </fieldset>
    </section>
  );
}
