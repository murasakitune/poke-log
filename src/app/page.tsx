"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PokemonSelectGroup } from "../components/PokemonSelectGroup";
import {
  BattleLog,
  Result,
  Rule,
  createEmptyLog,
  selectedSizeByRule,
} from "../lib/battleLog";
import { pokemonOptions } from "../lib/pokemon";
import { createBattleLogFile, migrateBattleLogFile } from "../lib/migrations";
import { loadLogs, loadMyTeam, saveLogs, saveMyTeam } from "../lib/storage";
import { clearGoogleDriveRecords, mergeRecords, syncWithGoogleDrive } from "../lib/sync";

const RULES: Rule[] = ["シングル", "ダブル"];
const AUTO_UPLOAD_DELAY_MS = 10_000;
const PERIODIC_SYNC_INTERVAL_MS = 5 * 60_000;
const SYNC_SUCCESS_DISPLAY_MS = 4_000;

type SyncStatus = "idle" | "syncing" | "success" | "error";

function resizeArray(values: string[], length: number) {
  return Array.from({ length }, (_, i) => values[i] ?? "");
}

function splitFilled(values: string[]) {
  return values.map((v) => v.trim()).filter(Boolean);
}

function countBy(values: string[]) {
  const map = new Map<string, number>();
  values.forEach((v) => map.set(v, (map.get(v) ?? 0) + 1));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function pct(n: number, d: number) {
  if (d === 0) return "0.0%";
  return `${((n / d) * 100).toFixed(1)}%`;
}

export default function Home() {
  const [logs, setLogs] = useState<BattleLog[]>([]);
  const [form, setForm] = useState<BattleLog>(() => createEmptyLog());
  const [areLogsLoaded, setAreLogsLoaded] = useState(false);
  const [isMyTeamLoaded, setIsMyTeamLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [localChangeVersion, setLocalChangeVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const logsRef = useRef<BattleLog[]>([]);
  const localChangeVersionRef = useRef(0);
  const syncInFlightRef = useRef(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const loaded = loadLogs();
      logsRef.current = loaded;
      setLogs(loaded);
    } catch {
      setNotice({ kind: "error", message: "保存データを読み込めませんでした。" });
    }
    setAreLogsLoaded(true);
  }, []);

  useEffect(() => {
    if (!areLogsLoaded) return;
    logsRef.current = logs;
    saveLogs(logs);
  }, [areLogsLoaded, logs]);

  const updateLogsLocally = useCallback((update: (current: BattleLog[]) => BattleLog[]) => {
    setLogs((current) => {
      const next = update(current);
      logsRef.current = next;
      return next;
    });
    localChangeVersionRef.current += 1;
    setLocalChangeVersion(localChangeVersionRef.current);
  }, []);

  const runDriveSync = useCallback(async (interactive: boolean) => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    const versionAtStart = localChangeVersionRef.current;
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setIsSyncing(true);
    setSyncStatus("syncing");
    setSyncMessage("Google Driveと同期中…");

    try {
      const synced = await syncWithGoogleDrive(logsRef.current, { interactive });
      // Keep edits made while the request was in flight; the debounce will upload them next.
      const latest = versionAtStart === localChangeVersionRef.current
        ? synced
        : mergeRecords(synced, logsRef.current);
      logsRef.current = latest;
      saveLogs(latest);
      setLogs(latest);
      setSyncStatus("success");
      setSyncMessage(`同期完了（${latest.length}件）`);
      successTimerRef.current = setTimeout(() => {
        setSyncStatus("idle");
        setSyncMessage("");
      }, SYNC_SUCCESS_DISPLAY_MS);
    } catch (error) {
      setSyncStatus("error");
      setSyncMessage(error instanceof Error ? error.message : "Google Drive同期に失敗しました。次回の同期で再試行します。");
    } finally {
      if (versionAtStart !== localChangeVersionRef.current) {
        // If the original debounce fired while this request was busy, schedule one more attempt.
        localChangeVersionRef.current += 1;
        setLocalChangeVersion(localChangeVersionRef.current);
      }
      syncInFlightRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!areLogsLoaded) return;
    void runDriveSync(false);

    const intervalId = window.setInterval(() => void runDriveSync(false), PERIODIC_SYNC_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void runDriveSync(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [areLogsLoaded, runDriveSync]);

  useEffect(() => {
    if (!areLogsLoaded || localChangeVersion === 0) return;
    const timeoutId = window.setTimeout(() => void runDriveSync(false), AUTO_UPLOAD_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [areLogsLoaded, localChangeVersion, runDriveSync]);

  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
  }, []);

  useEffect(() => {
    try { setForm((prev) => ({ ...prev, myTeam: loadMyTeam() })); } catch { setNotice({ kind: "error", message: "保存した編成を読み込めませんでした。" }); }
    setIsMyTeamLoaded(true);
  }, []);

  useEffect(() => {
    if (!isMyTeamLoaded) return;
    saveMyTeam(form.myTeam);
  }, [form.myTeam, isMyTeamLoaded]);

  const stats = useMemo(() => {
    const total = logs.length;
    const wins = logs.filter((l) => l.result === "win").length;
    const single = logs.filter((l) => l.rule === "シングル").length;
    const double = logs.filter((l) => l.rule === "ダブル").length;
    const selected = countBy(logs.flatMap((l) => splitFilled(l.selected)));
    const opponentSelected = countBy(logs.flatMap((l) => splitFilled(l.opponentSelected)));
    const losingOpponents = countBy(
      logs.filter((l) => l.result === "lose").flatMap((l) => splitFilled(l.opponentSelected))
    );
    return { total, wins, single, double, selected, opponentSelected, losingOpponents };
  }, [logs]);

  const updateArray = (
    key: "myTeam" | "selected" | "opponentTeam" | "opponentSelected",
    index: number,
    value: string
  ) => {
    setForm((prev) => {
      const current = prev[key];
      const nextArray = [...current];
      nextArray[index] = value;

      const next = {
        ...prev,
        [key]: nextArray,
      };

      if (key === "myTeam") {
        next.selected = next.selected.map((name) =>
          next.myTeam.includes(name) ? name : ""
        );
      }

      if (key === "opponentTeam") {
        next.opponentSelected = next.opponentSelected.map((name) =>
          next.opponentTeam.includes(name) ? name : ""
        );
      }

      return next;
    });
  };

  const updateRule = (rule: Rule) => {
    const selectedSize = selectedSizeByRule[rule];
    setForm((prev) => ({
      ...prev,
      rule,
      selected: resizeArray(prev.selected, selectedSize),
      opponentSelected: resizeArray(prev.opponentSelected, selectedSize),
    }));
  };

  const addLog = () => {
    const selected = splitFilled(form.selected);
    const opponentSelected = splitFilled(form.opponentSelected);
    if (selected.length === 0 || opponentSelected.length === 0) {
      alert("自分の選出と相手の選出を1体以上選択してください。");
      return;
    }
    updateLogsLocally((prev) => [{ ...form, id: crypto.randomUUID(), updatedAt: new Date().toISOString() }, ...prev]);
    setForm({ ...createEmptyLog(form.rule), myTeam: form.myTeam });
  };

  const resetMyTeam = () => {
    setForm((prev) => ({
      ...prev,
      myTeam: Array(6).fill(""),
      selected: Array(selectedSizeByRule[prev.rule]).fill(""),
    }));
  };

  const deleteLog = (id: string) => {
    if (!confirm("このログを削除しますか？")) return;
    updateLogsLocally((prev) => prev.filter((l) => l.id !== id));
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(createBattleLogFile(logs), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pokemon-battle-log.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    try {
      const imported = migrateBattleLogFile(JSON.parse(text) as unknown);
      updateLogsLocally(() => imported.records);
      setNotice({ kind: "success", message: "JSONを読み込みました。" });
    } catch {
      setNotice({ kind: "error", message: "読み込みに失敗しました。JSON形式を確認してください。" });
    }
  };

  const syncDrive = async () => {
    setNotice(null);
    await runDriveSync(true);
  };

  const clearAllLogs = async () => {
    if (!confirm("すべてのログをLocalStorageとGoogle Driveから削除しますか？")) return;
    setIsSyncing(true);
    setNotice(null);
    try {
      await clearGoogleDriveRecords();
      saveLogs([]);
      logsRef.current = [];
      setLogs([]);
      setNotice({ kind: "success", message: "すべてのログを削除し、Google Driveを空にしました。" });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "全件削除に失敗しました。" });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <main className="container">
      <section className="hero">
        <p className="eyebrow">Local-first battle note</p>
        <h1>ポケモン対戦ログメーカー</h1>
        <p>
          選出、勝敗、相手の並びを記録して、選出率・勝率・苦手相手を確認できます。データはブラウザ内に保存されます。
        </p>
      </section>

      <section className="grid stats">
        <div className="card"><span>対戦数</span><strong>{stats.total}</strong></div>
        <div className="card"><span>勝利数</span><strong>{stats.wins}</strong></div>
        <div className="card"><span>勝率</span><strong>{pct(stats.wins, stats.total)}</strong></div>
        <div className="card"><span>ルール内訳</span><strong>{stats.single} / {stats.double}</strong><small>シングル / ダブル</small></div>
      </section>

      <section className="card form">
        <h2>対戦を記録</h2>
        <div className="row">
          <label>日付<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>ルール
            <select value={form.rule} onChange={(e) => updateRule(e.target.value as Rule)}>
              {RULES.map((rule) => <option key={rule} value={rule}>{rule}</option>)}
            </select>
          </label>
          <label>結果
            <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value as Result })}>
              <option value="win">勝ち</option>
              <option value="lose">負け</option>
            </select>
          </label>
        </div>

      <div className="groupHeader">
        <h3>自分のパーティ</h3>
        <button type="button" className="secondary compact" onClick={resetMyTeam}>リセット</button>
      </div>
      <PokemonSelectGroup
        title="自分のパーティ"
        hideTitle
        values={form.myTeam}
        options={pokemonOptions}
        onChange={(index, value) => updateArray("myTeam", index, value)}
      />
      <PokemonSelectGroup
        title="自分の選出"
        values={form.selected}
        options={form.myTeam.filter(Boolean)}
        onChange={(index, value) => updateArray("selected", index, value)}
      />
      <PokemonSelectGroup
        title="相手のパーティ"
        values={form.opponentTeam}
        options={pokemonOptions}
        onChange={(index, value) => updateArray("opponentTeam", index, value)}
      />
      <PokemonSelectGroup
        title="相手の選出"
        values={form.opponentSelected}
        options={form.opponentTeam.filter(Boolean)}
        onChange={(index, value) => updateArray("opponentSelected", index, value)}
      />
        <label>メモ<textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="勝因、敗因、次に試すことなど" /></label>
        <button onClick={addLog}>記録する</button>
      </section>

      <section className="grid">
        <Ranking title="自分の選出率" entries={stats.selected} total={logs.length} />
        <Ranking title="相手の選出傾向" entries={stats.opponentSelected} total={logs.length} />
        <Ranking title="負けた試合の相手選出" entries={stats.losingOpponents} total={logs.filter((l) => l.result === "lose").length} />
      </section>

      <section className="card tools">
        <h2>バックアップ</h2>
        <button onClick={syncDrive} disabled={isSyncing}>{isSyncing ? "同期中…" : "Google Driveと同期"}</button>
        <button onClick={exportJson}>JSONで書き出し</button>
        <label className="fileButton">JSONを読み込み<input type="file" accept="application/json" onChange={(e) => importJson(e.target.files?.[0] ?? null)} /></label>
        <button className="danger" onClick={clearAllLogs} disabled={isSyncing}>全件削除</button>
        {syncStatus !== "idle" ? (
          <p className={`syncStatus ${syncStatus}`} role="status" aria-live="polite">{syncMessage}</p>
        ) : null}
        {notice ? <p className={`notice ${notice.kind}`} role="status">{notice.message}</p> : null}
      </section>

      <section className="card">
        <h2>ログ一覧</h2>
        {logs.length === 0 ? <p className="muted">まだ記録がありません。</p> : null}
        <div className="logs">
          {logs.map((log) => (
            <article className="log" key={log.id}>
              <div className="logHeader">
                <strong>{log.date} / {log.rule} / {log.result === "win" ? "勝ち" : "負け"}</strong>
                <button className="danger" onClick={() => deleteLog(log.id)}>削除</button>
              </div>
              <p>自分: {splitFilled(log.selected).join(" / ")}</p>
              <p>相手: {splitFilled(log.opponentSelected).join(" / ")}</p>
              {log.memo ? <p className="memo">{log.memo}</p> : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Ranking({ title, entries, total }: { title: string; entries: [string, number][]; total: number }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {entries.length === 0 ? <p className="muted">データなし</p> : null}
      <ol className="ranking">
        {entries.slice(0, 10).map(([name, count]) => (
          <li key={name}>
            <span>{name}</span>
            <b>{count}回 / {pct(count, total)}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}
