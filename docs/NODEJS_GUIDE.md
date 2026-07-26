# Node.js ガイド（第二の脳プロジェクト用）

Tackman さんが Node.js 初心者であることを前提に、**このプロジェクトで必要になる範囲** に絞って説明します。

---

## Node.js とは何か

**ブラウザの外で JavaScript を実行する環境**。

- JavaScript は本来、ブラウザ（Chrome、Edge など）の中だけで動く言語
- Node.js を使うと、**ターミナル（PowerShell）でも JavaScript を実行**できる
- このプロジェクトでは **Cloudflare Workers のデプロイ（wrangler CLI）** で使う

### 例え話

- ブラウザの JavaScript = 車の中だけで動くエンジン
- Node.js = 車から降ろして、地面の上でも動かせるようにしたエンジン

---

## npm と npx の違い

### npm（Node Package Manager）

**ライブラリ（パッケージ）をインストール・管理するツール**。

| コマンド | 役割 |
|---|---|
| `npm install -g wrangler` | wrangler を **グローバルインストール**（PC 全体で使える） |
| `npm install <pkg>` | プロジェクトに **ローカルインストール**（そのプロジェクトだけ） |
| `npm list -g` | インストール済みのパッケージ一覧 |

### npx（Node Package eXecute）

**インストールせずにパッケージを実行する**ツール。

| コマンド | 役割 |
|---|---|
| `npx http-server -p 8000` | http-server を **インストールせずに実行** |
| `npx wrangler` | wrangler を **インストールせずに実行**（普通は install するので使わない） |

### 使い分け

| やりたいこと | コマンド |
|---|---|
| ツールを **インストールして使い続ける** | `npm install -g <pkg>` |
| **1 回だけ**使いたい | `npx <pkg>` |

このプロジェクトでは：
- `wrangler` は **毎日使う**ので `npm install -g wrangler` でインストール済み
- `http-server` は **OAuth テストの時だけ**使うので `npx http-server -p 8000`

---

## このプロジェクトで Node.js が必要な場面

### 1. wrangler コマンド（Cloudflare Worker デプロイ）

```powershell
# Worker を再デプロイ
wrangler deploy

# ログイン
wrangler login

# Secret を追加
wrangler secret put <SECRET_NAME>
```

### 2. ローカルサーバー（OAuth テスト用）

```powershell
cd C:\ClaudeCodeProject\second-brain
npx http-server -p 8000
```

起動したらブラウザで `http://localhost:8000/` を開く。

---

## よく使うコマンド集

### Node.js / npm のバージョン確認

```powershell
node --version    # Node.js のバージョン
npm --version     # npm のバージョン
```

### パッケージのインストール

```powershell
# グローバルインストール（PC 全体で使える）
npm install -g wrangler

# プロジェクト内インストール（このプロジェクトだけ）
npm install wrangler
```

### インストール済みパッケージの確認

```powershell
npm list -g
```

### パッケージのアンインストール

```powershell
npm uninstall -g wrangler
```

---

## トラブルシューティング

### Q: `'node' is not recognized` というエラーが出る

**A**: Node.js がインストールされていない、または PATH が通っていない。

#### 確認手順

1. `node --version` を実行
2. バージョン番号が表示されれば OK
3. バージョンが表示されない場合：
   - Node.js がインストールされているか確認（`winget list` またはコントロールパネル）
   - インストールされているなら PATH を通す：
     ```powershell
     $env:Path = "C:\Program Files\nodejs;" + $env:Path
     ```

### Q: `'wrangler' is not recognized` というエラーが出る

**A**: wrangler がインストールされていない、または PATH が通っていない。

#### 確認手順

1. `wrangler --version` を実行
2. バージョン番号が表示されれば OK
3. バージョンが表示されない場合：
   - `npm install -g wrangler` で再インストール
   - PATH を通す：
     ```powershell
     $env:Path = "C:\Users\takum\AppData\Roaming\npm;" + $env:Path
     ```

### Q: `PowerShell のスクリプト実行が無効` というエラーが出る

**A**: PowerShell の Execution Policy がデフォルトで `Restricted` になっている。

#### 解決方法

```powershell
# 現在のユーザーにだけ許可（推奨）
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

または、`.cmd` ファイルを直接実行：
```powershell
& "C:\Users\takum\AppData\Roaming\npm\wrangler.cmd" login
```

### Q: `npm install` が遅い・エラーが出る

**A**: ネットワーク接続を確認。プロキシ環境の場合は設定が必要。

```powershell
# プロキシ設定
npm config set proxy "http://proxy.example.com:8080"
npm config set https-proxy "http://proxy.example.com:8080"
```

### Q: PowerShell で `npm` が見つからない

**A**: PATH が反映されていない。新しい PowerShell ウィンドウを開くか、毎回 `$env:Path` を設定する。

---

## このプロジェクトで使う主な Node.js ツール

| ツール | 用途 | インストール方法 |
|---|---|---|
| **wrangler** | Cloudflare Worker デプロイ | `npm install -g wrangler` |
| **http-server** | ローカル HTTP サーバー（OAuth テスト用） | `npx http-server -p 8000`（インストール不要） |
| **node** | JavaScript 実行環境 | Node.js 本体に含まれる |

---

## もっと詳しく知りたい場合

- Node.js 公式：https://nodejs.org/
- npm 公式：https://www.npmjs.com/
- wrangler 公式：https://developers.cloudflare.com/workers/wrangler/

---

## 関連ドキュメント

- `docs/WRANGLE_DEPLOY.md`：wrangler の挙動と設定管理
- `docs/OAUTH_AND_STORAGE.md`：OAuth・LocalStorage・データアクセス権限
- `docs/OAUTH_SETUP.md`：YouTube 用 OAuth 設定手順