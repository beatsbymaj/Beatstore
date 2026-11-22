"""Weekly paper book vs SPY. Writes reports/weekly-YYYY-MM-DD.md and appends logs/weekly.csv."""
import csv

import numpy as np
import pandas as pd

import config

EQUITY = config.LOG_DIR / "equity.csv"
DECISIONS = config.LOG_DIR / "decisions.csv"
WEEKLY = config.LOG_DIR / "weekly.csv"


def stats(series: pd.Series) -> dict:
    r = series.pct_change().dropna()
    total = series.iloc[-1] / series.iloc[0] - 1
    sharpe = r.mean() / r.std(ddof=1) * np.sqrt(252) if len(r) > 1 and r.std() > 0 else float("nan")
    dd = (series / series.cummax() - 1).min()
    return {"total": total, "sharpe": sharpe, "max_dd": dd}


def main():
    if not EQUITY.exists():
        print("No equity history yet.")
        return
    eq = pd.read_csv(EQUITY, parse_dates=["date"]).set_index("date").sort_index()
    if len(eq) < 2:
        print("Need at least two days of equity history.")
        return
    end = eq.index[-1]
    week = eq[eq.index > end - pd.Timedelta(days=7)]
    prev = eq[eq.index <= end - pd.Timedelta(days=7)]
    if len(prev):                      # start from the prior week's last close
        week = pd.concat([prev.iloc[[-1]], week])

    rows = []
    for label, frame in (("week", week), ("since inception", eq)):
        b, s = stats(frame["equity"]), stats(frame["spy_close"])
        rows.append((label, b, s))

    dec = pd.read_csv(DECISIONS, parse_dates=["date"]) if DECISIONS.exists() else pd.DataFrame()
    wk_dec = dec[dec["date"] >= week.index[0]] if len(dec) else dec

    lines = [f"# Weekly report — week ending {end:%Y-%m-%d}", "",
             f"Broker: {eq['broker'].iloc[-1]} · equity ${eq['equity'].iloc[-1]:,.2f} · "
             f"{len(eq)} trading days logged", "",
             "| Period | Book return | SPY return | Excess | Book Sharpe | SPY Sharpe | Book max DD | SPY max DD |",
             "|---|---|---|---|---|---|---|---|"]
    for label, b, s in rows:
        lines.append(f"| {label} | {b['total']:+.2%} | {s['total']:+.2%} | {b['total'] - s['total']:+.2%} | "
                     f"{b['sharpe']:.2f} | {s['sharpe']:.2f} | {b['max_dd']:.2%} | {s['max_dd']:.2%} |")
    lines += ["", "## Rebalance decisions this week", ""]
    if len(wk_dec):
        lines += ["| Date | Gate | Decision | By | Reason |", "|---|---|---|---|---|"]
        for _, d in wk_dec.iterrows():
            lines.append(f"| {d['date']:%Y-%m-%d} | {'pass' if d['gate_passed'] else 'fail'} | "
                         f"{d['decision']} | {d['decided_by']} | {str(d['reason']).replace('|', '/')} |")
    else:
        lines.append("None.")
    if len(eq) < config.MIN_PAPER_DAYS_BEFORE_LIVE:
        lines += ["", f"Live trading stays locked: {len(eq)}/{config.MIN_PAPER_DAYS_BEFORE_LIVE} paper days."]

    config.REPORT_DIR.mkdir(exist_ok=True)
    out = config.REPORT_DIR / f"weekly-{end:%Y-%m-%d}.md"
    out.write_text("\n".join(lines) + "\n")

    b, s = rows[0][1], rows[0][2]
    new = not WEEKLY.exists()
    with WEEKLY.open("a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["week_ending", "book_ret", "spy_ret", "excess", "equity", "days_logged"])
        w.writerow([f"{end:%Y-%m-%d}", round(b["total"], 5), round(s["total"], 5),
                    round(b["total"] - s["total"], 5), eq["equity"].iloc[-1], len(eq)])
    print(out.read_text())


if __name__ == "__main__":
    main()
