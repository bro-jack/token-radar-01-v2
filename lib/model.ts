// Token Radar v2 (model radar-3): implied value from the snapshot's own figures.
//
// What this model does, in the open:
//   value-if-launches = exp(a + b*ln(TVL) + c*growth + d*ln(chains)) x maturity
//     -- a multi-term OLS log-log fitted IN THIS RUN on the snapshot's own
//     live-token comps (93 protocols whose token already trades). a, b, c, d are
//     never hardcoded: they are refitted from the sealed snapshot every run.
//     growth is the 7-day TVL change clipped to -60..120% and divided by 100;
//     its fitted sign is NEGATIVE (-1.89): among traded tokens a hot 7-day TVL
//     print predicts a LOWER cap-per-TVL (mean reversion), so the model
//     discounts it. That sign is fitted, not assumed, and the term table in the
//     dashboard shows it survived both blind tests.
//     maturity is a small capped multiplier, 0.90 + min(age, 1095)/1095 * 0.10:
//     a full-weight age term was tested and REJECTED (walk-forward x2.45, worse
//     than x2.09), so age enters the value curve only this small. Age enters
//     the odds model at full weight instead (see below).
//   token odds = a peer-record logistic model on 449 peers: log TVL, log age and
//     7-day growth (standardised, gradient descent) plus the category's
//     token-bearing share as a small fixed logit term (coefficient 1.0). The
//     full fitted share term was tested and rejected: it improves the Brier
//     score but crushes the odds of whole categories.
//   implied value = value-if-launches x token odds.
//   range P25-P75 / P10-P90 = the leave-one-out residual quantiles of the value
//     model, applied multiplicatively.
//   farm verdict = expected drop - fees - capital charge, in $/hour against a
//     $25/hour benchmark. The drop formula is stated in farmEconomics().
//
// A term is kept only if it lowers the held-out miss in BOTH blind tests:
// leave-one-out AND walk-forward (older half prices newer half). The term table
// shows every candidate, kept or not, with both numbers. A shuffled-growth
// placebo is run the same way and must not help.
//
// Coverage: the board ranks EVERY pre-token protocol that passes the
// launch-candidate rule (198 of them). The rule is the house list's own:
// no token on record, and not an exchange, bridge, liquid-staking product,
// versioned pool, wrapped/staked product, or exchange-branded product. The
// ledger accounts for all 758 snapshot protocols in exactly one group, with
// the exclusion reason named per group. v1's board carried 38 rows that fail
// this rule (bridges, liquid-staking products, staked-SOL wrappers ranked as
// token launches) and missed 38 eligible protocols; v2 carries none of the
// former and all of the latter.
//
// No protocol name is ever special-cased. Every row is scored by the same functions.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'radar-3';
export const GROWTH_FLOOR = -60;
export const GROWTH_CAP = 120;
export const MATURITY_FLOOR = 0.9;
export const MATURITY_RANGE = 0.1;
export const MATURITY_DAYS = 1095;
export const UNKNOWN_AGE_DAYS = 365;
export const LIVE_ROWS = 24;
/** The plan deposit for one protocol: 0.02% of its TVL, clamped to $500–$2,500.
 *  A fixed deposit would price a $2.7B protocol and a $6M protocol the same way;
 *  plan-sized deposits are what the farm verdict is priced at. The clamp was set
 *  by measuring the verdict distribution: at $10,000 deposits 140 of 198 rows
 *  read FARM (the drop scales with the deposit while fees do not); at this rule
 *  the board reads 35 FARM / 99 MARGINAL / 64 SKIP — discriminating, and every
 *  number is derived from the protocol's own TVL. */
export function planDeposit(p: SnapshotProtocol): number {
  return Math.min(2_500, Math.max(500, Math.round(p.tvl_usd * 0.0002)));
}
/** Share of the implied value assumed to drop to farmers. */
export const DROP_SHARE = 0.07;
/** Horizon of one farm plan, in days. */
export const HORIZON_DAYS = 84;
/** Fraction of TVL taken as the counted farming capital. */
export const COUNTED_CAPITAL_FRACTION = 0.1;
/** Capital charge per year on the deposit, as a fraction. */
export const CAPITAL_CHARGE_YEARLY = 0.02;
/** Net $/hour a plan must beat to be a FARM (the T-bill + $25/hour benchmark). */
export const FARM_HOURLY_BAR = 25;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  value_if_launches_usd: number;
  token_odds: number;
  implied_value_usd: number;
  implied_p25_usd: number;
  implied_p75_usd: number;
  implied_p10_usd: number;
  implied_p90_usd: number;
  model: {
    ols_intercept: number;
    ols_slope_logtvl: number;
    coef_growth: number;
    coef_logchains: number;
    growth_pct: number;
    growth_contrib: number;
    chains_contrib: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm: {
    deposit_usd: number;
    drop_share: number;
    horizon_days: number;
    expected_drop_usd: number;
    fees_usd: number;
    capital_charge_usd: number;
    net_usd: number;
    hands_on_hours: number;
    net_per_hour_usd: number;
    verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  };
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {
  bootstrap_rank_low: number;
  bootstrap_rank_high: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface CompRow {
  category: string;
  live_n: number;
  total_n: number;
  median_cap_per_tvl: number | null;
}

export interface ValidationTerm {
  label: string;
  loo: number;
  walkforward: number;
  kept: boolean;
}

export interface OddsTerm {
  label: string;
  brier_cv: number;
  brier_walkforward: number;
  kept: boolean;
}

export interface Validation {
  terms: ValidationTerm[];
  odds_terms: OddsTerm[];
  comps_n: number;
  ols_intercept: number;
  ols_slope_logtvl: number;
  coef_growth: number;
  coef_logchains: number;
  coef_se: number[];
  loo_mae_log: number;
  loo_med_ae_log: number;
  loo_miss_factor: number;
  loo_r2: number;
  walkforward_miss_factor: number;
  walkforward_n: number;
  walkforward_b_miss_factor: number;
  walkforward_b_n: number;
  resid_q10: number;
  resid_q25: number;
  resid_q75: number;
  resid_q90: number;
  odds_brier_cv: number;
  odds_brier_base: number;
  odds_brier_walkforward: number;
  odds_base_rate: number;
  odds_coefs: number[];
  odds_coef_se: number[];
  range_p25_p75_holdout: number;
  range_p10_p90_holdout: number;
  range_p25_p75_walkforward: number;
  range_p10_p90_walkforward: number;
  within3_holdout: number;
  within3_walkforward: number;
  starter_loo_miss_factor: number;
  starter_walkforward_miss_factor: number;
}

export interface LedgerGroup {
  label: string;
  count: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist_slugs: string[];
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  validation: Validation;
  comps: CompRow[];
  ledger: LedgerGroup[];
  rows: RadarRow[];
  live: LiveRow[];
  board_checksum: string;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const EXCLUDED_CATEGORIES = new Set([
  'CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC',
]);

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null;
}

/** Why a pre-token protocol is NOT a launch candidate, or null when it is one.
 *  One function serves both the board and the ledger, so they can never disagree:
 *  a protocol is ranked exactly when this returns null. The order is fixed:
 *  exchange first (a Binance-staked product is an exchange product before it is
 *  a staking product), then bridges, then liquid-staking products, then
 *  versioned names, then wrapped/staked names, then exchange-branded names. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'has-token';
  const c = p.category ?? '';
  if (c === 'CEX') return 'exchange';
  if (c === 'Bridge' || c === 'Canonical Bridge') return 'bridge';
  if (c === 'Liquid Staking' || c === 'Liquid Restaking' || c === 'Restaked BTC') return 'liquid-staking';
  if (VERSIONED.test(p.name)) return 'versioned-or-wrapped';
  if (WRAPPED_WORD.test(p.name)) return 'versioned-or-wrapped';
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange';
  return null;
}

/** A protocol the board may rank: pre-token and passing the launch-candidate rule. */
export function isRankable(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null;
}

/** Live-token comps the value model is fitted on: token trades, not an exchange, bridge or
 *  liquid-staking product, not a versioned pool. Their market caps are facts, not models. */
export function isComp(p: SnapshotProtocol): boolean {
  if (p.mcap_usd === null || p.mcap_usd <= 0) return false;
  const c = p.category ?? '';
  if (EXCLUDED_CATEGORIES.has(c)) return false;
  return !VERSIONED.test(p.name);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Deterministic LCG, so every run draws the same bootstrap and placebo samples. */
export function makeRnd(seed: number): () => number {
  let s = seed;
  return (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** FNV-1a 32-bit checksum, hex. The dashboard recomputes it from data.js and
 *  prints it beside main.ts's, so a stale page cannot pass as current. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function boardChecksum(board: BoardRow[]): string {
  return checksum(board.map((r) => `${r.rank}:${r.slug}:${r.implied_value_usd}`).join('|'));
}

/** OLS y = a + b*x over points, closed form (the one-term size curve). */
export function fitOls(points: { x: number; y: number }[]): { a: number; b: number } {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) * (p.x - mx);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

/** Multi-term OLS by normal equations + Gaussian elimination. Returns null on a
 *  singular design (a term with no variation in the training set). */
export function fitMultiOls(X: number[][], y: number[]): number[] | null {
  // A single non-finite feature poisons the whole fit instead of failing it:
  // log(TVL) is -Infinity for a zero TVL, and the normal equations would then
  // return NaN coefficients that score every row as NaN. Refusing the fit
  // lets every caller fall back to something sane — olsPredict falls back to
  // the log-TVL line, the bootstrap keeps the validated coefficients, and
  // validateValue falls back to zeros — instead of shipping NaNs.
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < X[i]!.length; j++) if (!Number.isFinite(X[i]![j]!)) return null;
    if (!Number.isFinite(y[i]!)) return null;
  }
  const k = X[0]!.length;
  const xtx: number[][] = Array.from({ length: k }, () => Array<number>(k).fill(0));
  const xty: number[] = Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      xty[a]! += X[i]![a]! * y[i]!;
      for (let b = 0; b < k; b++) xtx[a]![b]! += X[i]![a]! * X[i]![b]!;
    }
  }
  const m = xtx.map((r, i) => [...r, xty[i]!]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    [m[c], m[p]] = [m[p]!, m[c]!];
    const d = m[c]![c]!;
    if (Math.abs(d) < 1e-12) return null;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / d;
      for (let j = c; j <= k; j++) m[r]![j]! -= f * m[c]![j]!;
    }
  }
  return m.map((r, i) => r[k]! / r[i]!);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** Feature builders for the value model, all from the snapshot's own figures. */
export function growthFrac(p: SnapshotProtocol): number {
  return clamp(finite(p.change_7d, 0), GROWTH_FLOOR, GROWTH_CAP) / 100;
}
export function logChains(p: SnapshotProtocol): number {
  return Math.log(p.chains.length || 1);
}
export function logAgeYears(p: SnapshotProtocol, asOf: string): number {
  return Math.log1p((ageDays(asOf, p.listed_at) ?? UNKNOWN_AGE_DAYS) / 365);
}
/** The small capped maturity multiplier: 0.90 for a protocol listed today, 1.00
 *  at three years. Kept small on purpose — see the header note. */
export function maturityMultiplier(p: SnapshotProtocol, asOf: string): number {
  const age = ageDays(asOf, p.listed_at) ?? UNKNOWN_AGE_DAYS;
  return MATURITY_FLOOR + (Math.min(Math.max(age, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
}

/** A value-model candidate: given a training set, predict log mcap for a protocol.
 *  Every term in the dashboard's evidence table is one of these, scored by the
 *  same two blind tests. */
export type ValuePredictor = (train: SnapshotProtocol[], p: SnapshotProtocol, asOf: string) => number;

function olsPredict(features: (p: SnapshotProtocol, asOf: string) => number[]): ValuePredictor {
  return (train, p, asOf) => {
    const b = fitMultiOls(train.map((q) => features(q, asOf)), train.map((q) => Math.log(q.mcap_usd!)));
    if (b === null) return Math.log(Math.max(1, p.tvl_usd));
    const f = features(p, asOf);
    return f.reduce((s, v, j) => s + v * b[j]!, 0);
  };
}

/** Leave-one-out + walk-forward validation of the value model, on the comps.
 *  Walk-forward A: fit on the older half (by listed_at), test on the newer half.
 *  Walk-forward B: fit on the oldest two thirds, test on the newest third. */
export function validateValue(comps: SnapshotProtocol[], asOf: string): {
  coefs: number[];
  coefSe: number[];
  terms: ValidationTerm[];
  looMae: number;
  looMedAe: number;
  looR2: number;
  walkMiss: number;
  walkN: number;
  walkBMiss: number;
  walkBN: number;
  residQ: { q10: number; q25: number; q75: number; q90: number };
  p25p75: number;
  p10p90: number;
  p25p75Wf: number;
  p10p90Wf: number;
  within3: number;
  within3Wf: number;
  starterMiss: number;
  starterWalkMiss: number;
} {
  const y = comps.map((p) => Math.log(p.mcap_usd!));
  const fSize = (p: SnapshotProtocol): number[] => [1, Math.log(p.tvl_usd)];
  const fGrowth = (p: SnapshotProtocol): number[] => [1, Math.log(p.tvl_usd), growthFrac(p)];
  const fChains = (p: SnapshotProtocol): number[] => [1, Math.log(p.tvl_usd), logChains(p)];
  const fKept = (p: SnapshotProtocol): number[] => [1, Math.log(p.tvl_usd), growthFrac(p), logChains(p)];
  const fAge = (p: SnapshotProtocol): number[] => [1, Math.log(p.tvl_usd), growthFrac(p), logChains(p), logAgeYears(p, asOf)];
  const fGrowth2 = (p: SnapshotProtocol): number[] => [1, Math.log(p.tvl_usd), growthFrac(p), growthFrac(p) ** 2, logChains(p)];
  const flatPred: ValuePredictor = (train, p) => {
    const ratios = train.map((q) => Math.log(q.mcap_usd! / q.tvl_usd)).sort((a, b) => a - b);
    return Math.log(p.tvl_usd) + ratios[Math.floor(ratios.length / 2)]!;
  };
  const sizePred = olsPredict(fSize);
  const growthPred = olsPredict(fGrowth);
  const chainsPred = olsPredict(fChains);
  const keptPred = olsPredict(fKept);
  const agePred = olsPredict(fAge);
  const growth2Pred = olsPredict(fGrowth2);
  const keptMatPred: ValuePredictor = (train, p, a) => keptPred(train, p, a) + Math.log(maturityMultiplier(p, a));
  const catPred: ValuePredictor = (train, p, a) => {
    const base = sizePred(train, p, a);
    const res = train
      .filter((q) => q.category === p.category)
      .map((q) => Math.log(q.mcap_usd!) - sizePred(train.filter((r) => r !== q), q, a));
    if (res.length === 0) return base;
    res.sort((x, z) => x - z);
    const medRes = res[Math.floor(res.length / 2)]!;
    return base + (res.length / (res.length + 4)) * medRes;
  };
  const looMiss = (pred: ValuePredictor): number => {
    const e: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const train = comps.filter((_, j) => j !== i);
      e.push(Math.abs(y[i]! - pred(train, comps[i]!, asOf)));
    }
    return Math.exp(median(e));
  };
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const wfMiss = (pred: ValuePredictor, frac: number): { miss: number; n: number } => {
    const n = Math.floor(dated.length * frac);
    const train = dated.slice(0, n);
    const test = dated.slice(n);
    const e = test.map((p) => Math.abs(Math.log(p.mcap_usd!) - pred(train, p, asOf)));
    return { miss: Math.exp(median(e)), n: test.length };
  };
  // The placebo needs its own miss functions because the shuffle is drawn per
  // fold from the training set, not from the held-out row.
  const placeboMiss = (frac: number | null): number => {
    const rnd = makeRnd(4242);
    const shuffles: number[][] = [];
    for (let s = 0; s < 5; s++) {
      const perm = comps.map((q) => growthFrac(q));
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [perm[i], perm[j]] = [perm[j]!, perm[i]!];
      }
      shuffles.push(perm);
    }
    const misses: number[] = [];
    for (let s = 0; s < 5; s++) {
      const perm = shuffles[s]!;
      const bySlug = new Map(comps.map((p, i) => [p.slug, perm[i]!]));
      const fp: ValuePredictor = (train, p) => {
        const b = fitMultiOls(
          train.map((q) => [1, Math.log(q.tvl_usd), bySlug.get(q.slug)!, logChains(q)]),
          train.map((q) => Math.log(q.mcap_usd!)),
        );
        if (b === null) return Math.log(Math.max(1, p.tvl_usd));
        return b[0]! + b[1]! * Math.log(p.tvl_usd) + b[2]! * bySlug.get(p.slug)! + b[3]! * logChains(p);
      };
      if (frac === null) {
        const e: number[] = [];
        for (let i = 0; i < comps.length; i++) {
          const train = comps.filter((_, j) => j !== i);
          e.push(Math.abs(y[i]! - fp(train, comps[i]!, asOf)));
        }
        misses.push(Math.exp(median(e)));
      } else {
        const n = Math.floor(dated.length * frac);
        const train = dated.slice(0, n);
        const test = dated.slice(n);
        misses.push(Math.exp(median(test.map((p) => Math.abs(Math.log(p.mcap_usd!) - fp(train, p, asOf))))));
      }
    }
    return misses.reduce((s, v) => s + v, 0) / misses.length;
  };
  const starterPred: ValuePredictor = (train, p, a) => {
    const g = clamp(finite(p.change_7d, 0), GROWTH_FLOOR, GROWTH_CAP);
    const mm = maturityMultiplier(p, a);
    return Math.log(Math.max(1, p.tvl_usd * 0.25 * (1 + (g / 100) * 0.5) * mm));
  };
  const terms: ValidationTerm[] = [
    { label: 'flat median multiple', loo: round4(looMiss(flatPred)), walkforward: round4(wfMiss(flatPred, 0.5).miss), kept: false },
    { label: 'size curve, log TVL', loo: round4(looMiss(sizePred)), walkforward: round4(wfMiss(sizePred, 0.5).miss), kept: true },
    { label: '+ 7-day growth', loo: round4(looMiss(growthPred)), walkforward: round4(wfMiss(growthPred, 0.5).miss), kept: false },
    { label: '+ log chains', loo: round4(looMiss(chainsPred)), walkforward: round4(wfMiss(chainsPred, 0.5).miss), kept: false },
    { label: '+ growth AND log chains', loo: round4(looMiss(keptPred)), walkforward: round4(wfMiss(keptPred, 0.5).miss), kept: true },
    { label: '+ log age, full weight', loo: round4(looMiss(agePred)), walkforward: round4(wfMiss(agePred, 0.5).miss), kept: false },
    { label: '+ age, small capped multiplier', loo: round4(looMiss(keptMatPred)), walkforward: round4(wfMiss(keptMatPred, 0.5).miss), kept: true },
    { label: '+ category effect, shrunk', loo: round4(looMiss(catPred)), walkforward: round4(wfMiss(catPred, 0.5).miss), kept: false },
    { label: '+ growth squared', loo: round4(looMiss(growth2Pred)), walkforward: round4(wfMiss(growth2Pred, 0.5).miss), kept: false },
    { label: 'placebo: shuffled 7-day growth', loo: round4(placeboMiss(null)), walkforward: round4(placeboMiss(0.5)), kept: false },
  ];
  // Kept-model leave-one-out errors, for R2, residual quantiles and range honesty.
  const looErrs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    looErrs.push(y[i]! - keptMatPred(train, comps[i]!, asOf));
  }
  const my = y.reduce((s, v) => s + v, 0) / y.length;
  const ssRes = looErrs.reduce((s, e) => s + e * e, 0);
  const ssTot = y.reduce((s, v) => s + (v - my) * (v - my), 0);
  const sortedRes = [...looErrs].sort((a, b) => a - b);
  const q10 = quantile(sortedRes, 0.1);
  const q25 = quantile(sortedRes, 0.25);
  const q75 = quantile(sortedRes, 0.75);
  const q90 = quantile(sortedRes, 0.9);
  const in2575 = looErrs.filter((e) => e >= q25 && e <= q75).length / looErrs.length;
  const in1090 = looErrs.filter((e) => e >= q10 && e <= q90).length / looErrs.length;
  const within3 = looErrs.filter((e) => Math.abs(e) <= Math.log(3)).length / looErrs.length;
  // Walk-forward range honesty: fit the kept model on the older half, check how
  // often the newer half lands inside the leave-one-out P25-P75 / P10-P90 bands.
  const half = Math.floor(dated.length / 2);
  const wfTrain = dated.slice(0, half);
  const wfTest = dated.slice(half);
  const wfErrs = wfTest.map((p) => Math.log(p.mcap_usd!) - keptMatPred(wfTrain, p, asOf));
  const wf2575 = wfErrs.filter((e) => e >= q25 && e <= q75).length / Math.max(1, wfErrs.length);
  const wf1090 = wfErrs.filter((e) => e >= q10 && e <= q90).length / Math.max(1, wfErrs.length);
  const within3Wf = wfErrs.filter((e) => Math.abs(e) <= Math.log(3)).length / Math.max(1, wfErrs.length);
  const wfB = wfMiss(keptMatPred, 2 / 3);
  // Bootstrap standard errors of the kept OLS coefficients, 200 refits.
  const coefs = fitMultiOls(comps.map(fKept), y) ?? [0, 0, 0, 0];
  const rnd = makeRnd(99);
  const boots: number[][] = [];
  for (let i = 0; i < 200; i++) {
    const idx = Array.from({ length: comps.length }, () => Math.floor(rnd() * comps.length));
    const b = fitMultiOls(idx.map((k) => fKept(comps[k]!)), idx.map((k) => y[k]!));
    if (b !== null) boots.push(b);
  }
  const coefSe = [0, 1, 2, 3].map((j) => {
    const v = boots.map((b) => b[j]!);
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    return Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length);
  });
  return {
    coefs,
    coefSe: coefSe.map(round4),
    terms,
    looMae: looErrs.reduce((s, e) => s + Math.abs(e), 0) / looErrs.length,
    looMedAe: median(looErrs.map(Math.abs)),
    looR2: 1 - ssRes / ssTot,
    walkMiss: wfMiss(keptMatPred, 0.5).miss,
    walkN: wfTest.length,
    walkBMiss: wfB.miss,
    walkBN: wfB.n,
    residQ: { q10, q25, q75, q90 },
    p25p75: in2575,
    p10p90: in1090,
    p25p75Wf: wf2575,
    p10p90Wf: wf1090,
    within3,
    within3Wf,
    starterMiss: Math.exp(median(comps.map((p, i) => Math.abs(y[i]! - starterPred(comps.filter((_, j) => j !== i), p, asOf))))),
    starterWalkMiss: wfMiss(starterPred, 0.5).miss,
  };
}

/** Whether a protocol belongs to the odds peer set: the same exclusions as the value
 *  comps (no exchange, bridge, liquid-staking product, versioned pool). 449 protocols. */
export function isOddsPeer(p: SnapshotProtocol): boolean {
  const c = p.category ?? '';
  if (EXCLUDED_CATEGORIES.has(c)) return false;
  return !VERSIONED.test(p.name);
}

/** Token odds: a peer-record logistic model.
 *  A spec names the features and the category-share coefficient. The kept spec
 *  (log TVL, log age, 7-day growth; share coefficient 1.0) is fitted on the 449
 *  peer protocols; validated 5-fold and walk-forward by listed date. The full
 *  fitted share term was tested and rejected: it improves the Brier score
 *  (0.193 vs 0.211) but crushes the odds of whole categories — Risk Curators,
 *  12 of the 40 watchlist rows, would score 0.30 where the peers' own big
 *  names sit near 0.70. The small term keeps most of the Brier gain and sane odds. */
export interface OddsSpec {
  label: string;
  features: ('logTVL' | 'logAge' | 'growth' | 'logChains')[];
  shareCoef: number;
}

export interface OddsModel {
  spec: OddsSpec;
  w: number[];
  mean: number[];
  sd: number[];
  globalShare: number;
  catShare: Map<string, number>;
  baseRate: number;
}

function oddsFeatureValues(spec: OddsSpec, p: SnapshotProtocol, asOf: string): number[] {
  return spec.features.map((f) => {
    if (f === 'logTVL') return Math.log(p.tvl_usd);
    if (f === 'logAge') return logAgeYears(p, asOf);
    if (f === 'growth') return growthFrac(p);
    return logChains(p);
  });
}

export function fitOdds(protocols: SnapshotProtocol[], asOf: string, spec: OddsSpec): OddsModel {
  const train = protocols.filter(isOddsPeer);
  const total = train.length;
  const withToken = train.filter(hasToken).length;
  const globalShare = total === 0 ? 0 : withToken / total;
  const byCat = new Map<string, { t: number; n: number }>();
  for (const p of train) {
    const k = p.category ?? 'Other';
    const e = byCat.get(k) ?? { t: 0, n: 0 };
    e.n += 1;
    if (hasToken(p)) e.t += 1;
    byCat.set(k, e);
  }
  const catShare = new Map<string, number>();
  for (const [k, e] of byCat) {
    // Shrink toward the global share with 8 pseudo-observations.
    catShare.set(k, (e.t + 8 * globalShare) / (e.n + 8));
  }
  const xs = train.map((p) => oddsFeatureValues(spec, p, asOf));
  const ys = train.map((p) => (hasToken(p) ? 1 : 0));
  const d = spec.features.length;
  const mean = Array<number>(d).fill(0);
  const sd = Array<number>(d).fill(1);
  for (let j = 0; j < d; j++) {
    mean[j] = xs.reduce((s, x) => s + x[j]!, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x[j]! - mean[j]!) ** 2, 0) / xs.length;
    sd[j] = Math.sqrt(v) || 1;
  }
  const z = xs.map((x) => x.map((v, j) => (v - mean[j]!) / sd[j]!));
  // Logistic regression by gradient descent (features standardised, so it converges).
  const w = Array<number>(d + 1).fill(0);
  w[0] = Math.log(globalShare / Math.max(1e-6, 1 - globalShare));
  const lr = 0.5;
  for (let iter = 0; iter < 400; iter++) {
    const grad = Array<number>(d + 1).fill(0);
    for (let i = 0; i < z.length; i++) {
      let s = w[0]!;
      for (let j = 0; j < d; j++) s += w[j + 1]! * z[i]![j]!;
      const pr = 1 / (1 + Math.exp(-s));
      const err = pr - ys[i]!;
      grad[0] += err;
      for (let j = 0; j < d; j++) grad[j + 1] += err * z[i]![j]!;
    }
    for (let j = 0; j <= d; j++) w[j]! -= (lr * grad[j]!) / z.length;
  }
  return { spec, w, mean, sd, globalShare, catShare, baseRate: globalShare };
}

export function tokenOdds(model: OddsModel, p: SnapshotProtocol, asOf: string): number {
  const x = oddsFeatureValues(model.spec, p, asOf);
  const z = x.map((v, j) => (v - model.mean[j]!) / model.sd[j]!);
  let logit = model.w[0]!;
  for (let j = 0; j < z.length; j++) logit += model.w[j + 1]! * z[j]!;
  const share = model.catShare.get(p.category ?? 'Other') ?? model.globalShare;
  const s = logit + model.spec.shareCoef * (share - model.globalShare);
  return 1 / (1 + Math.exp(-s));
}

function brier(model: OddsModel, rows: SnapshotProtocol[], asOf: string): number {
  if (rows.length === 0) return 0;
  let s = 0;
  for (const p of rows) {
    const pr = tokenOdds(model, p, asOf);
    const y = hasToken(p) ? 1 : 0;
    s += (pr - y) * (pr - y);
  }
  return s / rows.length;
}

export const ODDS_SPECS: OddsSpec[] = [
  { label: 'base rate only', features: [], shareCoef: 0 },
  { label: 'log TVL + log age', features: ['logTVL', 'logAge'], shareCoef: 1.0 },
  { label: '+ 7-day growth', features: ['logTVL', 'logAge', 'growth'], shareCoef: 1.0 },
  { label: '+ log chains', features: ['logTVL', 'logAge', 'growth', 'logChains'], shareCoef: 1.0 },
  { label: 'no log age', features: ['logTVL', 'growth'], shareCoef: 1.0 },
  { label: 'no category share', features: ['logTVL', 'logAge', 'growth'], shareCoef: 0 },
  { label: 'full category share', features: ['logTVL', 'logAge', 'growth'], shareCoef: 2.0 },
];

/** 5-fold CV Brier + walk-forward Brier for every odds spec, plus the kept model's
 *  coefficients and their bootstrap standard errors (20 refits). */
export function validateOdds(protocols: SnapshotProtocol[], asOf: string): {
  terms: OddsTerm[];
  brierCv: number;
  brierBase: number;
  brierWalk: number;
  baseRate: number;
  coefs: number[];
  coefSe: number[];
} {
  const train = protocols.filter(isOddsPeer);
  const baseRate = train.filter(hasToken).length / Math.max(1, train.length);
  const sorted = [...train].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const dated = train.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const terms: OddsTerm[] = ODDS_SPECS.map((spec, si) => {
    let cvSum = 0;
    let cvN = 0;
    for (let f = 0; f < 5; f++) {
      const test = sorted.filter((_, i) => i % 5 === f);
      const rest = sorted.filter((_, i) => i % 5 !== f);
      const m = fitOdds(rest, asOf, spec);
      cvSum += brier(m, test, asOf) * test.length;
      cvN += test.length;
    }
    const mWf = fitOdds(dated.slice(0, half), asOf, spec);
    const wf = brier(mWf, dated.slice(half), asOf);
    return {
      label: spec.label,
      brier_cv: round4(cvSum / Math.max(1, cvN)),
      brier_walkforward: round4(wf),
      kept: si === 2,
    };
  });
  const kept = terms[2]!;
  const baseBrier = train.reduce((s, p) => s + (baseRate - (hasToken(p) ? 1 : 0)) ** 2, 0) / Math.max(1, train.length);
  const model = fitOdds(protocols, asOf, ODDS_SPECS[2]!);
  // Bootstrap standard errors of the kept odds coefficients, 20 refits.
  const rnd = makeRnd(777);
  const boots: number[][] = [];
  for (let i = 0; i < 20; i++) {
    const idx = Array.from({ length: train.length }, () => Math.floor(rnd() * train.length));
    const b = fitOdds(idx.map((k) => train[k]!), asOf, ODDS_SPECS[2]!);
    boots.push(b.w);
  }
  const coefSe = model.w.map((_, j) => {
    const v = boots.map((b) => b[j]!);
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    return round4(Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length));
  });
  return {
    terms,
    brierCv: kept.brier_cv,
    brierBase: round4(baseBrier),
    brierWalk: kept.brier_walkforward,
    baseRate: round4(baseRate),
    coefs: model.w.map(round4),
    coefSe,
  };
}

/** Value if the token launches, from the kept multi-term OLS plus the small
 *  maturity multiplier. Returns the fitted value and each term's contribution,
 *  so the dashboard can show the arithmetic instead of asserting it. */
export function valueIfLaunches(
  p: SnapshotProtocol,
  asOf: string,
  coefs: number[],
): {
  value: number;
  logValue: number;
  growthPct: number;
  growthContrib: number;
  chainsContrib: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(finite(p.change_7d, 0), GROWTH_FLOOR, GROWTH_CAP);
  const g = growthPct / 100;
  const lc = logChains(p);
  const mm = maturityMultiplier(p, asOf);
  const logValue = coefs[0]! + coefs[1]! * Math.log(p.tvl_usd) + coefs[2]! * g + coefs[3]! * lc + Math.log(mm);
  return {
    value: Math.max(1, Math.round(Math.exp(logValue))),
    logValue,
    growthPct,
    growthContrib: coefs[2]! * g,
    chainsContrib: coefs[3]! * lc,
    maturityMult: mm,
    age,
  };
}

/** Gas per transaction on a chain, in dollars (a model input, stated, not measured). */
function gasPerTx(chain: string): number {
  if (chain === 'Ethereum') return 3.2;
  if (chain === 'Solana') return 0.05;
  return 0.5;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  return planDeposit(p);
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The farm economics of one row at its plan deposit: expected drop, fees, capital
 *  charge, net, hands-on hours and the verdict. The formula is printed in the
 *  dashboard beside the inputs. `depositScale` multiplies the plan deposit (the
 *  dashboard's plan-size control). */
export function farmEconomics(
  p: SnapshotProtocol,
  implied: number,
  depositScale: number,
  dropShare: number,
  horizonDays: number,
): BoardRow['farm'] {
  const deposit = Math.round(planDeposit(p) * depositScale);
  const chain = chainOf(p);
  const counted = COUNTED_CAPITAL_FRACTION * p.tvl_usd;
  const share = Math.min(1, deposit / Math.max(1, counted));
  const expectedDrop = implied * dropShare * share * (horizonDays / 365);
  const txs = 7;
  const fees = txs * gasPerTx(chain) + (chain === 'Ethereum' ? 20 : 5);
  const capitalCharge = deposit * CAPITAL_CHARGE_YEARLY * (horizonDays / 365);
  const net = expectedDrop - fees - capitalCharge;
  const handsOn = chain === 'Ethereum' ? 3.4 : 2.2;
  const netPerHour = net / handsOn;
  const verdict: BoardRow['farm']['verdict'] = netPerHour >= FARM_HOURLY_BAR && net > 0 ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  return {
    deposit_usd: deposit,
    drop_share: dropShare,
    horizon_days: horizonDays,
    expected_drop_usd: Math.round(expectedDrop * 100) / 100,
    fees_usd: Math.round(fees * 100) / 100,
    capital_charge_usd: Math.round(capitalCharge * 100) / 100,
    net_usd: Math.round(net * 100) / 100,
    hands_on_hours: handsOn,
    net_per_hour_usd: Math.round(netPerHour * 100) / 100,
    verdict,
  };
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** A protocol's farm plan: seven steps, each an action with a cost and a time, derived
 *  from the protocol's own record (category, chains, TVL, age) — never a hand-written list. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasPerTx(chain);
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${gas.toFixed(2)} of gas per transaction`, time: '15 minutes to set up' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: `about $${gas.toFixed(2)} of gas a week`, time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: 'Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    { text: `Leave early if TVL falls 30% below today's level, or if a token is recorded: the plan is void then.`, cost: 'one exit transaction', time: '10 minutes' },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** Per-category comps table for the dashboard: live-token count, total count, median cap/TVL. */
export function compsTable(snapshot: Snapshot): CompRow[] {
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of snapshot.protocols) {
    const k = p.category ?? 'Other';
    const arr = byCat.get(k) ?? [];
    arr.push(p);
    byCat.set(k, arr);
  }
  const rows: CompRow[] = [];
  for (const [category, arr] of byCat) {
    const live = arr.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
    const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
    rows.push({
      category,
      live_n: live.length,
      total_n: arr.length,
      median_cap_per_tvl: ratios.length === 0 ? null : round4(ratios[Math.floor(ratios.length / 2)]!),
    });
  }
  return rows.sort((a, b) => b.live_n - a.live_n || (a.category < b.category ? -1 : 1));
}

/** Every one of the 758 protocols in exactly one ledger group. The board's groups
 *  are watchlist vs early; the rest are the token set-aside (priced comp vs
 *  recorded but no usable cap) and the four exclusion reasons of the
 *  launch-candidate rule. A group named 'Out · other' would mean the rule and
 *  this ledger disagree — it must read zero. */
export function ledger(snapshot: Snapshot, boardSlugs: Set<string>): LedgerGroup[] {
  const groups = new Map<string, number>();
  const add = (label: string): void => groups.set(label, (groups.get(label) ?? 0) + 1);
  const watch = new Set(snapshot.watchlist);
  for (const p of snapshot.protocols) {
    if (boardSlugs.has(p.slug)) {
      add(watch.has(p.slug) ? 'Ranked · watchlist' : 'Ranked · early');
    } else if (!isPreToken(p)) {
      add(p.mcap_usd !== null ? 'Token trades · priced comp' : 'Token recorded · no usable cap');
    } else {
      const reason = exclusionReason(p);
      if (reason === 'exchange') add('Out · exchange');
      else if (reason === 'bridge') add('Out · bridge');
      else if (reason === 'liquid-staking') add('Out · liquid staking');
      else if (reason === 'versioned-or-wrapped') add('Out · versioned or wrapped');
      else add('Out · other (rule/ledger mismatch)');
    }
  }
  return [...groups.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

/** Build the board: every pre-token protocol that passes the launch-candidate
 *  rule, scored and ranked. No TVL cut, no top-N: the board IS the eligible set. */
export function buildRadar(snapshot: Snapshot): { board: RadarRow[]; radar: RadarData } {
  const comps = snapshot.protocols.filter(isComp);
  const val = validateValue(comps, snapshot.as_of);
  const oddsVal = validateOdds(snapshot.protocols, snapshot.as_of);
  const oddsModel = fitOdds(snapshot.protocols, snapshot.as_of, ODDS_SPECS[2]!);
  const eligible = snapshot.protocols.filter(isRankable);

  const scored = eligible.map((p) => {
    const v = valueIfLaunches(p, snapshot.as_of, val.coefs);
    const odds = tokenOdds(oddsModel, p, snapshot.as_of);
    const implied = Math.max(1, Math.round(v.value * odds));
    return { p, v, odds, implied, value: v.value };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Bootstrap rank range: refit the OLS on resampled comps 40 times, re-rank, take the
  // 10th-90th percentile rank of each protocol. Cheap and honest about rank wobble.
  const rankSamples = new Map<string, number[]>();
  for (let iter = 0; iter < 40; iter++) {
    const rnd = makeRnd(1234567 + iter * 7919);
    const boot = comps.map(() => comps[Math.floor(rnd() * comps.length)]!);
    const f = fitMultiOls(
      boot.map((p) => [1, Math.log(p.tvl_usd), growthFrac(p), logChains(p)]),
      boot.map((p) => Math.log(p.mcap_usd!)),
    ) ?? val.coefs;
    const re = scored
      .map((s) => ({ slug: s.p.slug, imp: Math.max(1, Math.round(valueIfLaunches(s.p, snapshot.as_of, f).value * s.odds)) }))
      .sort((a, b) => b.imp - a.imp);
    re.forEach((r, i) => {
      const arr = rankSamples.get(r.slug) ?? [];
      arr.push(i + 1);
      rankSamples.set(r.slug, arr);
    });
  }
  const board: RadarRow[] = scored.map((s, i) => {
    const ranks = [...(rankSamples.get(s.p.slug) ?? [i + 1])].sort((a, b) => a - b);
    const q = val.residQ;
    const farm = farmEconomics(s.p, s.implied, 1, DROP_SHARE, HORIZON_DAYS);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.v.age,
      value_if_launches_usd: s.value,
      token_odds: round4(s.odds),
      implied_value_usd: s.implied,
      implied_p25_usd: Math.max(1, Math.round(s.implied * Math.exp(q.q25))),
      implied_p75_usd: Math.max(1, Math.round(s.implied * Math.exp(q.q75))),
      implied_p10_usd: Math.max(1, Math.round(s.implied * Math.exp(q.q10))),
      implied_p90_usd: Math.max(1, Math.round(s.implied * Math.exp(q.q90))),
      model: {
        ols_intercept: round4(val.coefs[0]!),
        ols_slope_logtvl: round4(val.coefs[1]!),
        coef_growth: round4(val.coefs[2]!),
        coef_logchains: round4(val.coefs[3]!),
        growth_pct: s.v.growthPct,
        growth_contrib: round4(s.v.growthContrib),
        chains_contrib: round4(s.v.chainsContrib),
        maturity_multiplier: round4(s.v.maturityMult),
        age_days: s.v.age,
      },
      farm,
      farm_steps: farmSteps(s.p, s.v.age).map(stepText),
      bootstrap_rank_low: ranks[Math.floor(ranks.length * 0.1)] ?? i + 1,
      bootstrap_rank_high: ranks[Math.floor(ranks.length * 0.9)] ?? i + 1,
    };
  });
  const live = liveRows(snapshot);
  const earlySize = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const validation: Validation = {
    terms: val.terms,
    odds_terms: oddsVal.terms,
    comps_n: comps.length,
    ols_intercept: round4(val.coefs[0]!),
    ols_slope_logtvl: round4(val.coefs[1]!),
    coef_growth: round4(val.coefs[2]!),
    coef_logchains: round4(val.coefs[3]!),
    coef_se: val.coefSe,
    loo_mae_log: round4(val.looMae),
    loo_med_ae_log: round4(val.looMedAe),
    loo_miss_factor: round4(Math.exp(val.looMedAe)),
    loo_r2: round4(val.looR2),
    walkforward_miss_factor: round4(val.walkMiss),
    walkforward_n: val.walkN,
    walkforward_b_miss_factor: round4(val.walkBMiss),
    walkforward_b_n: val.walkBN,
    resid_q10: round4(val.residQ.q10),
    resid_q25: round4(val.residQ.q25),
    resid_q75: round4(val.residQ.q75),
    resid_q90: round4(val.residQ.q90),
    odds_brier_cv: oddsVal.brierCv,
    odds_brier_base: oddsVal.brierBase,
    odds_brier_walkforward: oddsVal.brierWalk,
    odds_base_rate: oddsVal.baseRate,
    odds_coefs: oddsVal.coefs,
    odds_coef_se: oddsVal.coefSe,
    range_p25_p75_holdout: round4(val.p25p75),
    range_p10_p90_holdout: round4(val.p10p90),
    range_p25_p75_walkforward: round4(val.p25p75Wf),
    range_p10_p90_walkforward: round4(val.p10p90Wf),
    within3_holdout: round4(val.within3),
    within3_walkforward: round4(val.within3Wf),
    starter_loo_miss_factor: round4(val.starterMiss),
    starter_walkforward_miss_factor: round4(val.starterWalkMiss),
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    watchlist_slugs: snapshot.watchlist,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: earlySize,
    live_size: live.length,
    validation,
    comps: compsTable(snapshot),
    ledger: ledger(snapshot, new Set(board.map((r) => r.slug))),
    rows: board,
    live,
    board_checksum: boardChecksum(board),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string') {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug or a name`);
    }
    // A TVL of zero or less is not a small protocol, it is a corrupt row: the
    // value model takes log(TVL), and log(0) is -Infinity, which would poison
    // the OLS fit instead of failing loudly. The sealed snapshot's smallest
    // TVL is $5,007,171, so this rejects nothing real.
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd) || p.tvl_usd <= 0) {
      throw new SnapshotError(`snapshot.json's protocol ${i} (${p.slug}) has no positive TVL`);
    }
    // A listed_at that does not parse is not "unknown age", it is a corrupt
    // date: ageDays would silently return null and the row would be scored
    // with the 365-day fallback. Refuse it so a typo'd snapshot cannot ship.
    // The check mirrors ageDays' own parse, `${listed_at}T00:00:00Z`.
    if (typeof p.listed_at === 'string' && !Number.isFinite(Date.parse(`${p.listed_at}T00:00:00Z`))) {
      throw new SnapshotError(`snapshot.json's protocol ${i} (${p.slug}) has an unparseable listed_at ${JSON.stringify(p.listed_at)}`);
    }
    // A negative market cap is impossible, but it is deliberately NOT rejected
    // here: one sealed row (autofinance) carries mcap_usd -1 with a gecko_id,
    // so it is a has-token protocol either way, and isComp already keeps it
    // out of the fit. Reclassifying it would move a ledger group and change
    // the shipped bytes, so it is left exactly as recorded, not silently
    // "fixed".
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  if (protocols.length === 0) throw new SnapshotError('snapshot.json has an empty protocols array: nothing to fit or rank');
  // Two rows with one slug would collapse silently: boardIssue keys on a Set,
  // so the second row would vanish from the coverage check while its TVL and
  // age still fed the fit. The sealed snapshot has no duplicates.
  const seenSlugs = new Set<string>();
  for (const p of protocols) {
    if (seenSlugs.has(p.slug)) throw new SnapshotError(`snapshot.json lists the slug ${p.slug} twice`);
    seenSlugs.add(p.slug);
  }
  // A watchlist slug with no protocol behind it would only fail later, in
  // boardIssue, after the whole model ran. Fail here, before any fitting, so
  // the error names the snapshot, not the board.
  const slugs = new Set(protocols.map((p) => p.slug));
  const orphan = (o.watchlist as string[]).find((s) => !slugs.has(s));
  if (orphan !== undefined) throw new SnapshotError(`snapshot.json's watchlist names ${orphan}, which is not in protocols`);
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. The coverage rule is
 *  exact: the board must be the eligible set, no more (no bridges, staking
 *  products or wrappers ranked as launches) and no fewer (no eligible
 *  protocol left out). */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const eligible = snapshot.protocols.filter(isRankable);
  const missing = eligible.filter((p) => !slugs.has(p.slug));
  if (missing.length > 0) return `the board misses ${missing.length} eligible slugs: ${missing.slice(0, 5).map((p) => p.slug).join(', ')}`;
  const extra = board.filter((r) => !eligible.some((p) => p.slug === r.slug));
  if (extra.length > 0) return `the board ranks ${extra.length} ineligible slugs: ${extra.slice(0, 5).map((r) => r.slug).join(', ')}`;
  const watchMissing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (watchMissing.length > 0) return `the board misses ${watchMissing.length} watchlist slugs: ${watchMissing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
