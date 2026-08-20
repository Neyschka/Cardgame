import { describe, expect, it } from 'vitest';
import type { HandCard } from '@card-game/shared';
import { ACTION_COLORS, effectPills } from './cards';

const card = (
  over: Partial<HandCard> & { effects: HandCard['effects'] },
): HandCard => ({
  id: 'c1',
  defId: 'x',
  name: 'X',
  playAgain: false,
  needsTarget: false,
  ...over,
});

describe('effectPills', () => {
  it('renders one pill per effect, in card order', () => {
    const pills = effectPills(
      card({
        effects: [
          { kind: 'attack', value: 1, target: 'single' },
          { kind: 'heal', value: 1, target: 'single' },
        ],
      }),
    );

    expect(pills).toEqual([
      { kind: 'attack', color: ACTION_COLORS.attack, icon: '⚔️', label: '1' },
      { kind: 'heal', color: ACTION_COLORS.heal, icon: '➕', label: '1' },
    ]);
  });

  it('marks an all-target effect in its label', () => {
    const [pill] = effectPills(
      card({ effects: [{ kind: 'attack', value: 2, target: 'all' }] }),
    );

    expect(pill?.label).toBe('2 all');
  });

  it('colors strip apart from shield — a destroyed shield must not read as a gained one', () => {
    expect(ACTION_COLORS.strip).not.toBe(ACTION_COLORS.shield);
  });
});
