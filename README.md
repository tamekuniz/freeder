# freeder

Feedly APIを使ったキーボード操作特化のRSSリーダー。

## 必要なもの

- Node.js 20.x 以上
- Feedlyアカウントとアクセストークン

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
# .env.local を編集して FEEDLY_ACCESS_TOKEN を設定
```

### Windows

1. Node.js 20以上をインストール（https://nodejs.org/）
2. Visual Studio Build Tools をインストール（better-sqlite3のコンパイルに必要）
   - https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - 「C++ によるデスクトップ開発」ワークロードを選択

```cmd
# リポジトリをクローン
git clone https://github.com/tamekuniz/freeder.git
cd freeder

# 依存パッケージをインストール
npm install

# 環境変数を設定
copy .env.local.example .env.local
# .env.local を編集して FEEDLY_ACCESS_TOKEN を設定
```

> Build Toolsの代わりに `npm install -g windows-build-tools` でも可。

## Feedlyアクセストークンの取得

1. https://feedly.com/v3/auth/dev にアクセス
2. Googleアカウントでログイン
3. 表示されたトークンを `.env.local` にコピー

```env
FEEDLY_ACCESS_TOKEN=xxxxxxxxxxxxxxx
```

## 起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く。

## キーボードショートカット

| キー | 動作 |
|------|------|
| j / k | 次/前の記事 |
| h / l | 次/前のRSS |
| H / L | 次/前の未読RSS |
| g / ; | 次/前のフォルダ |
| b | バックグラウンドで開く |
| v | 記事プレビュー |
| V | サイトプレビュー |
| m | 未読切替 |
| s | スター切替 |
| +/- | フォント拡大/縮小 |
| Ctrl+r | 同期 |

## 技術スタック

- Next.js 16 + React 19
- TypeScript
- Tailwind CSS 4
- better-sqlite3（キャッシュ・設定保存）
- Feedly API

## データベース

- `freeder-cache.db`（SQLite）がプロジェクトディレクトリに自動作成されます
- 購読情報、記事、未読カウント、UI設定がキャッシュされます
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
