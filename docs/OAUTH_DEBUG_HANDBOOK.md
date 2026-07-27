# OAuth デバッグ・ハンドブック（再発防止用）

最終更新：2026-07-28（OAuth 問題完全解消後）

第二の脳アプリで OAuth 関連の問題が発生した時に参照する、再発防止のための詳細ガイド。
**OAuth 問題は複数のレイヤーが絡むため、各レイヤーを独立して診断する必要がある**ことを最も重要な教訓として記録する。

---

## 0. OAuth 問題のレイヤー構造（最重要）

OAuth フローには、以下の **5 つの独立したレイヤー** がある。問題発生時は各レイヤーを順に確認する必要がある。

| レイヤー | 場所 | 確認方法 |
|---|---|---|
| **1. コード（OAuth フロー実装）** | `index.html` の `initTokenClient` | `scope` パラメータが意図通りか確認 |
| **2. アプリ設定（Client ID）** | `appSettings.googleClientId` (localStorage / 初期値) | F12 Console で `appSettings.googleClientId` の値を確認 |
| **3. OAuth Client**（Google Cloud Console） | 「認証情報」ページ | JavaScript 生成元、リダイレクト URI、スコープ設定 |
| **4. OAuth Consent Screen**（Google Cloud Console） | 「OAuth 同意画面」ページ | スコープリスト（機密/非機密/制限）、テストユーザー |
| **5. Google アカウントの権限管理** | https://myaccount.google.com/permissions | 過去に許可したスコープの履歴 |

**重要**：1〜4 をすべて正しく設定しても、5 のレイヤーに問題があれば OAuth フローは失敗する。

---

## 1. 過去の OAuth 問題と根本原因（時系列）

### 1-1. `redirect_uri_mismatch`（2026-07-25 解決）

- **症状**：OAuth 認証 URL にアクセスすると 400 エラー
- **原因**：OAuth Client のリダイレクト URI と認証 URL の `redirect_uri=` パラメータが完全一致していなかった（typo: `oauth2callbac`）
- **教訓**：リダイレクト URI は完全一致が必要。大文字小文字、末尾スラッシュ、プロトコル（http/https）すべて一致させる

### 1-2. `popup_closed_by_user` でボタンが「接続中…」のまま（2026-07-25 解決）

- **症状**：OAuth 画面で操作した後、ボタンが「接続中…」のまま戻らない
- **教訓**：ボタン状態管理とエラーハンドリングを `resetDriveButton()` で必ず実装する

### 1-3. `youtube.force-ssl` スコープが OAuth Consent Screen に混在（2026-07-25 部分解決）

- **症状**：「This request contains scopes that cannot be requested together」
- **原因**：OAuth Consent Screen の「データアクセス」セクションに `youtube.force-ssl` が登録されていた（YouTube 用 OAuth Client 作成時に自動追加された）
- **教訓**：OAuth Consent Screen のスコープはプロジェクト全体に適用される

### 1-4. `doesn't comply with Google's OAuth 2.0 policy for keeping apps secure`（2026-07-26 解決）

- **症状**：OAuth 認証フローがエラーでブロック
- **原因**：公開ステータスが「Production」でブランディング必須項目（ホームページ、プライバシーポリシー、利用規約）が空だった
- **教訓**：Production ステータスでは以下のフィールドが必須：
  - Application home page URL
  - Application privacy policy link
  - Authorized domains（OAuth Client の JavaScript 生成元・リダイレクト URI と同じドメイン）

### 1-5. OAuth Client 新規作成でも解決せず（2026-07-27 誤った対応）

- **症状**：「scopes that cannot be requested together」が再発
- **誤った対応**：Drive 用 OAuth Client を新規作成（同じ Consent Screen 共有のため解決せず）
- **教訓**：同じ Consent Screen を共有する OAuth Client を作っても、Consent Screen のスコープリストが変わらなければ同じエラー

### 1-6. 新 GCP プロジェクト作成でも解決せず（2026-07-28 誤った対応）

- **症状**：「scopes that cannot be requested together」が再発
- **誤った対応**：新 GCP プロジェクトを作成し、すべての OAuth Client を再作成
- **本当の原因**：`index.html` の `appSettings.googleClientId` の初期値が古い GCP プロジェクトの Client ID のままだった
- **教訓**：クライアント ID の初期値を手動で更新していなかった

### 1-7. Google アカウントの権限管理に過去の `youtube.force-ssl` 許可が残っていた（2026-07-28 解決）

- **症状**：「scopes that cannot be requested together」が継続
- **原因**：Google アカウント（`takumi.yasuda.biz@gmail.com`）に、過去に `second-brain-app`（旧 GCP プロジェクト）で `youtube.force-ssl` を許可した履歴が残っていた
- **OAuth 仕様**：incremental authorization（段階的認可）により、過去に許可したスコープが OAuth フローに自動的に含まれる
- **修正**：https://myaccount.google.com/permissions で `second-brain-app` のアクセス権を全て削除
- **教訓**：Google アカウントの権限管理は OAuth Consent Screen とは別の独立したレイヤー

---

## 2. OAuth 問題診断のフローチャート

OAuth エラーが発生した場合、以下のフローチャートに従って診断する：

```
[OAuth エラー発生]
   ↓
[Step 1] エラーメッセージを確認
   ├── 「redirect_uri_mismatch」
   │     → OAuth Client のリダイレクト URI と認証 URL の redirect_uri パラメータが完全一致しているか確認
   │
   ├── 「invalid_client」
   │     → Client ID が正しいか確認（F12 Console で appSettings.googleClientId を確認）
   │
   ├── 「This request contains scopes that cannot be requested together」
   │     → Step 2 へ（複数スコープ問題）
   │
   ├── 「doesn't comply with OAuth 2.0 policy for keeping apps secure」
   │     → Production ステータスでブランディング必須項目を全て埋める
   │
   └── その他のエラー
         → エラーメッセージ全文を Google で検索
   ↓
[Step 2] 「scopes that cannot be requested together」の診断
   ├── Layer 1: index.html の initTokenClient の scope パラメータを確認
   │            → drive.file のみであることを確認
   │
   ├── Layer 2: appSettings.googleClientId を確認（F12 Console）
   │            → 正しい GCP プロジェクトの Client ID か？
   │
   ├── Layer 3: OAuth Client のスコープ設定を確認
   │            → OAuth Client 編集画面に「スコープ」セクションがあれば確認
   │
   ├── Layer 4: OAuth Consent Screen のスコープリストを確認
   │            → drive.file のみであることを確認（機密/非機密/制限すべて）
   │
   └── Layer 5: Google アカウントの権限管理を確認 ★最重要★
              → https://myaccount.google.com/permissions
              → second-brain-app のアクセス権を全て削除
```

---

## 3. Google アカウントの権限管理（最重要レイヤー）

### 3-1. アクセス権の確認方法

1. **https://myaccount.google.com/permissions** を開く
2. `takumi.yasuda.biz@gmail.com` でログイン
3. 「サードパーティ アプリ」セクションを確認
4. `second-brain-app` をクリック
5. 「アクセスできるサービス」の一覧を確認
   - Google Drive API（`drive.file`）が含まれているか
   - YouTube Data API（`youtube.force-ssl`）が **含まれていない** か ← 重要

### 3-2. アクセス権の削除方法

1. `second-brain-app` のページで **「アクセス権を削除」** をクリック
2. 確認ダイアログで **「OK」**
3. **すべてのスコープ（drive.file と youtube.force-ssl）が取り消される**
4. 5 分待つ（OAuth サーバー側キャッシュ反映）
5. OAuth フローを再テスト

### 3-3. incremental authorization の罠

OAuth の incremental authorization（段階的認可）の仕様：
- 過去に `youtube.force-ssl` を許可したことがあると、その情報が Google アカウントに保存される
- 新 GCP プロジェクトで Drive フローを実行しても、OAuth サーバーは「このアカウントは YouTube スコープも許可したことがある」と認識
- → 「cannot be requested together」エラー
- **OAuth Consent Screen のスコープリストには youtube.force-ssl が無くても、Google アカウント側に許可履歴があればエラーになる**

これは **Google アカウント側のレイヤー** で、OAuth Consent Screen をいくら調整しても解決しない。

---

## 4. チェックリスト（OAuth 設定時の必須確認）

### 4-1. 新 GCP プロジェクト作成時

- [ ] プロジェクト ID をメモ（`123456789012-` で始まる ID）
- [ ] Google Drive API を有効化
- [ ] YouTube Data API v3 を有効化（YouTube 機能を使う場合）

### 4-2. OAuth Consent Screen 作成時

- [ ] User Type: **External**（個人開発の場合）
- [ ] アプリ名: `Second Brain`
- [ ] User support email: 自分の Gmail
- [ ] Developer contact: 自分の Gmail
- [ ] スコープ: **必要最小限のみ追加**
  - Drive 用: `drive.file` のみ
  - YouTube 用: `youtube.force-ssl` のみ（YouTube 機能を使う場合）
  - **両方を同じ Consent Screen に登録すると、スコープ問題が発生する**
- [ ] Test users: 自分の Gmail アドレス
- [ ] Publishing status: **Testing**（個人開発の場合）

### 4-3. OAuth Client 作成時（Drive 用）

- [ ] アプリケーションの種類: **Web アプリケーション**
- [ ] 名前: `second-brain-drive-v2` など
- [ ] JavaScript 生成元（4 つ）:
  - `https://y-takumi.github.io`
  - `http://localhost`
  - `http://localhost:8000`
  - `http://127.0.0.1:8000`
- [ ] リダイレクト URI（2 つ）:
  - `http://localhost:8080/oauth2callback`
  - `https://y-takumi.github.io/repo-second-brain-app/` ← **小文字 y**
- [ ] 作成後 Client ID をメモ

### 4-4. OAuth Client 作成時（YouTube 用）

- [ ] アプリケーションの種類: **Web アプリケーション**
- [ ] 名前: `second-brain-youtube-v2` など
- [ ] JavaScript 生成元: `http://localhost` のみ
- [ ] リダイレクト URI: `http://localhost:8080/oauth2callback` のみ
- [ ] スコープ: `youtube.force-ssl` を追加（OAuth Consent Screen に自動登録される）
- [ ] 作成後 Client ID と Client Secret をメモ

### 4-5. アプリ設定更新（index.html）

- [ ] `appSettings.googleClientId` の初期値を Phase 4 で取得した Drive 用 Client ID に更新
- [ ] `appSettings.youtubeClientId` の初期値を Phase 5 で取得した YouTube 用 Client ID に更新
- [ ] ※ **wrangler.toml の `YOUTUBE_CLIENT_ID` も同じ値にする**

### 4-6. Cloudflare Workers Secret 更新

```powershell
cd C:\ClaudeCodeProject\second-brain
npx wrangler secret put YOUTUBE_CLIENT_SECRET
npx wrangler secret put YOUTUBE_REFRESH_TOKEN
npx wrangler deploy
```

### 4-7. 開発者設定画面での更新（動作確認）

- [ ] ブラウザで `http://localhost:8000/` を開く
- [ ] ⚙ アイコン → 開発者設定画面
- [ ] 「Google OAuth Client ID（Drive 用）」に正しい Client ID を入力
- [ ] F12 Console で `appSettings.googleClientId` を確認
- [ ] 開発者設定画面の値が Console の値と一致することを確認

### 4-8. Google アカウントの権限確認（**最重要**）

- [ ] https://myaccount.google.com/permissions を開く
- [ ] `second-brain-app` のアクセス権を確認
- [ ] 過去の youtube.force-ssl 許可が残っていないか確認
- [ ] 残っていれば「アクセス権を削除」
- [ ] 5 分待つ

### 4-9. OAuth テスト

- [ ] ブラウザキャッシュ完全クリア（`Ctrl + Shift + Delete`）
- [ ] `http://localhost:8000/` を開く
- [ ] 「Google Driveと連携する」ボタン
- [ ] Google アカウント選択
- [ ] OAuth 同意画面で `drive.file` のみ要求を確認
- [ ] 「許可」

---

## 5. よくある落とし穴と対策

### 落とし穴 1：Client ID の取り違え

- **症状**：OAuth Consent Screen のスコープは正しいのに、エラーが出る
- **原因**：`appSettings.googleClientId` に古い GCP プロジェクトの Client ID が入っている
- **対策**：F12 Console で `appSettings.googleClientId` を確認し、正しい値か検証する
- **予防**：`index.html` の `appSettings` 初期値を **新 GCP プロジェクト作成時に必ず更新**する

### 落とし穴 2：localStorage の永続化忘れ

- **症状**：開発者設定画面で値を入力しても、リロード後に消える
- **原因**：`saveDevSettings` 関数が `localStorage.setItem` を呼んでいない（実装漏れ）
- **対策**：`saveDevSettings` 関数に以下を追加：
  ```javascript
  try {
    localStorage.setItem("sb_app_settings", JSON.stringify(appSettings));
  } catch(e) {
    console.error("設定の保存に失敗:", e);
  }
  ```
- **予防**：設定変更時は必ず localStorage に保存する

### 落とし穴 3：Google アカウントの権限管理を見落とす

- **症状**：OAuth Consent Screen のスコープは正しく、Client ID も正しいのに、エラーが出る
- **原因**：Google アカウントに過去のスコープ許可が残っている（incremental authorization）
- **対策**：https://myaccount.google.com/permissions で権限削除
- **予防**：OAuth 問題診断時は **必ず Layer 5（Google アカウント）を確認**

### 落とし穴 4：大文字小文字の不一致

- **症状**：「redirect_uri_mismatch」エラー
- **原因**：`https://Y-takumi.github.io/...` と `https://y-takumi.github.io/...` の大文字小文字
- **対策**：リダイレクト URI は **小文字** で統一する

### 落とし穴 5：Production ステータスでブランディング必須項目が空

- **症状**：「doesn't comply with OAuth 2.0 policy」エラー
- **原因**：ホームページ、プライバシーポリシー、利用規約の URL が空
- **対策**：Production に切り替える前に必須項目を全て埋める、または Testing のままにする

### 落とし穴 6：OAuth Client のスコープ設定を忘れる

- **症状**：「scopes that cannot be requested together」エラー
- **原因**：OAuth Client 作成時に YouTube スコープが自動登録された
- **対策**：Drive 用 OAuth Client には YouTube スコープを設定しない

---

## 6. 私の判断ミス一覧（2026-07-25 〜 2026-07-28）

CLAUDE.md「誤った認識で情報を伝えた場合、関連するシステムの設定方法などを調査してから訂正する」を守れば防げたはずの判断ミス：

| 日付 | 判断ミス | 正しい対応 |
|---|---|---|
| 2026-07-25 | 「OAuth Client にスコープ設定がある」と説明 | 実際はない（OAuth Client には名前、JavaScript origins、redirect URIs のみ） |
| 2026-07-25 | 「OAuth Consent Screen から削除すれば OK」と単純化 | 反映に時間がかかる、Production 要件も絡む |
| 2026-07-26 | 「OAuth Consent Screen の Status は Testing のまま」と推測 | 実際は **Production** になっていた |
| 2026-07-27 | 「OAuth Client を新規作成すれば解決する」と推測 | 同じ Consent Screen 共有のため解決せず |
| 2026-07-28 | 「新 GCP プロジェクトを作成すれば解決する」と推測 | `appSettings.googleClientId` の初期値が古いままだった |
| 2026-07-28 | 「OAuth Consent Screen のスコープを確認すれば十分」と推測 | **Google アカウントの権限管理（Layer 5）** を確認していなかった |

---

## 7. 次回 OAuth 問題が発生した時の最初の 5 分

1. **エラーメッセージを正確に記録**（英語部分も含めて全文コピー）
2. **レイヤーを順に確認**（上記フローチャート参照）
3. **Google アカウントの権限管理を必ず確認**（Layer 5）
4. **Context7 で最新仕様を確認**（CLAUDE.md のルール）
5. **推測で動かず、確認後に動く**

---

## 8. 関連ドキュメント

- `docs/OAUTH_AND_STORAGE.md`：OAuth・LocalStorage・データアクセス権限の解説
- `docs/OAUTH_SETUP.md`：YouTube OAuth セットアップ手順
- `docs/OAUTH_TROUBLESHOOTING.md`：エラー一覧と時系列の経緯
- `docs/NODEJS_GUIDE.md`：Node.js 初心者向けガイド
- `memory/second-brain-2026-07-25-oauth-debug.md`：2026-07-25 のデバッグ記録
- `memory/second-brain-2026-07-28-oauth-resolved.md`：2026-07-28 解決記録

---

## 9. 謝罪と反省

2026-07-25 から 2026-07-28 までの 3 日間で、Claude Code（私）は OAuth 問題を何度も誤判断しました。

- ユーザー（@tackman さん）に何度も無駄な手順を踏ませた
- 「できます」と安易に言わず、制約・トレードオフ・懸念点を最初に伝えるべきだった
- Context7 で最新仕様を確認するのを怠った
- 推測で次の手順を提示し続けた

**再発防止のため、このハンドブックを作成し、CLAUDE.md の指示を徹底する**：

> 「外部ライブラリ・API・クラウドサービスの仕様を扱う時は、記憶で判断せず必ず Context7 で最新ドキュメントを確認してからコーディングやユーザーへの指示を行うこと」
>
> 「誤った認識で情報を伝えた場合、関連するシステムの設定方法などを調査してから訂正する」

---

最終更新：2026-07-28（OAuth 問題完全解消後）