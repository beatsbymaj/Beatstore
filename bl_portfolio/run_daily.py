"""Daily after-close run: pull data, log targets, build the BL book, gate, decide, paper trade.

    python run_daily.py            # normal run (skips if today's close is already logged)
    python run_daily.py --force    # re-run for the latest close
    python run_daily.py --dry-run  # everything except trading and log writes
"""
import argparse
import csv
import json
from datetime import datetime, timezone

import numpy as np

import blcore
import broker as brokers
import config
import market_data
from decide import decide

TARGETS = config.LOG_DIR / "targets.csv"
DECISIONS = config.LOG_DIR / "decisions.csv"


def append(path, row: dict):
    new = not path.exists()
    with path.open("a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(row))
        if new:
            w.writeheader()
        w.writerow(row)


def already_logged(path, date: str) -> bool:
    if not path.exists():
        return False
    with path.open() as f:
        return any(r["date"] == date for r in csv.DictReader(f))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    config.LOG_DIR.mkdir(exist_ok=True)

    tickers = config.TICKERS
    px_all = market_data.closes(tickers + [config.BENCHMARK])
    as_of = px_all.index[-1].strftime("%Y-%m-%d")
    if already_logged(DECISIONS, as_of) and not args.force and not args.dry_run:
        print(f"{as_of} already processed; use --force to redo.")
        return

    prices = px_all[tickers].to_numpy()
    last = dict(zip(tickers, prices[-1]))
    fund = market_data.fundamentals(tickers)
    caps = np.array([fund[t]["shares"] * last[t] for t in tickers])
    targets = np.array([fund[t]["target_mean"] for t in tickers])

    book = blcore.candidate_book(prices, caps, targets)
    window = book["returns"][-config.SHARPE_WINDOW_DAYS:]

    bk = brokers.get_broker()
    cur_w = np.array(bk.weights(last, tickers))
    baseline = "current book"
    if np.abs(cur_w).sum() < 1e-6:          # empty book: compare to 1/N, as the notebook did
        cur_w, baseline = np.repeat(1 / len(tickers), len(tickers)), "1/N (book is empty)"
    cand_w = book["weights"]

    s_cur = blcore.trailing_sharpe(cur_w, window)
    s_cand = blcore.trailing_sharpe(cand_w, window)
    gate = bool(s_cand > s_cur)
    turnover = float(np.abs(cand_w - np.array(bk.weights(last, tickers))).sum())

    # --- log every analyst target ---
    run_ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for i, t in enumerate(tickers):
        f = fund[t]
        row = {"date": as_of, "run_utc": run_ts, "ticker": t, "close": round(last[t], 4),
               "target_mean": f["target_mean"], "target_median": f["target_median"],
               "target_high": f["target_high"], "target_low": f["target_low"],
               "n_analysts": f["n_analysts"], "upside_pct": round((targets[i] / last[t] - 1) * 100, 3),
               "view_daily_logret": round(float(book["views"][i]), 6),
               "posterior_daily": round(float(book["posterior"][i]), 6),
               "raw_weight": round(float(book["raw_weights"][i]), 4),
               "capped_weight": round(float(cand_w[i]), 4)}
        if not args.dry_run:
            append(TARGETS, row)

    # --- decide ---
    if not gate:
        verdict = {"decision": "hold", "decided_by": "sharpe-gate",
                   "reason": f"Sharpe gate failed: candidate {s_cand:.2f} vs {baseline} {s_cur:.2f}."}
    elif turnover < config.MIN_TURNOVER_TO_TRADE:
        verdict = {"decision": "hold", "decided_by": "turnover-floor",
                   "reason": f"Turnover {turnover:.3f} below {config.MIN_TURNOVER_TO_TRADE}."}
    else:
        equity_now = bk.equity(last)
        proposal = {
            "as_of_close": as_of,
            "equity": round(equity_now, 2),
            "sharpe_gate": {"window_days": config.SHARPE_WINDOW_DAYS, "candidate": round(s_cand, 3),
                            "baseline": baseline, "baseline_sharpe": round(s_cur, 3)},
            "turnover_fraction_of_equity": round(turnover, 4),
            "limits": {"max_single_short": config.MAX_SINGLE_SHORT, "max_single_long": config.MAX_SINGLE_LONG,
                       "net_range": [config.MIN_NET_EXPOSURE, config.MAX_NET_EXPOSURE]},
            "raw_model_net_exposure": round(float(book["raw_weights"].sum()), 3),
            "assets": [{"ticker": t, "close": round(last[t], 2), "target_mean": fund[t]["target_mean"],
                        "target_low": fund[t]["target_low"], "target_high": fund[t]["target_high"],
                        "n_analysts": fund[t]["n_analysts"],
                        "upside_pct": round((targets[i] / last[t] - 1) * 100, 2),
                        "current_weight": round(float(bk.weights(last, tickers)[i]), 4),
                        "proposed_weight": round(float(cand_w[i]), 4)}
                       for i, t in enumerate(tickers)],
        }
        verdict = decide(proposal)

    target_w = cand_w
    if baseline.startswith("1/N") and verdict["decision"] == "hold":
        # The notebook starts every run at 1/N and falls back to it when the gate fails.
        # With an empty book, "hold the current book" therefore means "hold 1/N".
        target_w = cur_w
        verdict = {"decision": "execute", "decided_by": "seed-1/N",
                   "reason": verdict["reason"] + " Book is empty, so it is seeded at 1/N as in the notebook."}

    fills = []
    if verdict["decision"] == "execute" and not args.dry_run:
        fills = bk.rebalance(dict(zip(tickers, target_w)), last)
        bk.save()

    equity = bk.equity(last)
    rec = {"date": as_of, "run_utc": run_ts, "broker": bk.name,
           "sharpe_current": round(s_cur, 4), "sharpe_candidate": round(s_cand, 4),
           "gate_passed": gate, "turnover": round(turnover, 4),
           "raw_net": round(float(book["raw_weights"].sum()), 4),
           "raw_min_weight": round(float(book["raw_weights"].min()), 4),
           "capped_net": round(float(cand_w.sum()), 4),
           "decision": verdict["decision"], "decided_by": verdict["decided_by"],
           "reason": verdict["reason"],
           "proposed_weights": json.dumps({t: round(float(w), 4) for t, w in zip(tickers, cand_w)}),
           "executed_weights": json.dumps({t: round(float(w), 4) for t, w in zip(tickers, target_w)}) if fills else "",
           "fills": json.dumps(fills)}
    if not args.dry_run:
        append(DECISIONS, rec)
        if not already_logged(brokers.EQUITY, as_of):
            append(brokers.EQUITY, {"date": as_of, "equity": round(equity, 2),
                                    "spy_close": round(float(px_all[config.BENCHMARK].iloc[-1]), 4),
                                    "broker": bk.name})
    print(json.dumps({k: rec[k] for k in ("date", "gate_passed", "sharpe_current", "sharpe_candidate",
                                          "raw_net", "raw_min_weight", "capped_net", "turnover",
                                          "decision", "decided_by", "reason")}, indent=2))
    print("proposed:", rec["proposed_weights"])
    print(f"equity: {equity:,.2f}")


if __name__ == "__main__":
    main()
