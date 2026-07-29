# 動作テスト計画

最終更新：2026-07-28

## 目的

実装した機能が意図通りに動作することを確認する手順・チェックリスト・トラブルシューティングをまとめる。

## 現状の自動テスト制約（重要）

**Playwright MCP の Chromium では現時点で自動回帰テストが不可能**：
- 外部 CDN が `net::ERR_BLOCKED_BY_CLIENT` でブロックされアプリが起動しない
  - `https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js`
  - `https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js`
  - `https://accounts.google.com/gsi/client`（Google Identity Services）

→ **当面は手動テストのみ**。自動テストを再開するには CDN ライブラリを `vendor/` にローカル化する対応が必要（Phase 5.5 として保留）。

## ローカルサーバ起動手順

PowerShell（Bash 環境では Microsoft Store 版 Python が動かないため Node.js 簡易サーバ）：

```javascript
// .tmp-http-server.js（既に削除ファイルに退避済み。再度使う場合は取り出す）
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = process.cwd();
const PORT = 8000;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not Found: " + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});
server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}/`);
});
```

起動：

```bash
node .tmp-http-server.js
```

ブラウザで `http://localhost:8000/` を開く。

## Phase 別テストケース

### Phase 1: Daily サブタブ Habit チェック UI（2026-07-28 実装）

**前提**：OAuth 認証済み、Vault 接続済み

| # | テストケース | 手順 | 期待結果 |
|---|---|---|---|
| 1.1 | 通常 Habit の「完了」チェック | Tasks タブ → Daily サブタブ → 「1日1回は体を動かす」の「完了する」をタップ | チェックが入り、ストリーク表示が更新される |
| 1.2 | 完了の取り消し | 1.1 完了後に同じチェックボックスをタップ | チェックが外れ、ストリークが元に戻る |
| 1.3 | リロード後の状態保持 | 1.1 完了後にブラウザをリロード（Vault から再読込） | チェック状態が復元される（Drive 永続化が成功している） |
| 1.4 | 14日カレンダーの更新 | 1.1 完了後に該当日のドットを確認 | 当日のドットが `done`（緑）になる |
| 1.5 | wake/sleep のチェック UI 非表示 | Tasks タブ → Daily サブタブで「起床」「就寝」を確認 | チェックボックスが表示されない（timeInfo のみ） |
| 1.6 | Drive ファイル確認 | Google Drive で `09_Habit/h3.md` を開いて YAML フロントマターを確認 | `log:` に今日の日付キーで `true` が記録されている |

### Phase 2: wake_time / sleep_planned_time スキーマ追加（2026-07-28 実装）

| # | テストケース | 手順 | 期待結果 |
|---|---|---|---|
| 2.1 | 既存 Habit ファイルの読み込み | Vault に既存の `09_Habit/*.md` がある場合（wake_time フィールドなし） | エラーなく読み込める（`wakeTime: {}` として扱われる） |
| 2.2 | 新規 Habit の作成 | 何かしらの操作で新規 Habit を作成 | YAML に `wake_time: {}` / `sleep_planned_time: {}` が書き込まれる（空 dict） |
| 2.3 | サンプルデータの表示確認 | アプリ起動 → Tasks タブ → Daily サブタブで h-wake / h-sleep のログを確認 | 既存の log に加えて wake_time / sleepPlannedTime も読み込まれている（コンソールエラーなし） |

### Phase 3: 朝のフロー（明日以降実装）

テストケースは Phase 3 実装完了後に追加予定。

### Phase 4: 夜のフロー（明日以降実装）

テストケースは Phase 4 実装完了後に追加予定。

---

## 既存実装のテストケース（2026-07-28 以前の Phase）

### タスク完了操作（toggleTaskDone）

**前提**：OAuth 認証済み、Vault 接続済み、Task が 1 件以上存在

| # | テストケース | 手順 | 期待結果 |
|---|---|---|---|
| C.1 | Task 完了 | Tasks タブ → Ad Hoc サブタブ → 未完了タスクのチェックボックスをタップ | チェックが入り、done アコーディオンへ移動 |
| C.2 | Task 完了取り消し | C.1 完了後に同じチェックボックスをタップ | チェックが外れ、open タブに戻る |
| C.3 | リロード後の状態保持 | C.1 完了後にリロード | チェック状態が復元される |
| C.4 | Drive ファイル確認 | Google Drive で `07_Task/{id}.md` を確認 | YAML `status: done` が記録されている |
| C.5 | Drive 未接続時の警告 | Drive 未接続で完了チェック | alert で「Drive保存に失敗しました」表示、メモリ上は更新されている |

### タスク編集系操作

**前提**：OAuth 認証済み、Vault 接続済み

| # | テストケース | 手順 | 期待結果 |
|---|---|---|---|
| E.1 | タイトル編集 | タスク詳細画面 → タイトルを変更 → フォーカスを外す | Drive に書き戻される |
| E.2 | 本文編集 | タスク詳細画面 → 本文を編集 → フォーカスを外す | Drive に書き戻される |
| E.3 | Due date 設定 | タスク詳細画面 → Due date を入力 | Drive に書き戻される |
| E.4 | Due date 解除 | タスク詳細画面 → Due date をクリア | Drive に書き戻される（`due: null`） |
| E.5 | 依存タスク追加 | タスク詳細画面 → 先行タスクを追加 | Drive に書き戻される（`depends_on: [...]`） |
| E.6 | 依存タスク削除 | タスク詳細画面 → 先行タスクを削除 | Drive に書き戻される |
| E.7 | リロード後の状態保持 | E.1〜E.6 いずれかの後にリロード | 編集状態が復元される |

### wake / sleep（doGreetAction）

| # | テストケース | 手順 | 期待結果 |
|---|---|---|---|
| W.1 | 朝の「おはよう」ボタン（時間内） | 目標起床時刻の 30 分以内に Capture タブの「おはよう」をタップ | 朝の門番画面が消え、`h-wake.log[today] = true` が Drive に書き戻される |
| W.2 | 朝の「おはよう」ボタン（時間外） | 目標起床時刻の 30 分以降にタップ | `h-wake.log[today] = false`（または記録なし）でクリア扱いにならない |
| W.3 | 夜の「おやすみ」ボタン（時間内） | 目標就寝時刻の 30〜60 分前に「おやすみ」をタップ | Goodnight 画面が表示され、`h-sleep.log[today] = true` が Drive に書き戻される |
| W.4 | 夜の「おやすみ」ボタン（時間外） | 時間外に「おやすみ」をタップ | `h-sleep.log[today] = false`（または記録なし） |
| W.5 | リロード後の状態保持 | W.1 完了後にリロード | log 状態が復元される |

### タスク見直し（staleDecide / staleTapDecide）

**前提**：OAuth 認証済み、appSettings.staleReviewDays 日以上動きがない open タスクが存在

| # | テストケース | 手順 | 期待結果 |
|---|---|---|---|
| S.1 | 見直しカードのスワイプ右 | Tasks タブで「見直しタイム」カードの「キープする」方向にスワイプ | カードが消え、`t.lastConfirmed = today` が Drive に書き戻される |
| S.2 | 見直しカードのスワイプ左 | 「アーカイブ」方向にスワイプ | カードが消え、`t.status = "someday"`, `t.archivedAt = today`, `t.lastConfirmed = today` が Drive に書き戻される |
| S.3 | 外部タップ（決定ボタン） | 「キープする」/「アーカイブ」ボタンをタップ | スワイプと同じく判定が記録される |
| S.4 | リロード後の状態保持 | S.1 または S.2 後にリロード | 見直し済みタスクが次回の見直しタイムに表示されない |

### タスク復活（reviveTask）

**前提**：アーカイブされた（status: "someday"）タスクが存在

| # | テストケース | 手順 | 期待結果 |
|---|---|---|---|
| R.1 | アーカイブから復活 | Tasks タブ → アコーディオン「🗄 アーカイブ」→ タスクの「復活させる」リンクをタップ | `t.status = "open"`, `t.archivedAt = null`, `t.lastConfirmed = today`, `t.priority` が他より少し高い値で復活、Drive に書き戻される |
| R.2 | リロード後の状態保持 | R.1 後にリロード | 復活状態が復元される |

### check_time 切替（setHabitCheckTime）

| # | テストケース | 手順 | 期待結果 |
|---|---|---|---|
| H.1 | 朝 → 夜 | Tasks タブ → Daily サブタブ → 通常 Habit の「☀️ 朝」/「🌙 夜」チップをタップ | `h.checkTime` が更新され、Drive に書き戻される |
| H.2 | リロード後の状態保持 | H.1 後にリロード | checkTime 状態が復元される |

## 動作テスト共通のチェックリスト

- [ ] アプリが `http://localhost:8000/` で開ける
- [ ] OAuth 認証フローが完了できる
- [ ] Vault からの Habit 読み込みでエラーが出ない
- [ ] コンソールエラーが出ていない（DevTools の Console タブ）
- [ ] リロード後も状態が保持される（Drive 同期成功）
- [ ] Google Drive 上のファイル YAML フロントマターが正しいキー（snake_case）になっている

## トラブルシューティング

### 「Drive 未接続：〜」警告が出る

- OAuth 認証が切れている可能性。設定タブから再認証
- `appSettings.googleClientId` が正しく設定されているか確認
- ブラウザの Cookie / LocalStorage がクリアされている可能性

### アプリが起動しない（真っ白）

- CDN ブロックが原因の可能性。DevTools の Console で `net::ERR_BLOCKED_BY_CLIENT` が出ていないか確認
- ローカルサーバが起動しているか確認（`curl http://localhost:8000/` で HTTP 200 が返るか）

### 完了ボタンが反応しない

- DevTools の Console で JavaScript エラーが出ていないか確認
- `persistHabitChange` 関数内で `updateHabitInDrive` が呼ばれ、エラーが出ていないか
- Drive 接続が切れていないか（前述）

### リロード後に状態が元に戻る

- Drive 永続化が失敗している可能性。DevTools の Console で「Habit変更のDrive保存に失敗」が出ていないか確認
- YAML フロントマターのフォーマットが壊れていないか（Drive 上でファイルを開いて確認）

## Phase 5.5: 自動テスト再開のための作業（保留）

Playwright で自動テストを再開するには、以下を実施：

1. CDN ライブラリをローカル化：
   ```bash
   curl https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js -o vendor/d3.min.js
   curl https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js -o vendor/js-yaml.min.js
   ```
2. `index.html` の script src を相対パスに書き換え：
   ```html
   <script src="vendor/d3.min.js"></script>
   <script src="vendor/js-yaml.min.js"></script>
   ```
3. GSI は Google ドメインのため、テスト時はモック化 or スキップ
4. OAuth 認証画面を含むテストは手動のまま（自動テスト困難）

## 関連ドキュメント

- `docs/IMPLEMENTATION_PLAN.md`：実装プラン
- `00_処理ロジック仕様書.md` 2.10.5 節：習慣記録フロー設計ビジョン
- `00_処理ロジック仕様書.md` 2.11 / 2.12 節：既存 Habit 仕様
- `memory/second-brain-2026-07-28-youtube-test-blocked.md`：CDN ブロックの詳細
- `memory/second-brain-2026-07-28-habit-vision.md`：本セッションのメモリ