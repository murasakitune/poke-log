export type Result = "win" | "lose";
export type Rule = "シングル" | "ダブル";

export type BattleLog = {
  id: string;
  date: string;
  rule: Rule;
  result: Result;
  myTeam: string[];
  selected: string[];
  opponentTeam: string[];
  opponentSelected: string[];
  memo: string;
  updatedAt: string;
};

export type LegacyBattleLog = Partial<BattleLog> & { format?: string };

export const selectedSizeByRule: Record<Rule, number> = { シングル: 3, ダブル: 4 };

export function createEmptyLog(rule: Rule = "シングル"): BattleLog {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    rule,
    result: "win",
    myTeam: Array(6).fill(""),
    selected: Array(selectedSizeByRule[rule]).fill(""),
    opponentTeam: Array(6).fill(""),
    opponentSelected: Array(selectedSizeByRule[rule]).fill(""),
    memo: "",
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeLog(log: LegacyBattleLog): BattleLog {
  const rule: Rule = (log.rule ?? log.format) === "ダブル" ? "ダブル" : "シングル";
  return {
    id: typeof log.id === "string" && log.id ? log.id : crypto.randomUUID(),
    date: typeof log.date === "string" ? log.date : new Date().toISOString().slice(0, 10),
    rule,
    result: log.result === "lose" ? "lose" : "win",
    myTeam: normalizeArray(log.myTeam, 6),
    selected: normalizeArray(log.selected, selectedSizeByRule[rule]),
    opponentTeam: normalizeArray(log.opponentTeam, 6),
    opponentSelected: normalizeArray(log.opponentSelected, selectedSizeByRule[rule]),
    memo: typeof log.memo === "string" ? log.memo : "",
    // A deterministic fallback prevents old records from winning over later edits.
    updatedAt: isValidDate(log.updatedAt) ? log.updatedAt! : `${log.date ?? "1970-01-01"}T00:00:00.000Z`,
  };
}

export function normalizeArray(values: unknown, length: number): string[] {
  const source = Array.isArray(values) ? values : [];
  return Array.from({ length }, (_, index) => typeof source[index] === "string" ? source[index] : "");
}

export function sortLogsByDate(logs: BattleLog[]): BattleLog[] {
  return [...logs].sort((a, b) => b.date.localeCompare(a.date));
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
