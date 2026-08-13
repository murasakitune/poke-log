# Pokemon Battle Log 実装レポート

## 概要

既存の画面、統計処理、LocalStorage の保存キーとデータ形式を維持しながら、ポケモン候補データの読み込みを集約し、候補にない名前も記録できるようにしました。

## 変更したファイル

### `src/lib/pokemon.ts`（新規）

- `src/data/pokemon.json` の読み込みをこのファイルに集約しました。
- 空文字と重複を除いた読み取り専用の候補一覧を UI に公開します。
- UI は JSON ファイルを直接参照しません。

### `src/components/PokemonSelectGroup.tsx`（新規）

- `page.tsx` にあったポケモン入力 UI を独立したコンポーネントにしました。
- HTML の `datalist` によるオートコンプリートと、`select` による候補選択を維持しました。
- 検索欄へ入力した値を候補の有無にかかわらずフォームへ反映します。
- 自由入力中の値も選択欄へ表示し、入力値が意図せず消えないようにしました。

### `src/app/page.tsx`

- JSON の直接 import を廃止し、`src/lib/pokemon.ts` の候補一覧を利用するように変更しました。
- ポケモン入力 UI を `PokemonSelectGroup` へ分離しました。
- 対戦ログの型、統計ロジック、インポート／エクスポート、LocalStorage 処理は変更していません。
- 自分のパーティは専用の LocalStorage キーで保持し、記録後やページ再読み込み後も再利用できるようにしました。
- 記録後は自分・相手双方の選出をリセットし、自分のパーティだけを引き継ぎます。

### `src/app/globals.css`

- 自分のパーティ用リセットボタンの配置と、既存デザインに合わせた補助ボタンのスタイルを追加しました。

## 互換性

- 現行キー `pokemon-battle-log-v2` と旧キー `pokemon-battle-log-v1` は変更していません。
- `BattleLog` の保存データ形状も変更していません。
- 自分のパーティ保持には独立したキー `pokemon-battle-log-my-team` を使用するため、既存ログには影響しません。
- 自由入力値も従来と同じ `string[]` に入るため、既存の使用率、相手使用率、負けた相手ランキングにそのまま集計されます。

## 今後 `pokemon.json` を更新する方法

1. 新しい候補一覧を JSON の文字列配列として用意します。
2. `src/data/pokemon.json` を新しいファイルで置き換えます。
3. `npm run build` を実行して形式に問題がないことを確認します。

アプリ側の import やコンポーネントを変更する必要はありません。候補にまだ含まれないポケモンも自由入力で記録できます。

## Google Drive 同期

### 変更したファイル

- `src/lib/battleLog.ts`: 対戦ログの型、正規化、日付ソートを集約。レコードに `updatedAt` を追加。
- `src/lib/migrations.ts`: Version 0（配列）と Version 1 の読み込み、および将来拡張用の `switch(version)` を実装。
- `src/lib/storage.ts`: 対戦ログと自分の編成に関する LocalStorage 操作を集約。
- `src/lib/googleDrive.ts`: Google Identity Services 認可と Drive REST API の `appDataFolder` 読み書きを実装。
- `src/lib/sync.ts`: 取得、移行、UUID マージ、LocalStorage 更新、Drive 更新の同期処理を実装。
- `src/app/page.tsx`: 同期状態と通知、同期ボタン、全件削除を既存 UI に追加。JSON 入出力を Version 1 化。
- `src/app/layout.tsx`: Google Identity Services の公式スクリプトを事前ロード。
- `src/app/globals.css`: 無効状態と成功・失敗通知の既存 UI に沿ったスタイルを追加。
- `.env.example`: Google OAuth クライアント ID の設定例を追加。

### Google Drive API の導入方法

追加ライブラリは不要です。Google Identity Services でアクセストークンを取得し、Drive API v3 を REST で呼び出します。権限は `https://www.googleapis.com/auth/drive.appdata` のみに限定しています。保存ファイルは `appDataFolder/battle-log.json` で、通常のマイドライブには表示・作成されません。

公式資料: [Google Identity Services のトークンモデル](https://developers.google.com/identity/oauth2/web/guides/use-token-model)、[Application Data folder](https://developers.google.com/workspace/drive/api/guides/appdata)

### Google Cloud Console で必要な設定

1. Google Cloud プロジェクトを作成または選択します。
2. 「API とサービス」から Google Drive API を有効化します。
3. OAuth 同意画面を構成し、アプリ名・サポートメール・対象ユーザーを設定します。
4. テスト運用中は利用する Google アカウントをテストユーザーへ追加します。
5. 「認証情報」で OAuth クライアント ID を作成し、種類に「ウェブ アプリケーション」を選びます。

### OAuth 設定

「承認済みの JavaScript 生成元」へ、利用環境のオリジンを登録します。パスは含めません。

- ローカル: `http://localhost:3000`
- 本番: `https://your-domain.example`
- 必要に応じて Vercel の固定カスタムドメイン

この実装はブラウザ内で完結する公式トークンモデルです。アクセストークンはメモリで期限まで再利用し、LocalStorage には保存しません。期限切れ後は Google セッションを利用して再認可します。クライアントシークレットは使用しません。

### Vercel の環境変数

Project Settings → Environment Variables に次を設定し、再デプロイします。

```text
NEXT_PUBLIC_GOOGLE_CLIENT_ID=作成したウェブアプリ用OAuthクライアントID
```

これはブラウザ向け OAuth クライアント ID であり秘密情報ではありません。クライアントシークレットを `NEXT_PUBLIC_` 変数へ設定しないでください。

### Version 1 JSON フォーマット

```json
{
  "version": 1,
  "updatedAt": "2026-08-13T00:00:00.000Z",
  "records": [
    {
      "id": "UUID",
      "date": "2026-08-13",
      "updatedAt": "2026-08-13T00:00:00.000Z"
    }
  ]
}
```

実際の各レコードには従来の `rule`、`result`、各パーティ・選出、`memo` も保存されます。LocalStorage は引き続き従来キーと配列形式を正本として使用し、各レコードへ後方互換な `updatedAt` フィールドだけを追加します。

### 旧 JSON からの移行

ルートが配列の旧 JSON は Version 0 と判定し、各レコードを正規化して自動的に Version 1 へ変換します。既存レコードに `updatedAt` がない場合は、対戦日の午前 0 時（UTC）を決定的な初期値として設定します。旧 LocalStorage も読み込み時に同様に正規化されます。

### 同期アルゴリズム

同期ボタンでは次の順序を固定しています。

1. `appDataFolder` から `battle-log.json` を検索して取得
2. JSON を読み込み
3. Version 0 なら Version 1 へ移行
4. LocalStorage 側と UUID 単位でマージし、同一 UUID は新しい `updatedAt` を採用
5. 対戦日の降順に並べ、LocalStorage を更新
6. 同じ Version 1 データで Drive ファイルを上書き（未作成なら新規作成）

全件削除は Drive ファイル自体を削除せず、`records: []` の Version 1 JSON を書き込みます。Drive 更新に失敗した場合は端末間の不整合を避けるため、LocalStorage の全件削除も実行しません。

### Version 2 を追加する方法

1. `migrations.ts` に `BattleLogFileV2` と `migrateV1ToV2` を追加します。
2. `migrateBattleLogFile` の `switch(version)` に `case 2` を追加し、Version 0 → 1 → 2 と段階的に変換します。
3. ファイル生成関数の最新版を Version 2 に変更します。
4. `sync.ts` は移行関数の返却する最新版だけを扱うため、同期順序や Google Drive 処理を変更する必要はありません。
