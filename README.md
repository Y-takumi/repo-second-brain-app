# 第二の脳 — PWA プロトタイプ

Claudeとの対話を通じて設計された、個人用「第二の脳」アプリのUIプロトタイプです。

## 現状
- `index.html` — スマホ向けUIプロトタイプ（入力・探索・Tasks・Library・Note詳細・Knowledge詳細）
  - 実際に動くインタラクション：タブ切り替え、D3.jsによるフォーカス＋コンテキスト式のグラフ探索、意味検索→候補選択→グラフ/ノート表示の分岐、Note⇄Knowledgeの相互遷移
  - **注意**：現時点ではモックデータで動作しています。Google Driveへの実際の読み書きはまだ接続されていません
- `storage-adapter.ts` — ストレージ抽象化レイヤー（GitHub / Google Drive）の設計・実装
- `usage-guard.ts` — API使用量の予算管理モジュール（日/週/月の上限、実装済み・未統合）

## 設計ドキュメント
第二の脳プロジェクト全体の設計思想・データスキーマは、別途Obsidian Vault側の `00_処理ロジック仕様書.md` を参照。

## 次のステップ
- `storage-adapter.ts`（GoogleDriveAdapter）を`index.html`に実際に接続する
- Claude APIとの連携（音声/URL入力→Knowledge分解）
- `usage-guard.ts`をAPI呼び出しの前段に組み込む

## デモ
GitHub Pagesで公開後、`https://Y-takumi.github.io/repo-second-brain-app/` からアクセスできます。
