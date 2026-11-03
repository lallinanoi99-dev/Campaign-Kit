# Campaign Kit

**Your whole marketing campaign in one click** — positioning, personas, a 2-week content calendar with ready-to-post drafts, ad headlines and a launch checklist. Edit it, export it, and tick off milestones on **BOT Chain**.

- Live site: https://campaignkit.my.id
- Contract (BOT Chain mainnet, chain ID 677): [`0x4B5144Ef5Ad698b821540e525d4e4edDfDCb6b0F`](https://scan.botchain.ai/address/0x4B5144Ef5Ad698b821540e525d4e4edDfDCb6b0F)

> Drafts — always review before posting. Drafts only use facts from your brief and mark anything that needs proof with **⚠ Add proof**.

---

## What's inside

| Route | What it is |
|---|---|
| `/` | Website: hero + 6 sections (Plan · Create · Your plan (dark) · Examples · FAQ · CTA) + footer |
| `/app` | Brief form (8 fields) → building animation → kit |
| `/app?c=<id>` | A saved campaign (tabs: Positioning · Personas · Calendar · Ads · Checklist) |
| `/app?example=brewly\|studybuddy\|sunset` | Example kits (editing one saves a copy) |
| `/app/campaigns` | My campaigns (this browser only) — open, duplicate as template, delete |
| `/app/plan/<id>` or `?plan=<id>` | Public progress page read from BOT Chain (no drafts) |

**Kit features:** click any text to edit · drag posts between days (Day −7 → Day +7, launch day as a wide band) · post editor drawer with platform counters (X 280 · LinkedIn 3,000 · Instagram 2,200) and AI buttons (Shorter · Punchier · Another angle · Change tone · Translate) · exports: PDF report, CSV for schedulers, `.ics` (one event per post), copy all posts.

**On-chain:** *Stamp plan on BOT Chain* saves `keccak256` of the plan + title + goal + launch date + milestone count. Milestones = the checklist items; *✓ Done* ticks one on-chain (confetti 🎉). Editing after stamping shows *Edited since stamp* + *Update fingerprint*.

**Template mode (current setup):** `WORKER_URL` is empty, so kits are built from templates right in the browser. Nothing is sent anywhere, and there are no AI labels in the UI. The edit buttons are offline tools:
- **✂️ Shorter** trims the text at a sentence or word boundary.
- **🔄 Another version** swaps in a different template draft, keeping the post's day, channel, time and hashtags. It works for posts, the one-liner, the pitch and ads.

The Website field, "Punchier", "Change tone" and "Translate" only appear once a Worker is connected. Setting `WORKER_URL` later switches everything to AI with no other changes.

## Project layout

```
index.html            website + app shell (navbar, 7 sections, footer, Buzz mascot SVG)
404.html              GitHub Pages SPA redirect (/app/plan/7 → /?p=/app/plan/7)
assets/
  config.js           ← contract address, Worker URL, network, social links (one place to edit)
  main.js             router, navbar hover pill, search (⌘K), footer live block number
  site.js             home page: GSAP pinned reveals, carousels, living illustrations, bg colour transitions
  app.js              the app: brief, building, kit tabs, drawer, AI rewrites, exports, stamp/tick, public page
  kit.js              pure logic: validation, channel caps, template kits, CSV/.ics, fingerprint input
  chain.js            MetaMask connect + BOT Chain switch/add, contract read/write, tx error messages
  examples.js         the 3 example kits · ui.js toast/modal/confetti · styles.css
contracts/
  CampaignKitPlans.sol   the contract
  test-plans.mjs         local test (solc + ganache), 25 checks
worker/src/index.js   /kit/plan, /kit/rewrite (+ /extract-url in extract.js)
scripts/serve.mjs     local server that behaves like GitHub Pages
scripts/test-kit.mjs  logic tests for kit.js (20 checks)
```

## Run locally

```bash
node scripts/serve.mjs
```
Open http://localhost:5173. Tests: `node scripts/test-kit.mjs`.

## Deploy

### 1. Contract (Remix)
1. Open https://remix.ethereum.org, paste `contracts/CampaignKitPlans.sol`, compile with **0.8.24**, optimizer on (200). If the chain rejects the deploy with an invalid-opcode error, set **EVM version → paris** under Advanced.
2. **Testnet first:** MetaMask network *BOT Chain Testnet* — chain ID **968**, RPC `https://rpc.bohr.life`, explorer `https://scan.bohr.life`. Deploy, set `NETWORK: "testnet"` and `TESTNET_CONTRACT_ADDRESS` in `assets/config.js`, and try stamp → tick → public page.
3. **Mainnet:** chain ID **677**, RPC `https://rpc.botchain.ai`, explorer `https://scan.botchain.ai`. Deploy, paste the address into `MAINNET_CONTRACT_ADDRESS`, set `NETWORK: "mainnet"`, and put it at the top of this README. The footer and "View on explorer" pick it up automatically.
4. Optional: verify the source on scan.botchain.ai.

Local contract test (needs `npm i solc@0.8.24 ganache@7.9.2 ethers@6.13.4` in any folder):
```bash
node contracts/test-plans.mjs contracts/CampaignKitPlans.sol assets/config.js
```

### 2. Worker (Cloudflare) — optional, adds AI
```bash
cd worker
npm install
npx wrangler kv namespace create RATE        # paste the id into wrangler.toml and uncomment the block
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```
Set `ALLOWED_ORIGINS` in `wrangler.toml` to your site's origin(s) and paste the Worker URL into `WORKER_URL` in `assets/config.js`. Using the shared Week 1 Worker instead? Copy the `/kit/plan` and `/kit/rewrite` routes from `worker/src/index.js` (and `extract.js` if `/extract-url` isn't there yet).

- Limits per IP per day: 6 kits, 18 part re-generations, 60 rewrites, 10 URL reads (needs the `RATE` KV).
- Input caps on every field, 24 KB max body, requests from other origins refused, briefs never logged (observability off).
- The browser re-validates the JSON; any missing part is re-requested on its own (`{ brief, part }`), then falls back to a template for that part.

### 3. Site (GitHub Pages)
In Settings → Pages, set the source to branch `main`, folder `/ (root)`. The site works both at a domain root (a custom domain) and in a project subfolder (`user.github.io/Campaign-Kit/`). It works out its own base path from where `assets/main.js` loads, and `404.html` handles deep links like `/Campaign-Kit/app/plan/3`.

To test the subfolder setup locally: `node scripts/serve.mjs 5174 /Campaign-Kit`, then open http://localhost:5174/Campaign-Kit/.

## Contract

```solidity
struct Plan { address owner; bytes32 planHash; string title; uint8 goal; uint64 launchDate; uint8 milestones; uint8 done; uint64 at; }
stampPlan(bytes32 planHash, string title, uint8 goal, uint64 launchDate, uint8 milestones) returns (uint256 id)
tick(uint256 id, uint8 index)          // owner only, once per milestone
updateHash(uint256 id, bytes32 newHash) // owner only
getPlan(id) · plansOfOwner(addr) · progress(id) → (done, total, mask) · stats() → (plans, milestones ticked)
event PlanStamped(id, owner, goal) · event MilestoneDone(id, index, done) · event PlanUpdated(id, planHash)
```
- Plan ids start at 0. Title 1–48 bytes, goal 0–4 (Launch · Signups · Sales · Awareness · Event attendance), 1–30 milestones, launch date = UTC midnight in unix seconds.
- No tokens, payments or admin. Drafts never go on-chain.

## Before launch — to-do
- [x] Deploy the contract on mainnet and fill in `config.js` + this README
- [ ] *(Optional, later)* Deploy the Worker, set the secret, KV and `ALLOWED_ORIGINS`, then set `WORKER_URL`
- [x] GitHub Pages
- [ ] Fill in social links in `config.js`
- [ ] Confirm the native-currency symbol for BOT Chain in `config.js` (used when MetaMask adds the network)
- [ ] Try a real kit end-to-end, then demo clip + X post tagging @BOTChain_ai
