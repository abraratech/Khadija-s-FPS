KHADIJA'S ARENA MULTIPLAYER SERVER

This is a separate Cloudflare Worker with one SQLite-backed Durable Object per
room code. It must be deployed separately from the existing Cloudflare Pages
site.

DEPLOY
1. Open Command Prompt in multiplayer-server.
2. Run: npm install
3. Run: npx wrangler login
4. Run: npm run deploy
5. Copy the workers.dev URL shown after deployment.
6. Open the game, select CO-OP ALPHA, and paste that URL into Worker server URL.

SECURITY
ALLOWED_ORIGINS is "*" for the first private alpha. Before public beta, replace
it in wrangler.jsonc with the exact Pages origin, for example:
https://your-game.pages.dev

HEALTH CHECK
Open:
https://YOUR-WORKER.workers.dev/health

Expected:
{"ok":true,"service":"khadijas-arena-multiplayer","protocol":1}
