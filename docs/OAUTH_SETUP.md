# YouTube 字幕取得のための OAuth 設定ガイド

## 概要

YouTube 動画から字幕を取得して Source 入力パイプラインで要約するため、YouTube Data API の OAuth 2.0 認証を設定する。

**重要**：YouTube Data API の `captions.download` エンドポイントは **OAuth 認証が必要** で、API キーだけでは字幕テキストを取得できない。本格的な YouTube 字幕対応のため、OAuth 2.0 認証を導入する。

## 前提条件

- Google Cloud Console でプロジェクトが作成済み（API キー発行済みのプロジェクトと同じ）
- YouTube Data API v3 が有効化済み
- 同じプロジェクトで作業する

---

## 手順

### Step 1: OAuth 2.0 クライアント ID を作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを選択（API キーを発行したプロジェクト）
3. 左メニューから「**APIとサービス**」→「**認証情報**」
4. 上部の「**+ 認証情報を作成**」→「**OAuth クライアント ID**」
5. 以下を入力：
   - **アプリケーションの種類**: 「**Web アプリケーション**」
   - **名前**: `second-brain-youtube`（任意）
   - **承認済みのリダイレクト URI**:
     - 「**URI を追加**」をクリック
     - `http://localhost:8080/oauth2callback` を入力
6. 「**作成**」をクリック
7. 表示されるダイアログで以下をメモ：
   - **クライアント ID**（後で使います）
   - **クライアント シークレット**（後で使います）
   - ⚠️ クライアント シークレットは**この時しか表示されません**。必ず控えてください

### Step 2: OAuth 同意画面の設定

OAuth クライアントを作成すると、同意画面の設定を促すメッセージが出るので、従う。

1. 左メニューから「**APIとサービス**」→「**OAuth 同意画面**」
2. **User Type**: 「**外部**」を選択 → 「**作成**」
3. **アプリ情報**:
   - **アプリ名**: `Second Brain`
   - **ユーザーサポートメール**: 自分のGmail アドレス
   - **デベロッパーの連絡先情報**: 自分のGmail アドレス
4. **スコープ**:
   - 「**スコープを追加または削除**」
   - `https://www.googleapis.com/auth/youtube.force-ssl` を検索して選択
   - 「**更新**」→「**保存して次へ**」
5. **テストユーザー**:
   - 「**+ ユーザーを追加**」をクリック
   - 自分の Gmail アカウント（`takumi.yasuda.biz@gmail.com`）を追加
6. 「**保存して次へ**」を数回クリックして完了

### Step 3: 認証 URL を生成してブラウザで開く

以下の URL の `YOUR_CLIENT_ID` を Step 1 で取得したクライアント ID に置き換えて、ブラウザで開いてください。

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:8080/oauth2callback&response_type=code&scope=https://www.googleapis.com/auth/youtube.force-ssl&access_type=offline&prompt=consent
```

例（実際のクライアント ID が `123456789-abc...xyz.apps.googleusercontent.com` の場合）：

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=123456789-abc...xyz.apps.googleusercontent.com&redirect_uri=http://localhost:8080/oauth2callback&response_type=code&scope=https://www.googleapis.com/auth/youtube.force-ssl&access_type=offline&prompt=consent
```

### Step 4: authorization code を取得

1. ブラウザで Step 3 の URL を開く
2. Google アカウントを選択（自分の Gmail アカウント）
3. 「このアプリが自分のGoogleアカウントへのアクセスを求めています」という画面が出る
4. スコープ（YouTube データの管理）の同意を求められるので「**許可**」をクリック
5. リダイレクト先の URL が `http://localhost:8080/oauth2callback?code=...&scope=...` の形で表示される
   - **重要**: localhost:8080 でリダイレクトするが、**何も表示されない**（ローカルでサーバーが立ち上がっていないため）。これは正常な動作
6. **ブラウザのアドレスバーの URL をコピー**
7. URL から `code=` 以降、`&` の前までの文字列を抽出（これが authorization code）

例: `http://localhost:8080/oauth2callback?code=4/0AXXYYZZ...&scope=...` の場合、`code` は `4/0AXXYYZZ...`

### Step 5: リフレッシュトークンを取得

PowerShell を開いて、以下のコマンドを実行。`YOUR_CLIENT_ID`、`YOUR_CLIENT_SECRET`、`YOUR_AUTH_CODE` を置き換えてください。

```powershell
$body = @{
  client_id     = "YOUR_CLIENT_ID"
  client_secret = "YOUR_CLIENT_SECRET"
  code          = "YOUR_AUTH_CODE"
  grant_type    = "authorization_code"
  redirect_uri  = "http://localhost:8080/oauth2callback"
}

$response = Invoke-RestMethod -Method Post `
  -Uri "https://oauth2.googleapis.com/token" `
  -Body $body `
  -ContentType "application/x-www-form-urlencoded"

Write-Output "Access Token: $($response.access_token)"
Write-Output "Refresh Token: $($response.refresh_token)"
```

成功すると、Access Token と Refresh Token が表示されます。

- **`refresh_token` を必ずメモ**（後で Cloudflare Workers に保存します）
- Access Token は短命なので無視 OK（Worker が自動的に再取得します）

### Step 6: Cloudflare Workers に Secret を設定

以下の3つを、既存の `ANTHROPIC_API_KEY` と同じ手順で Cloudflare Workers の Secret として設定：

| Variable name | Value |
|---|---|
| `YOUTUBE_REFRESH_TOKEN` | Step 5 で取得した refresh_token |
| `YOUTUBE_CLIENT_ID` | Step 1 で取得した client_id |
| `YOUTUBE_CLIENT_SECRET` | Step 1 で取得した client_secret |

設定手順：

1. Cloudflare Dashboard → **Workers & Pages** → 該当 Worker（`second-brain-proxy`）を選択
2. **Settings** タブ → **Variables** セクション
3. 「**Add variable**」をクリック
4. 以下を入力：
   - **Variable name**: 上記の表の通り
   - **Type**: **Secret**（重要！平文ではないこと）
   - **Value**: 該当の値
5. 「**Save**」

3つすべてを保存してください。

---

## 完了確認

すべて完了したら、明日 Claude Code が Worker コードに YouTube エンドポイントを追加します。Worker 側の実装が終わったら、`https://second-brain-proxy.takumi-yasuda-biz.workers.dev/youtube-transcript?url=...` で字幕が取得できるようになります。

## 注意点

- **リフレッシュトークンは半永久的に使えます**が、以下の条件で無効になります：
  - Google アカウントのパスワードを変更
  - OAuth 同意画面でスコープを削除
  - テストモードのままだと **7 日で失効** する（一般公開する場合は Google の審査が必要）
- **クライアント シークレットは再表示できません**。なくした場合は OAuth クライアントを作り直してください
- **authorization code は 1 回しか使えません**。Step 5 を再実行する場合は、Step 3 からやり直し

## トラブルシューティング

### 「redirect_uri_mismatch」エラーが出る
- Step 1 で設定した「承認済みのリダイレクト URI」と、Step 3 の URL の `redirect_uri=` パラメータが完全一致しているか確認
- 末尾のスラッシュや大文字小文字も揃える

### 「invalid_grant」エラーが出る
- authorization code の有効期限が切れている（10分程度）。Step 3 からやり直す
- もしくは Step 5 のパラメータに typo がある

### 「access_denied」エラーが出る
- Step 2 でテストユーザーとして自分の Gmail を追加していない可能性
- もしくはスコープの同意画面で「許可」ではなく「拒否」をクリックした

### リフレッシュトークンが返ってこない
- Step 3 の URL に `&prompt=consent` パラメータが含まれているか確認（含まれていないと refresh_token が返らない）
- 既に同じ OAuth フローでアクセストークンを取得している場合、2回目以降は refresh_token が返らないことがある。その場合は OAuth クライアントを revoke してから Step 3 からやり直す
