# 動作テスト計画

最終更新：2026-08-09（Phase 2.1 テスト項目追加）

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

## Phase 2.1: Knowledge 間関連性 Phase 2.1（2026-08-09 実装）

**概要**：AI 判定による特別の関連性（conflict）を新規 Knowledge 作成時に自動検出する Phase 2.1 を実装。7 コミット（Task 186, 186.5, 187, 188, 189, 190, 192）で end-to-end 完成。

**実装コミット**：
- `c7e97e9` Task 186 scoreCandidatesByRelevance()
- `4362b7c` Task 187 buildSpecialRelationPrompt()
- `392ad59` Task 186.5 loadKnowledgeFromDrive tags 修正
- `d161b29` Task 188 judgeSpecialRelations()
- `1e8ee4f` Task 189 addEdgesForNewKnowledge conflict 統合
- `633e841` Task 190 edges.json スキーマ拡張（後方互換）
- `cc5302f` Task 192 buildGraphLinksFromEdges kind 追加

**前提条件**：
- OAuth 認証済み
- 既存 Knowledge 2 件以上（conflict 判定の比較対象）
- ローカルサーバー起動済み（`node .tmp-http-server.js` → `http://localhost:8000/`）

### T1: loadKnowledgeFromDrive に tags 追加（Task 186.5 修正の検証）

1. アプリ起動 → OAuth 認証
2. 開発者コンソール（F12）を開く
3. 実行：
   ```javascript
   const k = await loadKnowledgeFromDrive();
   console.log(k[0]);
   ```
4. **期待結果**：返り値に `tags: []`（または実タグ）が含まれる
5. ❌ `tags` フィールドがない → Task 186.5 が反映されていない

### T2: scoreCandidatesByRelevance() 動作確認

1. 実行：
   ```javascript
   const k = await loadKnowledgeFromDrive();
   const candidates = scoreCandidatesByRelevance({
     id: "test", tags: ["a"], themes: ["healthcare"], confidence: 80
   }, k, 5);
   console.log(candidates.map(c => c.id));
   ```
2. **期待結果**：上位 5 件の id 配列が返る
3. ❌ エラー → Task 186 が反映されていない

### T3: buildSpecialRelationPrompt() 動作確認

1. 実行：
   ```javascript
   const prompt = buildSpecialRelationPrompt(
     {id: "test", title: "新Knowledge", summary: "...", themes: ["healthcare"], branch: "test", tags: []},
     [{id: "k1", title: "既存", themes: ["healthcare"], branch: "test", summary: "..."}],
     "conflict"
   );
   console.log(prompt.length);
   ```
2. **期待結果**：数百〜数千文字のプロンプト文字列が返る（実測 780 文字）
3. ❌ エラー → Task 187 が反映されていない

### T4: judgeSpecialRelations() 動作確認

1. 実行：
   ```javascript
   const edges = await judgeSpecialRelations({
     id: "test-" + Date.now(), title: "テスト", summary: "テスト",
     themes: ["healthcare"], branch: "test", tags: ["テスト"], confidence: 80
   }, "conflict");
   console.log(edges);
   ```
2. **期待結果**：
   - 空配列、または conflict エッジの配列が返る
   - コンソールに「judgeSpecialRelations: JSON解析エラー」が出ていない
3. ❌ JSON 解析エラー → JSON 抽出ロジック確認

### T5: 新規 Knowledge 作成 → 自動 conflict 判定（**最重要**）

1. 入力タブ → ジャーナル入力
2. テーマが明確な内容を入力（healthcare / business / mind / relations 関連）
3. **保存**
4. **確認項目**：
   - コンソールに `conflict エッジ N件を追加` ログ（または thematic のみ）
   - `10_Edges/edges.json` を Drive Web UI で開く
   - `type: "conflict"` のエッジが存在する（または thematic のみ）
5. ❌ エラー → Task 189 が反映されていない

### T6: グラフで conflict がオレンジ色実線で表示

1. 探索タブ → グラフ
2. **確認項目**：
   - 既存 thematic エッジ：紫破線（cross kind）
   - 新規 conflict エッジ：橙色実線（revises kind）
3. ❌ 全エッジが同じ色 → Task 192 が反映されていない
4. **実データがない場合**：T5 を繰り返し conflict 判定が出やすい Knowledge を投入して確認

### T7: 既存 edges.json の後方互換性（Task 190 検証）

1. F5 でページをリロード
2. OAuth 認証（既に認証済みなら不要）
3. アプリ初期化完了を待つ
4. 開発者コンソール（F12）を開く
5. 実行：
   ```javascript
   await refreshEdgesFromDrive();
   console.log("edgesData.length:", edgesData.length);
   console.log(JSON.stringify(edgesData[0], null, 2));
   ```
6. **期待結果**：
   - `edgesData.length`: 1 以上
   - 4 つの AI 判定フィールドが補完されている：
     - `ai_judged: false`
     - `confidence: null`
     - `judged_at: null`
     - `model_version: null`
7. ❌ 上記フィールドが undefined → Task 190 が反映されていない
8. ❌ `length: 0` → `loadEdgesFromDrive` 失敗（10_Edges フォルダや edges.json を確認）

### T8: 信頼度 0.7 未満の conflict は追加されない

1. 実行（閾値 0.99 で、結果が出にくくする）：
   ```javascript
   const edges = await judgeSpecialRelations({
     id: "test-" + Date.now(), title: "テスト", summary: "...",
     themes: ["healthcare"], branch: "test", tags: [], confidence: 50
   }, "conflict", 0.99);
   console.log(edges.length);
   ```
2. **期待結果**：`0`（閾値 0.99 で通る判定は稀）
3. ❌ 0 以外で多数 → 閾値ロジック確認

### 動作テスト共通のチェックリスト（Phase 2.1 追加）

- [ ] `loadKnowledgeFromDrive` の返り値に `tags` フィールドが含まれる
- [ ] `edgesData[0]` に `ai_judged`, `confidence`, `judged_at`, `model_version` フィールドが補完されている
- [ ] 新規 Knowledge 保存時にコンソールに `edges.json 更新: 新規エッジ N件を追加` ログが出る
- [ ] 既存 Knowledge との conflict 関係が edges.json に保存される
- [ ] グラフで thematic と conflict が異なる kind で描画される

### Phase 2.1 トラブルシューティング

**`loadKnowledgeFromDrive is not defined`**：関数が存在しない → Task 186.5 適用確認（F5 リロード）

**JSON 抽出エラー頻発**：Claude 応答が長い場合は、prompt の文字数を減らす or candidates 数を `scoreCandidatesByRelevance` の `topN` パラメータで減らす

**edges が空**：既存 Knowledge 不足 or テーマ不一致 → 既存 Knowledge の themes / tags を確認

**`edgesData.length` が 0**：F5 リロード → OAuth 認証 → `await refreshEdgesFromDrive()` 実行で復旧

## Phase 2.2: abstract_link + foreshadowing 実装（2026-08-12 実装）

**概要**：Phase 2.1（conflict）に続く Phase 2.2 として、abstract_link（抽象化の接続）と foreshadowing（伏線・発展）を **まとめて実装**。3 コミット（Task A・B・C+D）で end-to-end 完成。

**実装コミット**：
- `28891b1` Task A refactor(edges): judgeSpecialRelations で direction null を "neutral" にフォールバック
- `5a18094` Task B feat(edges): addEdgesForNewKnowledge に abstract_link / foreshadowing 判定を追加（Phase 2.2）
- `da9c1b7` Task C+D feat(graph): buildGraph に abstraction / foreshadow の色・線種を追加

**ユーザー方針**（AskUserQuestion で確認済み）：
- Phase 2.2（abstract_link）と Phase 2.3（foreshadowing）は**まとめて着手**
- API 呼び出し回数 3 倍（conflict + abstract_link + foreshadowing）を**許容**（並列化なし、各 type 順次実行）
- direction が AI 判定で `null` の時は **`"neutral"` にフォールバック**

**前提条件**：
- OAuth 認証済み
- 既存 Knowledge 2 件以上（抽象化の接続 / 伏線・発展の判定対象）
- ローカルサーバー起動済み

### T9: direction null フォールバック（Task A の検証）

1. アプリ起動 → OAuth 認証
2. 開発者コンソール（F12）を開く
3. AI が `direction` を判定しなかったケースをシミュレート：
   ```javascript
   // judgeSpecialRelations のロジックを手動検証
   // direction フィールドが null の場合、"neutral" にフォールバックされる
   const testEdge = { direction: null };
   console.log(testEdge.direction || "neutral");  // "neutral"
   ```
4. **期待結果**：`"neutral"` が返る
5. ❌ `null` のまま → Task A が反映されていない（F5 リロード）

### T10: addEdgesForNewKnowledge に 2 type 呼び出し追加（Task B の検証）

1. 既存 Knowledge が 3 件以上あることを確認（抽象化の接続や伏線が成立するペア）
2. 新規 Knowledge を 1 件作成（既存と意味的なつながりがありそうな内容）
3. コンソールログ確認：
   - `edges.json 更新: 新規エッジ N件を追加`（thematic）
   - `edges.json 更新: conflict エッジ N件を追加`（conflict）
   - `edges.json 更新: abstract_link エッジ N件を追加`（abstract_link）
   - `edges.json 更新: foreshadowing エッジ N件を追加`（foreshadowing）
4. **期待結果**：4 種類のログが出力される
5. ❌ abstract_link / foreshadowing のログが出ない → Task B が反映されていない

### T11: edges.json に abstract_link / foreshadowing エッジが保存されるか

1. Drive Web UI で `10_Edges/edges.json` を開く
2. 確認項目：
   - `type: "abstract_link"` のエッジが存在
   - `type: "foreshadowing"` のエッジが存在
   - 各エッジに `ai_judged: true` / `confidence` / `judged_at` / `model_version` / `direction` が含まれている
   - direction が `"abstract_to_specific"` / `"specific_to_abstract"` / `"foreshadow_to_resolution"` / `"resolution_to_foreshadow"` / `"neutral"` のいずれか
3. ❌ 4 type いずれかが欠落 → Task B 確認

### T12: グラフ描画で 4 kind が判別できる（Task C+D の検証）

1. 探索タブ → ナレッジ → グラフ画面でナレッジノードが複数あることを確認
2. 4 種類（紫破線 / 橙実線 / 薄紫実線 / ピンク破線）が表示されるか確認
3. **期待される表示**：
   - cross（thematic）→ `--primary` 紫 + 破線 3,3
   - revises（conflict）→ `--business` 橙 + 実線
   - **abstraction（abstract_link）→ `--mind` 薄紫 + 実線**（Phase 2.2）
   - **foreshadow（foreshadowing）→ `--relationships` ピンク + 破線 5,3**（Phase 2.2）
4. ❌ abstraction / foreshadow が灰色（`--border`）で表示 → Task C が反映されていない

### T13: computeWeights の hasCross 動作確認（Task D の検証）

1. 開発者コンソールで実行：
   ```javascript
   const nodes = graphNodes.slice(0, 5);
   const links = buildGraphLinksFromEdges(edgesData);
   // liveLinks に変換
   const liveLinks = links.filter(([s,t])=> nodes.some(n=>n.id===s) && nodes.some(n=>n.id===t))
                          .map(([s,t,kind])=>({source:s, target:t, kind}));
   computeWeights(nodes, liveLinks, null);
   console.log(nodes.map(n=>n.weight));
   ```
2. **期待結果**：abstraction / foreshadow エッジを持つノードの weight が +12 されている
3. ❌ +12 されていない → Task D が反映されていない

### T14: エッジ詳細ポップアップで 4 type のラベル表示（Task 193 + Phase 2.2 の検証）

1. 探索タブ → ナレッジ → グラフ画面で各 kind のエッジをクリック
2. **期待されるラベル表示**：
   - `thematic` → 「基本の関連性」
   - `conflict` → 「葛藤」
   - `abstract_link` → 「抽象化の接続」
   - `foreshadowing` → 「伏線・発展」
3. ❌ 4 種類のいずれかが「不明」表示 → Task 193 / Phase 2.2 の typeLabel 確認

### Phase 2.2 動作テスト共通のチェックリスト

- [ ] direction null → `"neutral"` フォールバックが動作する
- [ ] 新規 Knowledge 作成時に 4 type（thematic / conflict / abstract_link / foreshadowing）すべてが edges.json に追加される
- [ ] abstract_link / foreshadowing エッジに `ai_judged: true` が含まれている
- [ ] グラフ画面で 4 kind が色・線種で判別できる
- [ ] エッジ詳細ポップアップで 4 type すべて正しいラベルが表示される
- [ ] computeWeights で abstraction / foreshadow が weight +12 ボーナスを受ける

### Phase 2.2 トラブルシューティング

**`judgeSpecialRelations is not defined`**：関数が存在しない → Task B 適用確認（F5 リロード）

**abstract_link / foreshadowing が 1 度も生成されない**：
- 既存 Knowledge 不足 → 既存 Knowledge の themes / tags / content を確認
- プロンプトの信頼度閾値 0.7 が高すぎる可能性 → 一時的に 0.5 に下げて検証
- 候補スコアリングの上位 30 件に含まれていない可能性 → `scoreCandidatesByRelevance` のスコア計算を確認

**3 つの type 呼び出しで API エラーが多発**：
- レートリミットに達している可能性 → 1 件ずつ時間をおいて作成
- トークン期限切れ → OAuth 再認証
- Claude API 側の障害 → Cloudflare Worker ログを確認

## 関連ドキュメント

- `docs/IMPLEMENTATION_PLAN.md`：実装プラン
- `00_処理ロジック仕様書.md` 2.10.5 節：習慣記録フロー設計ビジョン
- `00_処理ロジック仕様書.md` 2.11 / 2.12 節：既存 Habit 仕様
- `00_処理ロジック仕様書.md` 2.14 節：Knowledge 間関連性データモデル
- `memory/second-brain-2026-07-28-youtube-test-blocked.md`：CDN ブロックの詳細
- `memory/second-brain-2026-07-28-habit-vision.md`：習慣セッションのメモリ
- `memory/second-brain-2026-08-09-phase2-1.md`：本セッション（Phase 2.1）のメモリ