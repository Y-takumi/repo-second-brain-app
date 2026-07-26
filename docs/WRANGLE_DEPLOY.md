# wrangler deploy の挙動と設定の保存場所ガイド

## 何が起きたか（要約）

`wrangler deploy` を実行した時、Cloudflare Dashboard で設定していた以下が**消えてしまいました**：

- **KV Namespace binding**（`USAGE_KV`）
- **環境変数**（`WEEKLY_CAP_USD`）

これは **wrangler の仕様** で、想定通りの挙動です。本ドキュメントで理由と対策を説明します。

---

## 1. wrangler の設定システム：3 つの層

Cloudflare Workers の設定は 3 つの層で管理されます：

```
┌─────────────────────────────────────────┐
│ ① Cloudflare Dashboard                  │
│    （GUI で設定した内容）                  │
│    - Settings → Variables で設定          │
│    - Settings → Bindings で設定          │
└─────────────────────────────────────────┘
                │
                │ wrangler deploy が
                │ 上書きする
                ▼
┌─────────────────────────────────────────┐
│ ② wrangler.toml（ローカルファイル）       │
│    （プロジェクトルートに置く）            │
│    - 環境変数、KV binding など           │
│    - git で管理可能                       │
└─────────────────────────────────────────┘
                │
                │ ローカルの wrangler.toml に
│    書かれていない項目は空になる           │
                ▼
┌─────────────────────────────────────────┐
│ ③ Cloudflare Workers 環境                │
│    （実際に動作する設定）                  │
└─────────────────────────────────────────┘
```

**重要な挙動**：`wrangler deploy` を実行すると、**② wrangler.toml の内容で ③ Worker の設定が上書きされる**。

つまり：
- wrangler.toml に **書かれていない項目は空になる**
- Dashboard で設定していた項目が `wrangler.toml` にないと、消えてしまう

これが今回起きたことです。`wrangler.toml` を作成していなかったので、KV binding と環境変数が空になりました。

---

## 2. なぜ wrangler.toml が必要か

### Dashboard 設定 vs wrangler.toml 設定の比較

| 項目 | Dashboard 設定のみ | wrangler.toml 設定あり |
|---|---|---|
| **設定の再現性** | ❌ 他の環境で再現できない | ✅ `git clone` で再現 |
| **設定のバージョン管理** | ❌ 履歴が残らない | ✅ Git で履歴管理 |
| **デプロイ時の安全性** | ⚠️ 上書きで消える | ✅ 同じ設定で上書きされる |
| **チーム共有** | ❌ 各自で再設定が必要 | ✅ ファイルを共有すれば OK |

### 結論

**wrangler.toml で設定を管理するのが Cloudflare 公式の推奨パターン**。Dashboard 設定は補助的に使う（Secret の値確認など）。

---

## 3. wrangler.toml の構造

`C:\ClaudeCodeProject\second-brain\wrangler.toml` の例：

```toml
# 必須項目
name = "second-brain-proxy"                            # Worker 名
main = "second-brain-proxy-worker.js"                  # エントリーポイント
compatibility_date = "2026-07-26"                    # 互換性日付

# 環境変数（秘匿情報ではない）
[vars]
WEEKLY_CAP_USD = "1.0"

# KV Namespace バインディング
[[kv_namespaces]]
binding = "USAGE_KV"                                  # Worker 内で env.USAGE_KV でアクセス
id = "cb82b52f36f14cb9bedb89d4aa365765"              # Cloudflare 上の KV の ID
```

### ⚠️ Secret は wrangler.toml に書かない

**Secret（秘匿情報）は wrangler.toml に書いてはいけません**：

| 値 | wrangler.toml `[vars]` | Cloudflare Workers Secret |
|---|---|---|
| `WEEKLY_CAP_USD = "1.0"` | ✅ OK | ❌ 不要（公開情報） |
| `YOUTUBE_CLIENT_ID`（公開情報） | ✅ OK | ❌ 不要 |
| `ANTHROPIC_API_KEY` | ❌ 絶対 NG | ✅ Secret として設定 |
| `YOUTUBE_CLIENT_SECRET` | ❌ 絶対 NG | ✅ Secret として設定 |
| `YOUTUBE_REFRESH_TOKEN` | ❌ 絶対 NG | ✅ Secret として設定 |

**Variable vs Secret の使い分け**：
- **公開情報**（URL、ID、数値）→ `wrangler.toml` の `[vars]`（平文。Worker から `env.<NAME>` でアクセス）
- **秘匿情報**（API キー、トークン、シークレット）→ Cloudflare Workers Secret（暗号化）

Secret の値を確認するコマンド：

```powershell
wrangler secret list
```

Secret を追加するコマンド：

```powershell
wrangler secret put <SECRET_NAME>
# プロンプトに値を入力
```

Variable を追加する方法：
- `wrangler.toml` の `[vars]` に追加して `wrangler deploy`
- または、Cloudflare Dashboard → Worker → Settings → Variables で **Type: Plain text** として追加

---

## 4. 各種値の管理場所まとめ（2026-07-26 確定）

| 値 | 保管場所 | 理由 |
|---|---|---|
| **Anthropic API キー** | Cloudflare Workers Secret | 秘匿情報 |
| **OAuth Client ID（Drive 用）** | `index.html` の `appSettings.googleClientId` | 公開情報（ブラウザで動く OAuth のため） |
| **OAuth Client ID（YouTube 用）** | `wrangler.toml` の `[vars]`（Variable） | 公開情報（Worker が参照する必要があるため） |
| **OAuth Client Secret（YouTube 用）** | Cloudflare Workers Secret | 秘匿情報 |
| **OAuth Refresh Token（YouTube 用）** | Cloudflare Workers Secret | 秘匿情報 |
| **`WEEKLY_CAP_USD`**（週次予算 USD） | `wrangler.toml` の `[vars]`（Variable） | 公開情報 |
| **KV Namespace binding** | `wrangler.toml` の `[[kv_namespaces]]` | Cloudflare 内部 ID |
| **`compatibility_date`** | `wrangler.toml` | 公開情報 |

---

## 5. 今回の事故の教訓

### 何が起きたか

1. `wrangler.toml` を作成せず `wrangler deploy` を実行
2. ローカル設定が空のため、Dashboard 設定が **空で上書き** された
3. KV binding と `WEEKLY_CAP_USD` が消失

### どう対処したか

1. **Dashboard での手動再設定**（KV binding、WEEKLY_CAP_USD）
2. **`wrangler.toml` を作成**（今後の deploy で同じ事故を防ぐ）

### 今後のベストプラクティス

1. **wrangler.toml を最初に作る**：Worker を作成したら、最初に wrangler.toml を作る
2. **ローカルで wrangler 経由で Secret を管理**：`wrangler secret put <NAME>` を使う（Dashboard で Secret を追加すると wrangler deploy で上書きされる可能性）
3. **Dashboard 設定は補助的に使う**：設定の確認・テスト用。本番設定は wrangler.toml に集約

---

## 6. よくある質問

### Q: Dashboard で Secret を設定してもいい？

A: **技術的には可能だが推奨しない**。

理由：
- `wrangler deploy` で wrangler.toml に書かれていない設定が消える可能性がある
- Dashboard 設定は git 管理外で、再現性が低い

ただし、**Secret の値を CLI 入力なしで確認したい**時など、Dashboard が一時的に便利。

### Q: wrangler.toml に Secret を書いてもいい？

A: **絶対に NG**。wrangler.toml は git で共有される可能性があるため、Secret を書くと漏洩リスクがある。

### Q: wrangler deploy するたびに Dashboard 設定が消える？

A: **wrangler.toml に書かれていない項目は消える**。wrangler.toml を更新すれば、その内容は反映される。

### Q: 既存の Dashboard 設定を wrangler.toml に移行するには？

A: 1. Dashboard で設定内容を確認
   2. wrangler.toml に同じ内容を記述
   3. 次回 `wrangler deploy` で Dashboard 設定が消えても、wrangler.toml から復元される

---

## 7. 関連ドキュメント

- `docs/OAUTH_AND_STORAGE.md`：OAuth・LocalStorage・データアクセス権限の解説
- `docs/OAUTH_SETUP.md`：YouTube 用 OAuth 設定の手順
- `00_処理ロジック仕様書.md`：8.1 節 データアクセス権限と開発者の扱い
- CLAUDE.md 3節：API キー・認証情報の扱い