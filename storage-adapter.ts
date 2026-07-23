/**
 * 第二の脳 — ストレージ・アダプタ層
 *
 * フロントエンド（スマホUI）は常にこの共通インターフェースだけを見て動く。
 * バックエンド（GitHub / Google Drive / OneDrive / Local）はこのインターフェースを
 * 実装したアダプタを1つ差し替えるだけで切り替えられる。
 */

// ===== 共通インターフェース =====

export interface FileMeta {
  path: string;       // 例: "01_Journal/2026-07-04_journal.md"
  updated: string;     // ISO日付
  versionTag?: string; // 楽観的ロック用（GitHubならsha、他は更新日時など）
}

export interface NoteFile extends FileMeta {
  content: string; // frontmatter込みの生Markdown
}

export interface StorageAdapter {
  readonly id: "github" | "google-drive" | "onedrive" | "local";

  isAuthenticated(): Promise<boolean>;
  authenticate(): Promise<void>;

  /** prefixで絞ったファイル一覧を返す。例: list("01_Journal/") */
  list(prefix?: string): Promise<FileMeta[]>;

  read(path: string): Promise<NoteFile>;

  /**
   * 書き込み。versionTagを渡すと、他の場所（Obsidian等）で
   * 同時に更新されていないかの競合チェックに使う。
   */
  write(path: string, content: string, versionTag?: string): Promise<NoteFile>;

  delete(path: string): Promise<void>;
}

// ===== GitHubアダプタ実装 =====
//
// 認証方式：まずは Personal Access Token（PAT）を使う。
// 理由：今はまだ自分1人〜数人規模（フェーズ0〜1）なので、各ユーザーが
// 自分のPATを発行して設定する運用で十分。フェーズ2で多人数向けに公開する
// 段階になったら、正式なGitHub App / OAuth Appに切り替える（このクラスの
// 外側のauthenticate()の中身を差し替えるだけで済む設計にしてある）。

interface GitHubAdapterConfig {
  owner: string;   // GitHubユーザー名
  repo: string;    // 例: "second-brain-vault-takumi"
  branch?: string; // 省略時 "main"
  token: string;   // Personal Access Token（repo権限）
}

export class GitHubAdapter implements StorageAdapter {
  readonly id = "github" as const;
  private config: GitHubAdapterConfig;
  private apiBase = "https://api.github.com";

  constructor(config: GitHubAdapterConfig) {
    this.config = { branch: "main", ...config };
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async isAuthenticated(): Promise<boolean> {
    const res = await fetch(`${this.apiBase}/user`, { headers: this.headers() });
    return res.ok;
  }

  async authenticate(): Promise<void> {
    // PAT方式では「入力してもらったトークンを保存する」だけでよい。
    // 将来OAuth Appに切り替える場合はここをdevice flow等に差し替える。
    const ok = await this.isAuthenticated();
    if (!ok) throw new Error("GitHubトークンが無効です。設定画面で確認してください。");
  }

  async list(prefix = ""): Promise<FileMeta[]> {
    const { owner, repo, branch } = this.config;
    // Git Trees APIで再帰的に一覧取得（1リクエストで全ファイル取れる）
    const treeRes = await fetch(
      `${this.apiBase}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: this.headers() }
    );
    if (!treeRes.ok) throw new Error(`一覧取得に失敗しました: ${treeRes.status}`);
    const tree = await treeRes.json();

    return tree.tree
      .filter((item: any) => item.type === "blob" && item.path.startsWith(prefix) && item.path.endsWith(".md"))
      .map((item: any) => ({
        path: item.path,
        updated: "", // Trees APIには更新日時が含まれないため、必要ならcommits APIで別途取得
        versionTag: item.sha,
      }));
  }

  async read(path: string): Promise<NoteFile> {
    const { owner, repo, branch } = this.config;
    const res = await fetch(
      `${this.apiBase}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`,
      { headers: this.headers() }
    );
    if (!res.ok) throw new Error(`読み込みに失敗しました: ${path} (${res.status})`);
    const data = await res.json();
    const content = decodeBase64Utf8(data.content);
    return { path, content, updated: "", versionTag: data.sha };
  }

  async write(path: string, content: string, versionTag?: string): Promise<NoteFile> {
    const { owner, repo, branch } = this.config;

    // 競合チェック：versionTagが渡されていて、現在のshaと違う場合は
    // Obsidian側などで先に更新されている可能性がある
    let currentSha = versionTag;
    if (!currentSha) {
      try {
        const existing = await this.read(path);
        currentSha = existing.versionTag;
      } catch {
        currentSha = undefined; // 新規ファイル
      }
    }

    const res = await fetch(
      `${this.apiBase}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `update: ${path}`, // コミットメッセージ＝変更履歴として自然に残る
          content: encodeBase64Utf8(content),
          sha: currentSha,
          branch,
        }),
      }
    );
    if (!res.ok) {
      if (res.status === 409) throw new Error("競合が発生しました。最新のバージョンを取得し直してください。");
      throw new Error(`書き込みに失敗しました: ${path} (${res.status})`);
    }
    const data = await res.json();
    return { path, content, updated: data.commit?.committer?.date ?? "", versionTag: data.content.sha };
  }

  async delete(path: string): Promise<void> {
    const existing = await this.read(path);
    const { owner, repo, branch } = this.config;
    const res = await fetch(
      `${this.apiBase}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      {
        method: "DELETE",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: `delete: ${path}`, sha: existing.versionTag, branch }),
      }
    );
    if (!res.ok) throw new Error(`削除に失敗しました: ${path} (${res.status})`);
  }
}

// GitHub Contents APIはBase64（UTF-8考慮）でのやり取りが必要
function encodeBase64Utf8(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}
function decodeBase64Utf8(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
}

// ===== Google Driveアダプタ実装 =====
//
// スコープは "drive.file" のみを使う。これは「このアプリ自身が作成した
// ファイルにしかアクセスできない」非公開スコープで、Googleの審査
// （verification）が最も軽いカテゴリ。ユーザーの他のDriveファイルには
// 一切触れないので、権限的にも安全。
//
// 認証はGoogle Identity Services（GIS）のトークンクライアントを使う。
// バックエンドサーバーもclient_secretも不要で、ブラウザだけで完結する
// （PWAとの相性が良い）。
//
// フォルダ階層は作らず、ルートフォルダ1つの直下にファイルをフラットに置き、
// 各ファイルの appProperties.path に "01_Journal/2026-07-05.md" のような
// 仮想パスを持たせて管理する（GitHubアダプタと同じpath文字列の概念を踏襲）。

declare const google: any; // Google Identity Services (gsi client) をscriptタグで読み込む前提

interface GoogleDriveAdapterConfig {
  clientId: string;      // Google Cloud ConsoleのOAuthクライアントID
  rootFolderName?: string; // 省略時 "second-brain-vault"
}

export class GoogleDriveAdapter implements StorageAdapter {
  readonly id = "google-drive" as const;
  private config: GoogleDriveAdapterConfig;
  private accessToken: string | null = null;
  private rootFolderId: string | null = null;
  private tokenClient: any = null;
  private apiBase = "https://www.googleapis.com/drive/v3";
  private uploadBase = "https://www.googleapis.com/upload/drive/v3";

  constructor(config: GoogleDriveAdapterConfig) {
    this.config = { rootFolderName: "second-brain-vault", ...config };
    this.accessToken = sessionStorage.getItem("gdrive-token");
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.accessToken) return false;
    const res = await fetch(`${this.apiBase}/about?fields=user`, { headers: this.headers() });
    return res.ok;
  }

  authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: (resp: any) => {
          if (resp.error) return reject(new Error(resp.error));
          this.accessToken = resp.access_token;
          sessionStorage.setItem("gdrive-token", resp.access_token); // タブを閉じたら再認証。永続化したい場合はrefresh tokenの実装が別途必要
          resolve();
        },
      });
      this.tokenClient.requestAccessToken();
    });
  }

  private headers() {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  private async ensureRootFolder(): Promise<string> {
    if (this.rootFolderId) return this.rootFolderId;
    const q = encodeURIComponent(
      `name='${this.config.rootFolderName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`
    );
    const searchRes = await fetch(`${this.apiBase}/files?q=${q}&fields=files(id,name)`, { headers: this.headers() });
    const searchData = await searchRes.json();
    if (searchData.files?.length) {
      this.rootFolderId = searchData.files[0].id;
      return this.rootFolderId!;
    }
    // 存在しなければ作成
    const createRes = await fetch(`${this.apiBase}/files`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: this.config.rootFolderName, mimeType: "application/vnd.google-apps.folder" }),
    });
    const created = await createRes.json();
    this.rootFolderId = created.id;
    return this.rootFolderId!;
  }

  /** 仮想pathからDriveのfileIdを探す（appProperties.pathで検索） */
  private async findFileId(path: string): Promise<{ id: string; version: string } | null> {
    const rootId = await this.ensureRootFolder();
    const q = encodeURIComponent(
      `'${rootId}' in parents and appProperties has { key='path' and value='${path}' } and trashed=false`
    );
    const res = await fetch(`${this.apiBase}/files?q=${q}&fields=files(id,version)`, { headers: this.headers() });
    const data = await res.json();
    if (!data.files?.length) return null;
    return { id: data.files[0].id, version: data.files[0].version };
  }

  async list(prefix = ""): Promise<FileMeta[]> {
    const rootId = await this.ensureRootFolder();
    const q = encodeURIComponent(`'${rootId}' in parents and trashed=false`);
    const res = await fetch(
      `${this.apiBase}/files?q=${q}&fields=files(id,appProperties,modifiedTime,version)&pageSize=1000`,
      { headers: this.headers() }
    );
    const data = await res.json();
    return (data.files ?? [])
      .filter((f: any) => f.appProperties?.path?.startsWith(prefix))
      .map((f: any) => ({ path: f.appProperties.path, updated: f.modifiedTime, versionTag: f.version }));
  }

  async read(path: string): Promise<NoteFile> {
    const found = await this.findFileId(path);
    if (!found) throw new Error(`ファイルが見つかりません: ${path}`);
    const res = await fetch(`${this.apiBase}/files/${found.id}?alt=media`, { headers: this.headers() });
    if (!res.ok) throw new Error(`読み込みに失敗しました: ${path} (${res.status})`);
    const content = await res.text();
    return { path, content, updated: "", versionTag: found.version };
  }

  async write(path: string, content: string, versionTag?: string): Promise<NoteFile> {
    const found = await this.findFileId(path);

    if (found && versionTag && found.version !== versionTag) {
      throw new Error("競合が発生しました。最新のバージョンを取得し直してください。");
    }

    if (found) {
      // 更新：メディアのみ差し替え
      const res = await fetch(`${this.uploadBase}/files/${found.id}?uploadType=media`, {
        method: "PATCH",
        headers: { ...this.headers(), "Content-Type": "text/markdown" },
        body: content,
      });
      if (!res.ok) throw new Error(`書き込みに失敗しました: ${path} (${res.status})`);
      const data = await res.json();
      return { path, content, updated: "", versionTag: data.version };
    } else {
      // 新規作成：multipart（メタデータ＋本文）
      const rootId = await this.ensureRootFolder();
      const fileName = path.split("/").pop() ?? path;
      const metadata = {
        name: fileName,
        parents: [rootId],
        appProperties: { path, app: "second-brain" },
      };
      const boundary = "second-brain-boundary";
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: text/markdown\r\n\r\n${content}\r\n--${boundary}--`;
      const res = await fetch(`${this.uploadBase}/files?uploadType=multipart`, {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      if (!res.ok) throw new Error(`新規作成に失敗しました: ${path} (${res.status})`);
      const data = await res.json();
      return { path, content, updated: "", versionTag: data.version };
    }
  }

  async delete(path: string): Promise<void> {
    const found = await this.findFileId(path);
    if (!found) return;
    const res = await fetch(`${this.apiBase}/files/${found.id}`, { method: "DELETE", headers: this.headers() });
    if (!res.ok) throw new Error(`削除に失敗しました: ${path} (${res.status})`);
  }
}

// ===== 使用イメージ（Google Drive） =====
//
// <script src="https://accounts.google.com/gsi/client"></script> をHTMLに追加した上で:
//
// const storage: StorageAdapter = new GoogleDriveAdapter({
//   clientId: "xxxxxxxx.apps.googleusercontent.com",
// });
// await storage.authenticate(); // Googleのログインポップアップが出る
//
// const notes = await storage.list("01_Journal/");
// await storage.write("01_Journal/2026-07-05_journal.md", "---\ntitle: ...\n---\n本文");
//
// GitHubAdapterと全く同じ3行の書き方で動く。将来Dropbox等を足す場合も
// このStorageAdapterを実装するクラスを1つ追加するだけでよい。
