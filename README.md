# Q-Awake

震源から波形のように揺れが広がるUIの地震速報PWA。Yahoo自震リアルタイム風の見た目を SolidJS + Cloudflare で軽量に作ったもの。

- 一覧の地震を選ぶと地図がその震源へフライ
- 直近 (60秒以内) の地震は経過時刻に合わせて P波 / S波の同心円アニメ
- ホーム画面に追加すると iOS Safari でも Web Push 通知が届く

## 構成

```
backend/   Cloudflare Workers + KV    1分Cronで P2P地震情報を監視 → VAPID Web Push でファンアウト
frontend/  Vite + SolidJS + PWA       MapLibre 地図 + Canvas 波形 + 下部リスト + SW
```

データソース: [P2P地震情報 API v2](https://www.p2pquake.net/develop/json_api_v2/) (公開・無料・登録不要)

## セットアップ

要件: Node.js 20+ / pnpm 10+ (`corepack enable` でも可)

```bash
pnpm install
```

## ローカル開発

```bash
# 別ターミナルで
pnpm dev:backend     # http://localhost:8787  (wrangler dev)
pnpm dev:frontend    # http://localhost:5173  (vite dev)
```

フロントは `VITE_BACKEND_URL` 未指定だと `http://localhost:8787` にフォールバックします。本番URLを使いたい場合は `frontend/.env.local` に `VITE_BACKEND_URL=https://...` を書く。

## 初回セットアップ (バックエンド)

```bash
# 1. Cloudflareログイン
cd backend && pnpm dlx wrangler login

# 2. KV namespace 作成 → 出力された id を backend/wrangler.toml の REPLACE_WITH_YOUR_KV_NAMESPACE_ID に貼る
pnpm dlx wrangler kv namespace create KV

# 3. VAPID 鍵生成 (公開鍵と秘密鍵が出る)
pnpm vapid

# 4. secret として登録
pnpm dlx wrangler secret put VAPID_PUBLIC_KEY      # 公開鍵をペースト
pnpm dlx wrangler secret put VAPID_PRIVATE_KEY     # 秘密鍵をペースト

# 5. wrangler.toml の VAPID_SUBJECT と ALLOWED_ORIGINS を編集
```

## デプロイ

### Backend (Cloudflare Workers)

```bash
pnpm deploy:backend
```

### Frontend (Cloudflare Pages)

`main` ブランチに push されると GitHub Actions が自動で Cloudflare Pages へデプロイします (`.github/workflows/deploy-frontend.yml`)。手動実行は:

```bash
gh workflow run deploy-frontend.yml
```

必要な GitHub Secrets:

| 名前 | 説明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Pages:Edit 権限のあるトークン (IP制限なし) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウントID |

任意の GitHub Variables:

| 名前 | 説明 |
|---|---|
| `VITE_BACKEND_URL` | 本番バックエンドURL。未設定時は localhost フォールバック |

## デバッグ

```bash
# Cron を待たず即時 ポーリング
curl -X POST http://localhost:8787/api/_debug/scan

# Workers のログをライブで
cd backend && pnpm dlx wrangler tail
```

`backend/wrangler.toml` の `MIN_SCALE=30` (震度3以上) を一時的に `10` (震度1以上) に下げるとテストしやすい。

## 既知の制約

- iOS Safari の Web Push は「ホーム画面に追加」後のみ動く。Chrome on iOS は不可。
- Cloudflare Cron の最小単位が1分なので、地震速報の遅延は最大1分弱+ Push 配信時間。EEW級にしたいときは Wolfx (wolfx.jp/jma_eew) などの WebSocket を Durable Object で常駐させる方向。
- フロントは Pages Functions middleware (`frontend/functions/_middleware.ts`) で JP以外の国からのアクセスを 403 にしている。

## 技術スタック

- **Frontend**: Vite, SolidJS, vite-plugin-pwa, MapLibre GL JS, Canvas 2D, TypeScript
- **Backend**: Cloudflare Workers (TypeScript), Workers KV, Cron Triggers, RFC 8291 aes128gcm 手書き実装
- **CI/CD**: GitHub Actions, cloudflare/wrangler-action
- **PWA**: Service Worker (Workbox precaching), Web Push API, Notification API, Badge API
