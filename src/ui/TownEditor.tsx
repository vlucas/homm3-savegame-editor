import { useMemo, useState } from 'react';
import type { Town } from '../core/town';
import {
  buildingLabelForTown,
  dwellingChainsForFaction,
  TOWN_FORT_CHAIN,
  TOWN_HALL_CHAIN,
  TOWN_MAGE_GUILD_CHAIN,
  TOWN_STANDALONE_BUILDINGS,
  type BuildingChain,
} from '../core/town-constants';
import {
  creatureStackGroups,
  getSpellGroupsByLevel,
  getSpellLevel,
  PLAYER_COLORS,
  type CreatureGroup,
} from '../core/constants';
import { formatPlayerLabel, type TownSummary } from '../core/game';
import { SpellPicker } from './SpellPicker';

interface Props {
  town: Town;
  spells: string[];
  creatureGroups: CreatureGroup[];
}

function BuildingChainRadios({
  town,
  chain,
  onChange,
}: {
  town: Town;
  chain: BuildingChain;
  onChange: () => void;
}) {
  const selected = town.getBuildingChainLevel(chain);
  return (
    <fieldset className="building-chain">
      <legend>{chain.label}</legend>
      <div className="building-chain-options">
        {chain.options.map((option) => (
          <label key={option.value} className="check">
            <input
              type="radio"
              name={`${town.bytePosition}-${chain.id}`}
              checked={selected === option.value}
              onChange={() => {
                town.setBuildingChainLevel(chain, option.value);
                onChange();
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function TownEditor({ town, spells, creatureGroups }: Props) {
  const [, tick] = useState(0);
  const refresh = () => tick((n) => n + 1);
  const spellGroups = useMemo(() => getSpellGroupsByLevel(spells), [spells]);
  const guildLevel = town.mageGuildLevel();
  const hasLibrary = town.hasLibrary();

  return (
    <section className="panel town-editor">
      <h2>
        {town.name}{' '}
        <span className="meta">{town.factionLang}</span>
      </h2>

      <fieldset>
        <legend>Owner</legend>
        <label>
          Player
          <select
            value={town.owner}
            onChange={(e) => {
              town.updateOwner(Number(e.target.value));
              refresh();
            }}
          >
            {PLAYER_COLORS.map((color, i) => (
              <option key={color} value={i}>
                {formatPlayerLabel(i)}
              </option>
            ))}
            <option value={255}>Neutral</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Garrison</legend>
        {town.creatures.map((creature, slot) => (
          <div className="army-row row" key={slot}>
            <label>
              Stack {slot + 1}
              <select
                value={creature ?? ''}
                onChange={(e) => {
                  const next = e.target.value || null;
                  town.updateCreature(slot, next, next ? Math.max(1, town.creatureAmounts[slot] || 1) : 0);
                  refresh();
                }}
              >
                <option value="">— empty —</option>
                {creatureStackGroups(creature, creatureGroups).map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.creatures.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              Count
              <input
                type="number"
                min={0}
                max={999999}
                disabled={!creature}
                value={creature ? town.creatureAmounts[slot] : 0}
                onChange={(e) => {
                  if (!creature) return;
                  town.updateCreature(slot, creature, Math.max(0, Number(e.target.value) || 0));
                  refresh();
                }}
              />
            </label>
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend>Buildings</legend>
        <div className="building-chains">
          <BuildingChainRadios town={town} chain={TOWN_HALL_CHAIN} onChange={refresh} />
          <BuildingChainRadios town={town} chain={TOWN_FORT_CHAIN} onChange={refresh} />
          <BuildingChainRadios town={town} chain={TOWN_MAGE_GUILD_CHAIN} onChange={refresh} />
        </div>

        <h3 className="building-subhead">Dwellings</h3>
        <div className="building-chains building-chains-dwellings">
          {dwellingChainsForFaction(town.faction).map((chain) => (
            <BuildingChainRadios key={chain.id} town={town} chain={chain} onChange={refresh} />
          ))}
        </div>

        <h3 className="building-subhead">Other</h3>
        <div className="building-grid">
          {TOWN_STANDALONE_BUILDINGS
            .filter((def) => buildingLabelForTown(def, town.faction) !== 'Library' || town.faction === 'Tower')
            .map((def) => (
              <label key={`${def.byte}-${def.bit}`} className="check">
                <input
                  type="checkbox"
                  checked={town.isBuildingBuilt(def)}
                  onChange={(e) => {
                    town.setBuildingBuilt(def, e.target.checked);
                    refresh();
                  }}
                />
                {buildingLabelForTown(def, town.faction)}
              </label>
            ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Mage guild spells</legend>
        {town.faction === 'Tower' && !hasLibrary && (
          <p className="hint">Build the Library to unlock one extra spell per level.</p>
        )}
        <SpellPicker
          groups={spellGroups}
          isChecked={(spell) => town.hasSpell(spell)}
          isDisabled={(spell) => !town.canAddSpell(spell)}
          levelCapacityLabel={(level) => {
            const cap = town.spellCapForLevel(level);
            if (cap <= 0) return 'unavailable';
            return `${town.spellsAtLevel(level).length}/${cap}`;
          }}
          onToggle={(spell, checked) => {
            if (checked && getSpellLevel(spell) > guildLevel) return;
            town.setSpellKnown(spell, checked);
            refresh();
          }}
        />
      </fieldset>
    </section>
  );
}

export function TownList({
  towns,
  selection,
  onSelect,
}: {
  towns: TownSummary[];
  selection: number | '';
  onSelect: (bytePosition: number) => void;
}) {
  if (towns.length === 0) {
    return <p className="hint">No towns detected in this save.</p>;
  }

  return (
    <div className="row">
      <select
        value={selection === '' ? '' : String(selection)}
        onChange={(e) => {
          const pos = Number(e.target.value);
          if (pos) onSelect(pos);
        }}
      >
        <option value="">Select a town…</option>
        {towns.map((t) => (
          <option key={t.bytePosition} value={t.bytePosition}>
            {t.name} ({t.factionLang})
          </option>
        ))}
      </select>
    </div>
  );
}
