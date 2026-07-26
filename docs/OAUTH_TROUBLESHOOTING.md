# OAuth トラブルシューティング

第二の脳アプリ（second-brain）で発生する OAuth 関連のエラーと原因・解決策をまとめる。

最終更新：2026-07-26

---

## 1. エラー一覧（時系列）

| エラー | 発生日 | 状態 | 原因 | 解決策 |
|---|---|---|---|---|
| `redirect_uri_mismatch` | 2026-07-25 | ✅ 解決 | typo（`oauth2callbac`） | リダイレクト URI を修正 |
| `popup_closed_by_user` でボタンが接続中…のまま | 2026-07-25 | ✅ 解決 | エラーハンドリング不足 | `resetDriveButton()` 追加 |
| Outlook アカウント自動選択で「アクセスをブロック」 | 2026-07-25 | ✅ 解決 | テストユーザー未登録 / プロンプト設定不足 | `prompt: 'select_account'` 追加 |
| OAuth 同意画面に `y-takumi.github.io` が表示される | 2026-07-25 | ✅ 解決 | `file://` プロトコル経由 | `npx http-server -p 8000` で配信 |
| `This request contains scopes that cannot be requested together` | 2026-07-25 | ✅ 解決 | OAuth 同意画面の「データアクセス」に `youtube.force-ssl` 登録 | 「データアクセス」から削除 |
| **`You can't sign in to this app because it doesn't comply with Google's OAuth 2.0 policy for keeping apps secure`** | 2026-07-26 | ⏸️ 未解決 | **OAuth Consent Screen の Status が Production だが、ブランディング（プライバシーポリシー、ホームページ等）が空** | Testing モードに戻す、またはブランディングを埋める |

---

## 2. 最新の未解決問題（2026-07-26）

### エラーの内容

```
You can't sign in to this app because it doesn't comply with Google's OAuth 2.0 policy for keeping apps secure.

You can let the app developer know that this app doesn't comply with one or more validation rules.
このエラーの詳細
second-brain-app のデベロッパーの場合は、エラーの詳細をご確認ください。
エラー 400: invalid_request
```

### Tackman さんの観察結果（2026-07-26 夜セッション）

- OAuth Consent Screen の **Publishing status: Production（本番環境）** になっている
- **ブランディングメニューが全て空**：
  - ロゴファイル：空
  - ホームページ URL：空
  - プライバシーポリシー URL：空
  - 利用規約 URL：空
- OAuth Client の Authorized JavaScript origins：
  - `https://y-takumi.github.io`
  - `http://localhost`
  - `http://localhost:8000`
  - `http://127.0.0.1:8000`
- OAuth Client の Authorized redirect URIs：
  - `http://localhost:8080/oauth2callback`
  - `https://Y-takumi.github.io/repo-second-brain-app/`

### 原因の暫定推測

[Google OAuth Brand Verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) ドキュメントから、**「In production」ステータスではブランディング必須**：

| フィールド | Production で必須か |
|---|---|
| **ホームページ URL（Application home page）** | ✅ 必須 |
| **プライバシーポリシー URL（Privacy policy）** | ✅ 必須 |
| **利用規約 URL（Terms of service）** | △ "optional" とも記載あり、Google Cloud Console UI では要求される可能性 |
| **Authorized domains** | ✅ 必須 |
| **デベロッパー連絡先情報** | ✅ 必須 |
| **App name / User support email** | ✅ 必須 |

**Production なのにこれらが空**であることが、エラーの直接原因の可能性が高い。

### 「Privacy Policy URL を埋める」ために必要な材料

公式ページから引用：
> "The privacy policy must be visible to users, hosted within the same domain as your application's home page, and linked to on the OAuth consent screen of the Google API Console."

つまり：
1. プライバシーポリシー ページ（HTML）を作成
2. ホームページからプライバシーポリシーへのリンクを貼る
3. **両者が同じドメイン**に存在すること（例：両方とも GitHub Pages）

---

## 3. 解決策の選択肢

### 選択肢 A：Testing モードに戻す（推奨：最速）

**メリット**：
- ブランディングを埋める必要なし
- 数分で完了

**デメリット**：
- Testing モードのリフレッシュトークンは **7 日で切れる**
- 再 OAuth 認証が週 1 回必要

**手順**：

1. Google Cloud Console → 「API とサービス」 → 「OAuth 同意画面」
2. 「**編集**」をクリック
3. 「公開ステータス」のセクションまでスクロール
4. **「本番環境」→「テスト」** に変更
5. 保存

これでブランディング未入力でも OAuth フローが通るようになる（個人用スクリプト用途）。

#### 補足：7 日問題への対処

個人用途なら大きな問題ではないが、もし不便なら：
- 毎週日曜日に再 OAuth 認証する習慣をつける
- または選択肢 B（Production のままブランディングを埋める）に切り替える

### 選択肢 B：Production のままブランディングを埋める

**メリット**：
- リフレッシュトークンが半永久的に使える（個人用なら数ヶ月〜年単位）
- OAuth フローが「本番環境」の認証で実行される（不安なし）

**デメリット**：
- ホームページ URL、プライバシーポリシー URL、利用規約 URL を準備する手間
- GitHub Pages 等で静的ページを公開する必要がある

**手順**：

#### B-1. GitHub Pages でプライバシーポリシー ページを作成

1. GitHub リポジトリ `second-brain` の `docs/` または `public/` 配下に `privacy-policy.html` を作成
2. 内容：アプリが取得するデータ、使用目的、保存場所、第三者提供の有無、問い合わせ先
3. GitHub Pages で配信（リポジトリ → Settings → Pages）
4. URL は `https://y-takumi.github.io/repo-second-brain-app/privacy-policy.html`

GitHub Pages の仕様で `https://y-takumi.github.io/repo-second-brain-app/` がホームページの URL。

#### B-2. ホームページの最小要件

ホームページには以下が必要：
- アプリの説明
- **プライバシーポリシーへのリンク**（必須）
- 利用規約へのリンク（推奨）

`https://y-takumi.github.io/repo-second-brain-app/` をホームページにする場合、そのページ内にプライバシーポリシーへの相対リンクを置く。

#### B-3. Authorized domains に `github.io` を追加

OAuth Client または Consent screen の「Authorized domains」に `github.io` を追加。

#### B-4. Cloud Console でフィールドを入力

OAuth consent screen → 「ブランディング」で：
- ロゴファイル：任意の画像（任意）
- ホームページ URL：`https://y-takumi.github.io/repo-second-brain-app/`
- プライバシーポリシー URL：`https://y-takumi.github.io/repo-second-brain-app/privacy-policy.html`
- 利用規約 URL：同上（利用規約ページを作成する場合）

#### B-5. 保存して検証

すべて入力後「保存して次へ」を数回クリック。エラーが解消されるか確認。

---

## 4. 私の推奨（CLAUDE.md「段階的に確認しながら進める」に基づく）

**まず選択肢 A を試す**：
1. 1〜2分で完了
2. これで OAuth フローが通れば OAuth 問題は完全解消
3. 7 日トークン問題は実運用してから判断できる

**選択肢 B は、必要に応じて後日移行**：
- A で運用してみて不便を感じたら GitHub Pages でプライバシーポリシー ページを作る
- 後回しでも問題ない

明日のセッションで、まず A を試し、動かなければ B に進む二段構えが効率的。

---

## 5. 関連ドキュメント

- `docs/OAUTH_SETUP.md`：YouTube OAuth セットアップ手順
- `docs/OAUTH_AND_STORAGE.md`：OAuth・LocalStorage・データアクセス権限の解説
- `docs/WRANGLE_DEPLOY.md`：wrangler の挙動と設定管理
- `memory/second-brain-2026-07-25-oauth-debug.md`：OAuth デバッグの詳細記録（2026-07-25）

---

## 6. 私の誤判断の記録（CLAUDE.md「誤った認識で情報を伝えた場合」に従う）

| 日付 | 誤った情報 | 訂正 |
|---|---|---|
| 2026-07-25 | OAuth Client にスコープ設定がある | 実際：OAuth Client には名前、JavaScript origins、redirect URIs のみ |
| 2026-07-25 | OAuth 同意画面から削除すれば OK | 実際：反映に時間がかかる、Production 要件も絡む |
| 2026-07-26 | OAuth Consent Screen の Status が Testing のままだと思っていた | 実際：**Production になっており、ブランディングが必須** |

OAuth のスコープ管理、検証モードの管理など、UI 上のどこで何が設定できるかは実装で確認しないと正確には分からない。**推測ではなく、Google Cloud Console の実際のスクリーンショット通りの状態を確認してから報告する**ことを徹底する。
