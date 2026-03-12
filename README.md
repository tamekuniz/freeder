# freeder

<p align="center">
  <img src="https://img.shields.io/badge/freeder-F97316?style=for-the-badge&logo=rss&logoColor=white" alt="freeder" />
</p>

Feedly APIを使ったキーボード操作特化のRSSリーダー。マルチユーザー対応。

## 必要なもの

- Node.js 20.x 以上
- Feedlyアカウント（Proプラン推奨、なくても利用可能）

## インストール

### Mac

```bash
# リポジトリをクローン
git clone https://github.com/tamekuniz/freeder.git
cd freeder

# 依存パッケージをインストール
npm install

# 環境変数を設定
cp .env.local.example .env.local
# .env.local を編集
```

### Windows

1. Node.js 20以上をインストール（https://nodejs.org/）
2. Visual Studio Build Tools をインストール（better-sqlite3のコンパイルに必要）
   - https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - 「C++ によるデスクトップ開発」ワークロードを選択

```cmd
git clone https://github.com/tamekuniz/freeder.git
cd freeder
npm install
copy .env.local.example .env.local
```

> Build Toolsの代わりに `npm install -g windows-build-tools` でも可。

## 環境変数の設定

`.env.local` に以下を設定：

```env
FEEDLY_ACCESS_TOKEN=xxxxxxxxxxxxxxx
SESSION_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- `FEEDLY_ACCESS_TOKEN`: Feedly Developer Token（共有トークンとして利用可能）
- `SESSION_SECRET`: セッション暗号化用の秘密鍵（`openssl rand -hex 32` で生成）

## 起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く。

## ユーザー認証

freederはマルチユーザー対応です。

1. 初回アクセス時にログイン画面が表示されます
2. 「新規登録」でアカウントを作成
3. Feedlyトークンの設定画面に進みます
   - **Feedly Proを持っている場合**: 自分のDeveloper Tokenを入力
   - **Feedly Proを持っていない場合**: サーバーの共有トークンを使用

最初に登録したユーザーには `.env.local` のトークンが自動で割り当てられます。

## 全文検索

- `/` キーでfreeder全体を検索
- `f` キーで選択中のフォルダ内を検索
- 記事タイトルと本文が検索対象（フィード名は除外）
- アプリ起動時に全フィードをバックグラウンドでクロールし、検索インデックスを構築します

## キーボードショートカット

| キー | 動作 |
|------|------|
| j / k | 次/前の記事 |
| h / l | 次/前のRSS |
| H / L | 次/前の未読RSS |
| g / ; | 次/前のフォルダ |
| x | フォルダを開閉 |
| / | 検索 |
| f | フォルダ内検索 |
| b | ブラウザで開く |
| v | サイトプレビュー |
| m | 既読/未読切替 |
| s | スター切替 |
| +/- | フォント拡大/縮小 |
| Ctrl+R | Feedlyと同期 |

## 技術スタック

- Next.js 16 + React 19
- TypeScript
- Tailwind CSS 4
- better-sqlite3（キャッシュ・FTS5全文検索・ユーザー管理）
- iron-session（暗号化セッション管理）
- Feedly API

## データベース

- `freeder-cache.db`（SQLite）がプロジェクトディレクトリに自動作成されます
- 購読情報、記事、未読カウント、UI設定、ユーザー情報がキャッシュされます
- FTS5トライグラム検索でタイトル・本文を高速に全文検索
- Feedly APIに接続できないときはキャッシュから表示します

## トラブルシューティング

**npm install で better-sqlite3 のビルドに失敗する（Windows）：**
Visual Studio Build Tools の「C++ によるデスクトップ開発」がインストールされているか確認してください。

**npm install で better-sqlite3 のビルドに失敗する（Mac）：**
Xcode Command Line Tools をインストールしてください: `xcode-select --install`

**FEEDLY_ACCESS_TOKEN のエラー：**
トークンの有効期限が切れている可能性があります。https://feedly.com/v3/auth/dev で再取得してください。

**LAN内の他端末からアクセスしたい場合：**
`npm run dev -- -H 0.0.0.0` で起動してください。
