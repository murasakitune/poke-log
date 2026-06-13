"use client";

import { useEffect, useMemo, useState } from "react";
import pokemonNames from "../data/pokemon.json";

type Result = "win" | "lose";
type Rule = "シングル" | "ダブル";

type BattleLog = {
  id: string;
  date: string;
  rule: Rule;
  result: Result;
  myTeam: string[];
  selected: string[];
  opponentTeam: string[];
  opponentSelected: string[];
  memo: string;
};

type LegacyBattleLog = Partial<BattleLog> & { format?: string };

const STORAGE_KEY = "pokemon-battle-log-v2";
const LEGACY_STORAGE_KEY = "pokemon-battle-log-v1";
const POKEMON_OPTIONS = pokemonNames as string[];
const RULES: Rule[] = ["シングル", "ダブル"];

const selectedSizeByRule: Record<Rule, number> = {
  シングル: 3,
  ダブル: 4,
};

const emptyLog = (rule: Rule = "シングル"): BattleLog => ({
  id: crypto.randomUUID(),
  date: new Date().toISOString().slice(0, 10),
  rule,
  result: "win",
  myTeam: ["", "", "", "", "", ""],
  selected: Array(selectedSizeByRule[rule]).fill(""),
  opponentTeam: ["", "", "", "", "", ""],
  opponentSelected: Array(selectedSizeByRule[rule]).fill(""),
  memo: "",
});

function normalizeLog(log: LegacyBattleLog): BattleLog {
  const rawRule = log.rule ?? log.format;
  const rule: Rule = rawRule === "ダブル" ? "ダブル" : "シングル";
  const selectedSize = selectedSizeByRule[rule];

  return {
    id: log.id ?? crypto.randomUUID(),
    date: log.date ?? new Date().toISOString().slice(0, 10),
    rule,
    result: log.result === "lose" ? "lose" : "win",
    myTeam: normalizeArray(log.myTeam, 6),
    selected: normalizeArray(log.selected, selectedSize),
    opponentTeam: normalizeArray(log.opponentTeam, 6),
    opponentSelected: normalizeArray(log.opponentSelected, selectedSize),
    memo: log.memo ?? "",
  };
}

function normalizeArray(values: unknown, length: number) {
  const source = Array.isArray(values) ? values : [];
  return Array.from({ length }, (_, i) => (typeof source[i] === "string" ? source[i] : ""));
}

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
  const [form, setForm] = useState<BattleLog>(() => emptyLog());

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as LegacyBattleLog[];
      if (!Array.isArray(parsed)) throw new Error();
      setLogs(parsed.map(normalizeLog));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  }, [logs]);

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

  const updateArray = (key: keyof BattleLog, index: number, value: string) => {
    setForm((prev) => {
      const current = prev[key];
      if (!Array.isArray(current)) return prev;
      const next = [...current];
      next[index] = value;
      return { ...prev, [key]: next };
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
    setLogs((prev) => [{ ...form, id: crypto.randomUUID() }, ...prev]);
    setForm(emptyLog(form.rule));
  };

  const deleteLog = (id: string) => {
    if (!confirm("このログを削除しますか？")) return;
    setLogs((prev) => prev.filter((l) => l.id !== id));
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
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
      const imported = JSON.parse(text) as LegacyBattleLog[];
      if (!Array.isArray(imported)) throw new Error();
      setLogs(imported.map(normalizeLog));
    } catch {
      alert("読み込みに失敗しました。JSON形式を確認してください。");
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

        <PokemonSelectGroup title="自分のパーティ" values={form.myTeam} onChange={(i, v) => updateArray("myTeam", i, v)} />
        <PokemonSelectGroup title={`自分の選出（${form.rule === "シングル" ? "最大3体" : "最大4体"}）`} values={form.selected} onChange={(i, v) => updateArray("selected", i, v)} />
        <PokemonSelectGroup title="相手のパーティ" values={form.opponentTeam} onChange={(i, v) => updateArray("opponentTeam", i, v)} />
        <PokemonSelectGroup title={`相手の選出（${form.rule === "シングル" ? "最大3体" : "最大4体"}）`} values={form.opponentSelected} onChange={(i, v) => updateArray("opponentSelected", i, v)} />

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
        <button onClick={exportJson}>JSONで書き出し</button>
        <label className="fileButton">JSONを読み込み<input type="file" accept="application/json" onChange={(e) => importJson(e.target.files?.[0] ?? null)} /></label>
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

function PokemonSelectGroup({ title, values, onChange }: { title: string; values: string[]; onChange: (index: number, value: string) => void }) {
  return (
    <div>
      <h3>{title}</h3>
      <div className="inputs">
        {values.map((value, i) => (
          <select key={i} value={value} onChange={(e) => onChange(i, e.target.value)} aria-label={`${title} ${i + 1}体目`}>
            <option value="">{i + 1}体目を選択</option>
            {POKEMON_OPTIONS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ))}
      </div>
    </div>
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
