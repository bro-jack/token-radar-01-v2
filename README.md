# token-radar-01-v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bro-jack/token-radar-01-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bro-jack/token-radar-01-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar for make.fun `token-radar-01`: reads the sealed DefiLlama snapshot, fits a multi-term OLS log-log value model and a peer-record token-odds model on the snapshot's own live-token comps, ranks every eligible pre-token protocol by implied value, and writes a static dashboard.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/token-radar-01-kit/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=7xkxffzs&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

# Token Radar v2 — model radar-3

- `main.ts` — Node 22, standard library only. Reads `/input/snapshot.json`,
  writes `/output/board.json`, `/output/data.js`, copies `dashboard/` and
  `screenshots/` to `/output`, writes `/output/dossier.json`.
- `lib/model.ts` — value + odds models, farm economics, board building.
- `dashboard/` — static page, no network. Board, per-protocol detail view, filters.
- `vendor/makefun-board.ts` — kit vendored file, used by `main.ts` for dossier.
- `screenshots/` — 1-board.png, 2-detail.png, 3-filtered.png (1440×900).

Local run:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/token-radar-01-kit/input/snapshot.json
```

Board v2: 198 rows (all eligible pre-token protocols), watchlist 40/40, 34 FARM / 98 MARGINAL / 66 SKIP.
Value model: log mcap = 9.2059 + 0.3891·log TVL − 1.8917·growth − 0.1630·log chains, × maturity (0.90–1.00).
LOO miss ×2.86, walk-forward A ×2.03 (n=36), walk-forward B ×3.16 (n=24); odds Brier 0.2107 (5-fold CV) vs base 0.2477.
Ledger: all 758 protocols in exactly one group (198 ranked, 416 token on record, 144 left out by the rule).

Status: v2 built; 7/7 gate rows pass locally, two runs byte-identical, screenshots done, dossier built.
