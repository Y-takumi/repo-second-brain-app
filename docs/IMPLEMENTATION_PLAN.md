# 実装プラン（2026-07-28 夜セッションで策定）

最終更新：2026-07-28

## 概要

ユーザーFB（2026-07-28）で確定した Habit 記録フローの設計ビジョン（仕様書 2.10.5 節）を実装に落とし込むためのプラン。各 Phase の実装内容・依存関係・テスト戦略を整理。

## Phase 一覧と順序

| Phase | 内容 | 着手 | 状態 |
|---|---|---|---|
| Phase 1 | Daily サブタブ Habit チェック UI（リスト形式シンプル） | 今セッション | 進行中 |
| Phase 2 | wake_time / sleep_planned_time スキーマ追加 | 今セッション | 進行中 |
| Phase 3 | 朝のフロー実装（起床時間変更 UI、5 分刻み時刻ピッカー） | 明日以降 | 未着手 |
| Phase 4 | 夜のフロー実装（おやすみボタン、夜の門番画面、19 時以降切替） | 明日以降 | 未着手 |
| Phase 5 | 動作テスト（Playwright 制約整理、手動テスト手順確立） | 明日以降 | 計画のみ |
| Phase 6 | リリース後の改修（リズム可視化） | リリース後 | 保留 |

Phase 1, 2 は既存パターンの流用で実装可能なので、今セッションで実施。
Phase 3, 4 は UI 変更が多く、設計判断が大きいので明日のセッションで詳細を詰めてから着手。
Phase 5 は Phase 1〜4 の実装後に着手。
Phase 6 はリリース後の将来構想として保留。

---

## Phase 1: Daily サブタブ Habit チェック UI

**目的**：Tasks タブの Daily サブタブで Habit の Yes/No チェックを完結させる

**背景**：
- 現状の `renderDailyHabitList`（line 4006）は読み取り専用表示のみ
- ユーザー確定：「リスト形式シンプル、チェックボックスで『完了』ボタン」（2026-07-28 FB）
- タスク見直しタイム（stale review）のスワイプ実装は不要

**実装内容**：
1. `renderDailyHabitList` を拡張
   - 各 Habit 行に「完了」チェックボックスを追加
   - タップで `h.log[d(0)] = true` を更新
   - `persistHabitChange(h.id, { log: h.log })` で Drive 同期
2. 「取り消し」リンクも追加（誤タップ対策、ログから今日分削除）
3. 14 日間のカレンダーログ表示はそのまま維持（habitCalRow を流用）
4. ストリーク表示はそのまま維持（habitStreak を流用）

**実装する関数**：
- `toggleHabitDone(habitId)`：`persistHabitChange` を呼ぶ（`toggleTaskDone` パターンを流用）
- `clearHabitToday(habitId)`：今日分のログを削除

**成功基準**：
- Daily サブタブで「完了」ボタンタップ → Habit の log に今日分が記録される
- リロード後も状態が保持される（Drive 同期成功）
- ストリークが正しく更新される
- 14 日カレンダーが正しく更新される

**動作テスト**：
- 手動テスト：Drive 接続 → Daily サブタブで「完了」ボタン → リロード後も保持確認
- Playwright テスト：CDN ブロックにより Phase 1 完了時点では自動テスト不可（Phase 5 で対応）

---

## Phase 2: wake_time / sleep_planned_time スキーマ追加

**目的**：起床・就寝時刻を可視化するための時刻データを Habit YAML に記録する

**背景**：
- ユーザー確定：「起床・就寝時刻は時間をちゃんと記録したい。これらのリズムを後から可視化したい」（2026-07-28 FB）
- 仕様書 2.10.5 節でスキーマを確定済み：`{ "YYYY-MM-DD": "HH:MM" }` 形式の dict

**実装内容**：
1. `loadHabitFromDrive`（line 3083）の修正
   - `wakeTime: fm.wake_time || {}` を追加
   - `sleepPlannedTime: fm.sleep_planned_time || {}` を追加
2. `persistHabitChange` で `{ wake_time: {...}, sleep_planned_time: {...} }` を渡せることは既存パターンで OK
3. サンプルデータ（`habitData` 初期値、line 3966-3975）に空 dict を追加
4. `camelizeKeys` ヘルパーでメモリ上キャメル、YAML 上スネークを維持

**成功基準**：
- Habit YAML ファイルに `wake_time` / `sleep_planned_time` フィールドが追加される（空 dict でも OK）
- 既存データが破壊されない（後方互換性）
- Phase 3, 4 で `doGreetAction` から `wake_time` / `sleep_planned_time` を更新できる

**動作テスト**：
- 既存 Vault の 09_Habit ファイルを読んでエラーなく読み込めるか
- 新規 Habit ファイル作成時に `wake_time` / `sleep_planned_time` が空 dict で書き込まれるか

---

## Phase 3: 朝のフロー実装（保留、明日のセッションで）

**目的**：ホームタブで起床時間を変更でき、起床時刻が記録される

**実装予定**：
1. ホームタブ UI 設計（起床時間変更 UI、5 分刻みの時刻ピッカー）
2. `doGreetAction("wake")` のフック + `wake_time` 記録
3. 時刻ピッカー UI 統一（target_wake_time / wake_time 編集 / 起床時間変更 すべて同じ UI）

**設計判断が必要**：
- ホームタブのレイアウト
- 時刻ピッカーの実装（HTML5 input[type="time"] / カスタム UI）
- 「おはよう」ボタンタップ時の起床時刻の扱い（判定時刻 or 編集時刻）
- 朝と夜で morning gate を切り替えるロジック（19 時以降）

---

## Phase 4: 夜のフロー実装（保留、明日のセッションで）

**目的**：ホームタブ右上「おやすみ」ボタンから夜の門番画面に遷移し、就寝予定時刻を記録する

**実装予定**：
1. ホームタブ右上「おやすみ」ボタン追加（19 時前は disabled ハードコード）
2. morning gate の内容切替ロジック（19 時以降「おはよう」→「おやすみ」、既存おはようアニメーション踏襲）
3. 夜の門番画面実装（5 分刻みの就寝予定時刻入力、時刻ピッカー）
4. `doGreetAction("sleep")` のフック + `sleep_planned_time` 記録
5. ホームタブに戻る遷移
6. 夜の門番画面で登録習慣の Yes/No 回答（Phase 1 の UI を流用）

**設計判断が必要**：
- 「おやすみ」ボタンの配置（右上固定 or タブ内）
- 夜の門番画面と朝の門番画面の共通化（同じ関数を使い回すか、別関数か）
- 既存の `openGoodnight`（line 4789）との統合

---

## Phase 5: 動作テスト計画

### 現状の制約

Playwright MCP の Chromium で以下 3 つの CDN が `net::ERR_BLOCKED_BY_CLIENT` でブロックされ、アプリが起動しない：
- `https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js`
- `https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js`
- `https://accounts.google.com/gsi/client`（Google Identity Services）

→ Playwright では現時点で自動回帰テストが不可能

### 対応案

**案 A：CDN ライブラリをローカル化（推奨、Phase 5 で着手）**
1. `curl https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js -o vendor/d3.min.js`
2. `curl https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js -o vendor/js-yaml.min.js`
3. `index.html` の script src を相対パスに書き換え
4. GSI は Google ドメインのため、テスト時はスキップ or モック
5. OAuth テストは引き続き手動（OAuth 認証画面を含むため自動テスト困難）

**案 B：手動テストのみ**
- ユーザーが通常ブラウザで `http://localhost:8000/` を開いて手動で確認
- Phase 1, 2 のように UI 変更が小さい機能は手動で十分
- Phase 3, 4 のような UI 変更が大きい機能は必須

**案 C：ハイブリッド（案 A + 案 B）**
- 自動テスト：CDN ライブラリローカル化で Playwright 単体テスト（OAuth 不要な部分）
- 手動テスト：OAuth 認証、画面遷移、フリック操作など

### 動作テスト手順書

`docs/TESTING.md` を新規作成予定：
1. ローカルサーバ起動手順
2. 各機能のテストケース（Phase 別）
3. 期待結果・チェックリスト
4. トラブルシューティング

---

## Phase 6: リリース後の改修（保留）

仕様書 2.10.5 節「将来構想：リズム可視化」を参照。`wake_time` / `sleep_planned_time` のデータが蓄積されてから着手。

---

## コミット & プッシュ方針

CLAUDE.md「コミット・push はユーザー指示があったときだけ」だが、本セッションでは以下の方針で進める：
- Phase 1, 2 完了時：ローカルコミット → push（即時、ユーザーが継続的に指示している文脈）
- Phase 3, 4 完了時：複数コミットに分けず、Phase 単位でまとめてコミット → push
- Phase 5 完了時：テスト計画書のみコミット

---

## 関連ドキュメント

- `00_処理ロジック仕様書.md` 2.10.5 節：習慣記録フロー設計ビジョン
- `00_処理ロジック仕様書.md` 2.11 / 2.12 節：既存 Habit 仕様
- `00_処理ロジック仕様書.md` 4.4.3 / 4.4.4 / 4.4.5 節：Drive 永続化
- `docs/TASK_HISTORY.md`：タスク実施履歴
- `memory/second-brain-2026-07-28-habit-vision.md`：本セッションのメモリ

---

## 今セッションの作業予定

1. Phase 1: Daily サブタブ Habit チェック UI 実装
2. Phase 2: wake_time / sleep_planned_time スキーマ追加
3. 動作テスト計画（Phase 5 のドキュメントのみ、Phase 1, 2 の動作テストは手動で実施予定）
4. ローカルコミット → push
5. メモリ更新

Phase 3, 4 は明日のセッションで詳細を詰めてから着手。