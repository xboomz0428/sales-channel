// 名單熱度（engagement_score）計算
const DELTAS: Record<string, number> = {
  sent: 1,
  delivered: 2,
  opened: 5,
  clicked: 10,
  replied: 25,
  bounced: -5,
};

export const UPGRADE_THRESHOLD = 50;

export function applyDelta(currentScore: number, event: string): number {
  const delta = DELTAS[event] ?? 0;
  return Math.max(0, Math.min(100, currentScore + delta));
}
