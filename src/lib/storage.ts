import { BattleLog, LegacyBattleLog, normalizeArray, normalizeLog } from "./battleLog";

export const STORAGE_KEY = "pokemon-battle-log-v2";
const LEGACY_STORAGE_KEY = "pokemon-battle-log-v1";
const MY_TEAM_STORAGE_KEY = "pokemon-battle-log-my-team";

export function loadLogs(): BattleLog[] {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("保存データが配列ではありません。");
  return (parsed as LegacyBattleLog[]).map(normalizeLog);
}

export function saveLogs(logs: BattleLog[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

export function loadMyTeam(): string[] {
  const raw = localStorage.getItem(MY_TEAM_STORAGE_KEY);
  return raw ? normalizeArray(JSON.parse(raw), 6) : Array(6).fill("");
}

export function saveMyTeam(team: string[]): void {
  localStorage.setItem(MY_TEAM_STORAGE_KEY, JSON.stringify(team));
}
