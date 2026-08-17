import { BattleLog, sortLogsByDate } from "./battleLog";
import { DriveAccessOptions, readBattleLogFile, writeBattleLogFile } from "./googleDrive";
import { createBattleLogFile, migrateBattleLogFile } from "./migrations";
import { saveLogs } from "./storage";

export async function syncWithGoogleDrive(
  localRecords: BattleLog[],
  options: DriveAccessOptions = {},
): Promise<BattleLog[]> {
  // Required order: download -> parse/migrate -> merge -> LocalStorage -> Drive.
  const remote = await readBattleLogFile(options);
  const remoteRecords = remote.data === null ? [] : migrateBattleLogFile(remote.data).records;
  const merged = mergeRecords(localRecords, remoteRecords);
  saveLogs(merged);
  if (!remote.file || !hasSameRecordVersions(merged, remoteRecords)) {
    await writeBattleLogFile(createBattleLogFile(merged), remote.file?.id, options);
  }
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

function hasSameRecordVersions(left: BattleLog[], right: BattleLog[]): boolean {
  if (left.length !== right.length) return false;
  const rightVersions = new Map(right.map((record) => [record.id, record.updatedAt]));
  return left.every((record) => rightVersions.get(record.id) === record.updatedAt);
}
