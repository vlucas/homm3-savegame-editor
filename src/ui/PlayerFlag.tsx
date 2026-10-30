import { NEUTRAL_PLAYER, PLAYER_COLORS } from '../core/constants';

/** HoMM3 player-slot colors for the small flag beside a name. */
const FLAG_COLORS = [
  '#d12b2b',
  '#2f62d6',
  '#c4a36a',
  '#2f9a3a',
  '#e07a1a',
  '#7a3bb5',
  '#1a9a9a',
  '#e06aa8',
] as const;

export function playerFlagTitle(player: number): string {
  if (player >= 0 && player < PLAYER_COLORS.length) {
    return `Player ${player + 1} - ${PLAYER_COLORS[player]}`;
  }
  if (player === NEUTRAL_PLAYER) return 'Neutral';
  return 'Unknown';
}

export function PlayerFlag({ player }: { player: number }) {
  const title = playerFlagTitle(player);
  const color = player >= 0 && player < FLAG_COLORS.length ? FLAG_COLORS[player] : '#8d8474';
  return (
    <span
      className="player-flag"
      style={{ background: color }}
      title={title}
      aria-label={title}
    />
  );
}
