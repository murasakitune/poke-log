# Pokemon Battle Log

ポケモンチャンピオンズの対戦記録をブラウザへ保存し、使用率、相手の選出傾向、勝率などを確認できる Next.js アプリです。LocalStorage を正本とし、必要なときだけ Google Drive のアプリ専用領域と同期します。

## 起動方法

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開いてください。

## ポケモンリストの更新方法

候補一覧は `src/data/pokemon.json` のみを参照しています。最新版へ更新する場合は、このファイルをポケモン名の JSON 文字列配列で置き換えてください。

```json
[
  "フシギバナ",
  "リザードン",
  "カメックス"
]
```

UIや読み込み処理を修正する必要はありません。空文字と重複項目は読み込み時に除外されます。候補にない名前も画面から自由入力できます。

差し替え後は次のコマンドで形式とビルドを確認してください。

```bash
npm run build
```

## Google Drive 同期の設定

Google Drive 同期を利用する場合は、Google Cloud Console で Drive API とウェブアプリ用 OAuth クライアントを設定し、`.env.local` にクライアント ID を指定します。

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

詳細な設定、データ形式、移行・同期仕様は `IMPLEMENTATION_REPORT.md` を参照してください。
