# Zed セットアップガイド

第二の脳アプリを Zed エディタから使う方法。M3（MiniMax-M3）で Claude Code を動かす構成と、Claude.ai 風の見やすい UI を両立する。

最終更新：2026-07-26

---

## 1. Zed とは

Rust 製の高速コードエディタ。AI 統合（Zed Agent / External Agents）をエディタ内で完結できる。

### 価格（無料）

[Zed Pricing](https://zed.dev/pricing) より：
- **Personal プラン：$0 forever**（無料）
  - 外部エージェント（Claude Agent、Codex CLI 等）の利用も**無料枠に含まれる**
  - "Unlimited use with your API keys or external agents like Claude Agent, Codex CLI"
- Pro プラン：$10/月 — Zed 自身の AI Panel を使う場合
- Business：$30/seat/月 — 組織管理

**結論**：Zed で Claude Code External Agent を使う限り、Zed 自体は**無料**（API コストは別）。

---

## 2. 用語の整理

### Claude Code と Claude Code CLI

| 用語 | 意味 |
|---|---|
| **Claude Code**（Anthropic 公式） | CLI ツール。ターミナルで `claude` コマンドとして動く |
| **Claude Code CLI**（通称） | 上記と同じものを「CLI 版」と呼んだもの（区別する公式ドキュメントはなし） |
| **Claude Agent**（Zed 公式） | Zed から ACP（Agent Client Protocol）経由で Claude Code を呼ぶ機能 |

**「CLI」と「Code」を別物と扱う公式な区別は確認できなかった**。概念的には同じ CLI が母体で、外部エージェントとして Zed から呼べるラッパーが用意されている、という構成。

### ACP（Agent Client Protocol）

エージェント（Claude Code 等）とエディタ（Zed）間の通信プロトコル。Zed 公式：
- "ACP-integrated agents that run through their own process and configuration"
- Zed は ACP レジストリから、または手動 `agent_servers` 設定でエージェントを追加できる

---

## 3. 3 つの構成比較

第二の脳アプリを Zed から使う場合、以下の 3 つの構成が考えられる。

### 構成 A：Zed 内ターミナルで `claude` を実行

| 項目 | 内容 |
|---|---|
| **仕組み** | Zed 内ターミナルパネルで PowerShell を起動し、`claude` コマンドを直接実行 |
| **M3 対応** | ✅ 確実に動く（環境変数 `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` がそのまま継承される） |
| **UI の見やすさ** | △ ターミナル表示（CLI と同じ） |
| **CLI 全機能** | ✅ 完全 |
| **設定の簡単さ** | ✅ Zed をインストールするだけで使える |

### 構成 B：Agent Panel + ACP（Claude Code を External Agent として登録）

| 項目 | 内容 |
|---|---|
| **仕組み** | Zed の Agent Panel が ACP 経由で Claude Code プロセスを起動 |
| **M3 対応** | ⚠️ ACP ラッパーが環境変数を子プロセスに引き継ぐか要検証 |
| **UI の見やすさ** | ✅ Claude.ai 風（Markdown レンダリング） |
| **CLI 全機能** | ✅ ACP 経由でほぼ全部使える（/compact, /clear, /agents, /init 等） |
| **設定の簡単さ** | ⚠️ 設定手順が必要（ACP Registry または `agent_servers` 手動設定） |

### 構成 C：Zed Agent（内蔵 AI）に M3 を直接登録

| 項目 | 内容 |
|---|---|
| **仕組み** | Zed 自身の AI Panel に Anthropic 互換 / OpenAI 互換エンドポイントとして M3 を登録 |
| **M3 対応** | ✅ 動く（API 互換性があれば） |
| **UI の見やすさ** | ✅ Claude.ai 風 |
| **CLI 全機能** | ❌ Zed Agent 機能のみ（Claude Code CLI の `/init`, `/agents` 等の機能は使えない） |
| **設定の簡単さ** | ❌ `language_models` 設定が必要 |

---

## 4. M3（カスタムモデル）対応の詳細

### Claude Code CLI で M3 を動かす方法

[Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) と調査結果より、CLI は環境変数でカスタム Anthropic 互換エンドポイントを指定できる：

```powershell
$env:ANTHROPIC_BASE_URL = "https://api.MiniMax.io/anthropic"
$env:ANTHROPIC_AUTH_TOKEN = "your-api-key"
$env:ANTHROPIC_MODEL = "MiniMax-M3"

claude
```

または：

```powershell
claude --model MiniMax-M3
```

### ACP 経由での M3 引き継ぎ条件

Zed 公式ドキュメントより：
- "Model/provider config is usually owned by Claude Agent"
- "Auth/API keys/subscriptions are usually owned by Claude Agent"

つまり ACP 経由の Claude Code では、**モデル設定は Claude Code（CLI）側が保持**。Zed 側からは制御できない。ACP ラッパーが環境変数を子プロセスに引き継ぐかは**実装依存**。

確実なのは PowerShell から直接 `claude` を起動する方。

### Zed Agent で M3 を動かす方法（構成 C）

`~/.config/zed/settings.json`（Windows: `%USERPROFILE%\.config\zed\settings.json`）に設定：

```json
{
  "language_models": {
    "anthropic_compatible": {
      "MiniMax-M3": {
        "api_url": "https://api.MiniMax.io/anthropic",
        "available_models": [
          {
            "name": "MiniMax-M3",
            "max_tokens": 200000
          }
        ],
        "custom_headers": {}
      }
    }
  }
}
```

認証キーは環境変数 `MINIMAX_M3_API_KEY` として設定（provider ID を大文字スネークケース化）。

---

## 5. 推奨構成：B（A 寄りの ACP）

### 選択理由

1. **M3 の動作保証**：ACP 経由は検証が必要だが、構成 A なら確実
2. **UI の見やすさ**：ACP 経由なら Claude.ai 風レンダリング
3. **CLI の機能維持**：ACP 経由でほぼ全機能を使える

### 「A 寄り」の意味

構成 A を**ベースライン**として、以下の順序で進める：

| Step | 内容 | 確認すること |
|---|---|---|
| **Step 1** | Zed 内ターミナルで `claude` を実行 | 構成 A が動くこと（M3 引き継ぎ含む） |
| **Step 2** | Zed の Agent Panel で ACP から Claude Agent をインストール | ACP 経由で UI が見やすくなる |
| **Step 3** | M3 で会話して、Zed から M3 が動くか確認 | ACP 経由のモデル設定 |
| **Step 4** | Markdown プレビュー（`.md` 右側表示）を試す | UI 要件達成 |

Step 2 で問題が出たら Step 1 に fallback。

---

## 6. 段階的検証手順

### Step 0：Zed のインストール

1. [Zed ダウンロードページ](https://zed.dev/download) から Windows 用の `.exe` をダウンロード
2. インストール
3. 初回起動でキーボードショートカットやテーマを設定

### Step 1：Zed 内ターミナルで `claude` を実行

1. Zed を開く
2. **`Ctrl + \`** でターミナルパネルを開く
3. PowerShell が起動することを確認
4. 以下のコマンドを実行：

   ```powershell
   claude --version
   ```

   → Claude Code のバージョンが表示されれば OK

5. 続いて：

   ```powershell
   claude "テストです"
   ```

   → M3 から応答があれば成功

### Step 2：ACP Registry から Claude Agent をインストール

1. Zed のコマンドパレットを開く（`Ctrl + Shift + P`）
2. `agent: open settings` と入力 → Enter
3. External Agents セクションで **Add Agent** → **Install from Registry**
4. **Claude** を選ぶ
5. インストールが完了したら、Threads Sidebar に Claude スレッドが作成できることを確認

### Step 3：ACP 経由で M3 が動くか確認

1. ACP インストールが完了すると Threads Sidebar から Claude スレッドを開始できる
2. 「テスト」と入力して、応答が M3 から来るか確認
3. **もし応答が M3 ではなく別のモデル（例：Sonnet）になる場合**：
   - ACP の設定で `env` に環境変数を明示的に渡す
   - `~/.config/zed/settings.json` の `agent_servers.claude.env` に：
     ```json
     {
       "agent_servers": {
         "claude": {
           "env": {
             "ANTHROPIC_BASE_URL": "https://api.MiniMax.io/anthropic",
             "ANTHROPIC_AUTH_TOKEN": "your-api-key",
             "ANTHROPIC_MODEL": "MiniMax-M3"
           }
         }
       }
     }
     ```
   - ⚠️ 環境変数名が ACP ラッパーでどう認識されるかは要検証

### Step 4：Markdown プレビュー（`.md` 右側表示）

1. プロジェクトを開く
2. `.md` ファイル（例：`docs/TASK_HISTORY.md`）を開く
3. コマンドパレット → `markdown: toggle preview` を実行
4. 右側または別タブにレンダリング済みの Markdown が表示されることを確認
5. **`Ctrl + \`** で Split View も試す

### Step 5：Claude.ai 風の「スレッドを .md として開く」機能

1. Agent Panel の Claude スレッドを開く
2. 応答がレンダリングされた状態で、Threads Sidebar の該当スレッドを右クリック
3. 「Open as Markdown」相当のメニューがあればクリック
4. 別タブに `.md` としてスレッド全体が表示される

---

## 7. 既知の制約と代替案

### 制約 1：ACP 経由で環境変数が引き継がれない

公式ドキュメントでは明確に扱われていない。**実機で検証が必要**。

#### 代替案
- 構成 A（ターミナル直接）で運用 → Zed の魅力は「ターミナル統合 + ファイル閲覧」
- 構成 C（Zed Agent + M3 直接登録）に切り替え

### 制約 2：Markdown プレビューが別タブで開く

[Zed Issue #60895](https://github.com/zed-industries/zed/issues/60895) で議論中（2026-07-13 のコメントあり）：
- 現状、`markdown: toggle preview` はプレビューを別タブで開く
- 「同じタブで toggle したい」「右ペインで開きたい」という要望が議論中

#### 代替案
- 手動で Split View（`Ctrl + \`）にして、エディタとプレビューを並べる

### 制約 3：M3 の真の認証情報がミニマックスから提供されているか

ユーザーは M3 を「裏で動かしている」と認識しているが、Anthropic 互換の API エンドポイントが MiniMax 側から提供されているかは不明。

#### 確認すべきこと
- MiniMax 公式ドキュメントで M3 の API 仕様を確認
- `--model MiniMax-M3` で動くか実際に試す

---

## 8. 関連ドキュメント

- `docs/OAUTH_AND_STORAGE.md`：OAuth・LocalStorage・データアクセス権限
- `docs/OAUTH_SETUP.md`：YouTube OAuth 設定手順
- `docs/OAUTH_TROUBLESHOOTING.md`：OAuth トラブルシューティング
- `docs/WRANGLE_DEPLOY.md`：wrangler の挙動と設定管理
- `docs/NODEJS_GUIDE.md`：Node.js 初心者向けガイド

---

## 9. 私の言葉の訂正（前セッションまでの振り返り）

CLAUDE.md の「誤った認識で情報を伝えた場合、関連するシステムの設定方法などを調査してから訂正する」に従い：

| 日付 | 誤った情報 | 訂正 |
|---|---|---|
| 2026-07-26 | 「Zed だけで完結するが、Claude Code の特殊機能は使えない」と曖昧に言った | 正確には、構成 C（Zed Agent に M3 直接登録）の場合のみ制約があり、構成 B（ACP 経由）なら CLI 機能ほぼ全部使える |
| 2026-07-26 | Claude Code と Claude Code CLI を別物として扱った可能性 | 公式には「Claude Code」が正式名称、「CLI 版」は通称の域を出ない |

---

## 10. 検証ログ

| 日付 | Step | 結果 |
|---|---|---|
| 2026-07-26 | Zed インストール完了（ユーザー側） | ✅ |
| 2026-07-26 | Step 1〜2 は明日実施予定 | ⏸️ |
