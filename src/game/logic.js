export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;
export const TOTAL_LEVELS = 5;

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function rectsOverlap(a, b, padding = 0) {
  return (
    a.x + padding < b.x + b.width - padding &&
    a.x + a.width - padding > b.x + padding &&
    a.y + padding < b.y + b.height - padding &&
    a.y + a.height - padding > b.y + padding
  );
}

export function levelConfig(level) {
  const safeLevel = clamp(Math.floor(level) || 1, 1, TOTAL_LEVELS);
  return {
    level: safeLevel,
    goal: safeLevel === TOTAL_LEVELS ? 1 : 8 + safeLevel * 3,
    spawnEvery: Math.max(0.42, 1.08 - safeLevel * 0.12),
    enemySpeed: 72 + safeLevel * 13,
    title: ['Rastro da Caatinga', 'Noite das Pedras', 'Vento do Cariri', 'Chuva de Fogo', 'O Coronel do Vazio'][safeLevel - 1],
  };
}

export function scoreForHit(enemyType, combo) {
  const base = { rock: 100, bandit: 160, fast: 220, boss: 350 }[enemyType] ?? 100;
  return base * clamp(combo, 1, 5);
}

export function safeStoredNumber(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
