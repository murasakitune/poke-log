import { BattleLog, sortLogsByDate } from "./battleLog";
import { readBattleLogFile, writeBattleLogFile } from "./googleDrive";
import { createBattleLogFile, migrateBattleLogFile } from "./migrations";
import { saveLogs } from "./storage";

export async function syncWithGoogleDrive(localRecords: BattleLog[]): Promise<BattleLog[]> {
  // Required order: download -> parse/migrate -> merge -> LocalStorage -> Drive.
  const remote = await readBattleLogFile();
  const remoteRecords = remote.data === null ? [] : migrateBattleLogFile(remote.data).records;
  const merged = mergeRecords(localRecords, remoteRecords);
  saveLogs(merged);
  await writeBattleLogFile(createBattleLogFile(merged), remote.file?.id);
  return merged;
}

export async function clearGoogleDriveRecords(): Promise<void> {
  const remote = await readBattleLogFile();
  await writeBattleLogFile(createBattleLogFile([]), remote.file?.id);
}

export function mergeRecords(local: BattleLog[], remote: BattleLog[]): BattleLog[] {
  const byId = new Map<string, BattleLog>();
  for (const record of [...remote, ...local]) {
    const current = byId.get(record.id);
    if (!current || Date.parse(record.updatedAt) > Date.parse(current.updatedAt)) byId.set(record.id, record);
  }
  return sortLogsByDate([...byId.values()]);
}
