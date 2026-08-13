import { BattleLog, LegacyBattleLog, normalizeLog } from "./battleLog";

export type BattleLogFileV1 = {
  version: 1;
  updatedAt: string;
  records: BattleLog[];
};

type UnknownFile = { version?: unknown; updatedAt?: unknown; records?: unknown };

export function migrateBattleLogFile(input: unknown): BattleLogFileV1 {
  if (Array.isArray(input)) return migrateV0ToV1(input as LegacyBattleLog[]);
  if (!input || typeof input !== "object") throw new Error("JSONの形式が正しくありません。");

  const file = input as UnknownFile;
  switch (file.version) {
    case 1:
      if (!Array.isArray(file.records)) throw new Error("recordsが配列ではありません。");
      return createBattleLogFile(file.records as LegacyBattleLog[], validTimestamp(file.updatedAt));
    case undefined:
      throw new Error("versionのないオブジェクト形式には対応していません。");
    default:
      throw new Error(`未対応のバージョンです: ${String(file.version)}`);
  }
}

export function createBattleLogFile(records: LegacyBattleLog[], updatedAt = new Date().toISOString()): BattleLogFileV1 {
  return { version: 1, updatedAt, records: records.map(normalizeLog) };
}

function migrateV0ToV1(records: LegacyBattleLog[]): BattleLogFileV1 {
  return createBattleLogFile(records);
}

function validTimestamp(value: unknown): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : new Date().toISOString();
}
