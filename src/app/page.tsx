"use client";

import { useEffect, useMemo, useState } from "react";
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
import { clearGoogleDriveRecords, syncWithGoogleDrive } from "../lib/sync";

const RULES: Rule[] = ["シングル", "ダブル"];

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
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    try { setLogs(loadLogs()); } catch { setNotice({ kind: "error", message: "保存データを読み込めませんでした。" }); }
    setAreLogsLoaded(true);
  }, []);

  useEffect(() => {
    if (!areLogsLoaded) return;
    saveLogs(logs);
  }, [areLogsLoaded, logs]);

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
    setLogs((prev) => [{ ...form, id: crypto.randomUUID(), updatedAt: new Date().toISOString() }, ...prev]);
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
    setLogs((prev) => prev.filter((l) => l.id !== id));
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
      setLogs(imported.records);
      setNotice({ kind: "success", message: "JSONを読み込みました。" });
    } catch {
      setNotice({ kind: "error", message: "読み込みに失敗しました。JSON形式を確認してください。" });
    }
  };

  const syncDrive = async () => {
    setIsSyncing(true);
    setNotice(null);
    try {
      const merged = await syncWithGoogleDrive(logs);
      setLogs(merged);
      setNotice({ kind: "success", message: `Google Driveと同期しました（${merged.length}件）。` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Google Drive同期に失敗しました。" });
    } finally {
      setIsSyncing(false);
    }
  };

  const clearAllLogs = async () => {
    if (!confirm("すべてのログをLocalStorageとGoogle Driveから削除しますか？")) return;
    setIsSyncing(true);
    setNotice(null);
    try {
      await clearGoogleDriveRecords();
      saveLogs([]);
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

      <section className="card note">
        <h2>ポケモンリストの編集方法</h2>
        <p><code>src/data/pokemon.json</code> に名前を追加すると、各プルダウンの候補に反映されます。</p>
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
