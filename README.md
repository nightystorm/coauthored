# Coauthored

Sign in with GitHub, count the lines you shipped with Claude this year, share a card.

A commit counts when you authored it this year, it is not a merge, and its message has a
`Co-Authored-By: Claude` line. Lines are GitHub's additions/deletions per commit.

## Run locally

```
npm install
GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... npm start
```

Opens on http://localhost:3000. Without `DATABASE_URL`, cards are saved to `data/cards.json`.

## Settings

| Variable | What it is |
|---|---|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | From a GitHub OAuth app. Callback URL: `<BASE_URL>/auth/callback` |
| `BASE_URL` | Public address, e.g. `https://coauthored.dev`. Used in share links and preview images |
| `DATABASE_URL` | Postgres (production). Table is created on start |
| `ADSENSE_CLIENT` | `ca-pub-...` from AdSense. Also fills `/ads.txt` |
| `ADSENSE_SLOT_HOME` / `ADSENSE_SLOT_SHARE` | Ad unit IDs for the home and card pages |
| `CONTACT_EMAIL` | Shown on the privacy page for removal requests |
| `NODE_ENV=production` | Hides the dashed ad placeholders |

## How counting works

1. GitHub commit search: `author:<login> "Co-Authored-By: Claude" merge:false author-date:<range>`.
   Search returns at most 1000 results per query, so the year is split into smaller date ranges until each fits.
2. GraphQL `nodes(ids:)` reads additions/deletions for 100 commits per request.
3. The token is revoked right after counting. Only totals are stored.

Search only covers each repo's default branch.
