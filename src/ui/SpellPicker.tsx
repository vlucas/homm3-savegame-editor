import type { SpellLevelGroup } from '../core/constants';

interface Props {
  groups: SpellLevelGroup[];
  isChecked: (spell: string) => boolean;
  onToggle: (spell: string, checked: boolean) => void;
  disabled?: boolean;
  /** When true for an unchecked spell, the checkbox cannot be turned on. */
  isDisabled?: (spell: string) => boolean;
  /** Optional "used/cap" label for each level legend. */
  levelCapacityLabel?: (level: number) => string | undefined;
}

export function SpellPicker({
  groups,
  isChecked,
  onToggle,
  disabled,
  isDisabled,
  levelCapacityLabel,
}: Props) {
  if (groups.length === 0) {
    return <p className="hint">No spells available.</p>;
  }

  return (
    <div className="spell-level-groups">
      {groups.map(({ level, spells }) => {
        const capacity = levelCapacityLabel?.(level);
        return (
          <fieldset key={level} className="spell-level-group">
            <legend>
              Level {level}
              {capacity ? ` (${capacity})` : ''}
            </legend>
            <div className="spell-grid">
              {spells.map((spell) => {
                const checked = isChecked(spell);
                const atCap = !checked && (isDisabled?.(spell) ?? false);
                return (
                  <label key={spell} className="check">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled || atCap}
                      onChange={(e) => onToggle(spell, e.target.checked)}
                    />
                    {spell}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
