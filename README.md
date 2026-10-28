# Code Wrapped

Sign in with GitHub, count the lines you shipped with AI this year, share a card.

A commit counts when you authored it this year, it is not a merge, and one of its
`Co-authored-by` lines names an AI tool from `src/tools.js` (Claude, Cursor, Copilot,
Codex, Kimi, Gemini and more). Lines are GitHub's additions/deletions per commit.

## Run locally

```
npm install
GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... npm start
```

Opens on http://localhost:3000. Without `DATABASE_URL`, cards are saved to `data/cards.json`.

## Settings

| Variable | What it is |
|---|---|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | From the GitHub App. Callback URL: `<BASE_URL>/auth/callback` |
| `GITHUB_APP_ID` / `GITHUB_APP_SLUG` | The app's numeric ID and URL name (`github.com/apps/<slug>`) |
| `GITHUB_PRIVATE_KEY` | The app's private key (PEM). Newlines may be written as `\n`. Used to uninstall the app after a private count |
| `REPO_URL` | Public link to this code, shown as "Read the code" |
| `BASE_URL` | Public address, e.g. `https://codewrapped.dev`. Used in share links and preview images |
| `DATABASE_URL` | Postgres (production). Table is created on start |
| `ADSENSE_CLIENT` | `ca-pub-...` from AdSense. Also fills `/ads.txt` |
| `ADSENSE_SLOT_HOME` / `ADSENSE_SLOT_SHARE` | Ad unit IDs for the home and card pages |
| `CONTACT_EMAIL` | Shown on the privacy page for removal requests |
| `NODE_ENV=production` | Hides the dashed ad placeholders |

## GitHub App settings

- Callback URL: `<BASE_URL>/auth/callback`
- Tick "Request user authorization (OAuth) during installation"
- Webhook: off
- Repository permissions: Contents read-only (Metadata read-only is added automatically). Nothing else.
- Where can it be installed: Any account

Public counts use plain sign-in (no repo access). Private counts install the app on the
repos the user picks; the app uninstalls itself and revokes the sign-in after counting.

## How counting works

1. GitHub commit search: `author:<login> "Co-Authored-By: Claude" merge:false author-date:<range>`.
   Search returns at most 1000 results per query, so the year is split into smaller date ranges until each fits.
2. GraphQL `nodes(ids:)` reads additions/deletions for 100 commits per request.
3. The sign-in is revoked and any installation removed right after counting. Only totals are stored.

Search only covers each repo's default branch.
