# CLAUDE.md — 第二の脳 PKMアプリ

## プロジェクト概要
個人用ナレッジ管理（PKM）Webアプリ「第二の脳」。リレーショナルDBを持たず、Google Drive上のMarkdown（YAML frontmatter付き）ファイル群だけで動作する。音声/URL入力→Claude APIで抽出→Driveに構造化ファイルとして保存、が中核フロー。

**詳細な設計判断・スキーマ・変更の経緯は `00_処理ロジック仕様書.md` を参照。ここには「絶対に外してはいけないルール」だけを書く。**

---

## 絶対ルール（推測せず、必ずこれに従うこと）

### 1. 保存構造：全オブジェクトが独立ファイル
Note・Knowledge・Task・GreatMind・Habitは、**1オブジェクト＝1ファイル**。Note内に配列として埋め込まない（過去に一度この誤りを犯し撤回した経緯がある。詳細は仕様書0.5節）。
- 子オブジェクトは`origin_note`で親Noteのidを持つ
- 親Noteは`knowledge_refs`/`task_refs`/`great_mind_refs`という**IDのみの軽量配列**を持つ（内容は二重管理しない）

### 2. Vaultフォルダ構造
```
00_Inbox/ 01_Journal/ 02_Sources/ 03_Insights/ 04_MOC/ 05_Reference/
06_GreatMind/ 07_Task/ 08_Knowledge/ 09_Habit/ Templates/
```

### 3. APIキーの扱い
AnthropicのAPIキーは**絶対にクライアント側コードに書かない**。必ずCloudflare Worker（`second-brain-proxy-worker.js`、KVでユーザーごとの週次予算も管理）を経由する。Google OAuthのClient IDは秘匿情報ではないのでコードに直書きしてよい。

### 4. Great MindのKnowledge alignment
KnowledgeのGreat Mindへの賛否（alignment）は、**ユーザーが明示的に述べた場合のみ**記録する。AIが文脈から推測して自動判定することは禁止。

---

## 技術スタック
- フロントエンド：単一の`index.html`（バニラJS、ビルドステップなし）
- 認証：Google Identity Services（`drive.file`スコープ）
- YAML解析：js-yaml
- グラフ描画：D3.js
- API中継：Cloudflare Workers + KV
- デプロイ：GitHub Pages（現状は手動アップロード。Claude Codeでgit直接操作に移行できると望ましい）

## 主要ファイル
- `index.html` — アプリ本体
- `second-brain-proxy-worker.js` — Cloudflare Worker（Claude API中継）
- `00_処理ロジック仕様書.md` — 詳細仕様（設計判断の経緯含む、随時参照）

## 現在の実装状況
Drive OAuth・Vault読み込みパーサー（Library/Task/Knowledge/GreatMind/Habit）・Capture→Claude抽出→Drive書き込み（ジャーナルのみ）まで実装済み。未着手の項目は仕様書4.7節のロードマップを参照。

---

## 進め方の好み
- 大きな設計変更や、既存の決定を覆す提案をする時は、実装前に一度確認する
- ファイルを編集したら、GitHubへのコミットメッセージ案を日本語で添える
- **設計判断が確定したら、会話内だけで終わらせず、必ず`00_処理ロジック仕様書.md`を更新すること**（セッションを切り替えると会話の記憶は失われるため）
