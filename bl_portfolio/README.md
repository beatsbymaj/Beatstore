# bl_portfolio — the Case 3 Black-Litterman bot, on real stocks

This builds on [aardisaputra/uchicago_case3](https://github.com/aardisaputra/uchicago_case3), which won 3rd place in Case 3 of the 2022 UChicago Trading Competition.

| File | What it is |
|---|---|
| `case3_original.ipynb` | The Colab notebook as it was published |
| `case3.ipynb` | The same code made to run locally: no Drive mount, `./case3data/` paths, cells in run order, plus a diagnostics cell. It has already been executed and its outputs are saved |
| `case3data/` | The competition data (prices for A–I, three analysts, shares outstanding) |
| `blcore.py` | The notebook's Black-Litterman maths, vectorised, plus the risk limits and the Sharpe gate |
| `market_data.py` | Yahoo Finance via yfinance: closes, shares outstanding, consensus analyst price targets |
| `decide.py` | Claude's execute-or-hold review of each rebalance that passes the gate |
| `broker.py` | Local paper ledger (default), Alpaca paper, and the guard that keeps live trading locked |
| `run_daily.py` | The daily after-close run |
| `weekly_report.py` | Weekly comparison of the book with SPY |
| `config.py` | Tickers, limits, model, and broker settings |

## The daily run

1. Pull two years of daily closes for the nine names and SPY, then each name's shares outstanding and analyst targets (mean, median, high, low, number of analysts).
2. **Views:** each name's view is `ln(mean target / close) / 252`, the daily log return implied by its 12-month consensus target. It is used with an identity picking matrix and Ω = τ·PΣPᵀ, the same as the notebook.
3. **Prior:** the market-cap-implied returns, π = δΣw_mkt, with δ = 2.4 and τ = 0.05 (the notebook's values). Σ comes from the last 252 days.
4. **Weights:** w = (δΣ)⁻¹·E[R], then the risk limits: no single short below −10%, no long above 30%, net exposure between 0 and 100%, and gross exposure at most 150%.
5. **Sharpe gate (the notebook's rule):** the new weights only go in if their trailing 63-day Sharpe beats the current book's. With an empty book, the comparison is against 1/N, which is where the notebook starts too.
6. **Claude decides:** a rebalance that passes the gate and moves at least 2% of the book goes to Claude (`claude-fable-5-2`). Claude sees the analyst targets, their spread and analyst counts, both Sharpes, the turnover, and the current and proposed weights, and answers `execute` or `hold` with a reason. The code enforces the gate, so Claude can hold a passing rebalance but can never push through a failing one. If no API key is set, the gate's verdict stands (`decided_by=rule`). If the API errors, the book holds.
7. Execute in the paper book and append to the logs.

### Logs (all in `logs/`)

- `targets.csv`: one row per ticker per day, with close, the target summary, upside, the view, the posterior, the raw weight, and the capped weight.
- `decisions.csv`: one row per day, with both Sharpes, whether the gate passed, turnover, the raw and capped net exposure, the decision, who decided, the reason, and the weights and fills.
- `equity.csv`: the daily equity of the book next to the SPY close.
- `weekly.csv` and `reports/weekly-*.md`: the weekly book-vs-SPY tables.
- `book.json`: the local paper ledger (cash and shares).

## Two bugs in the notebook, fixed here

- `exp_ret()` passed `tau` where the risk-aversion `delta` belonged when it computed the implied prior.
- `fin_weights()` multiplied by `2·(τΣ)⁻¹` and then scaled the weights to unit length (L2 norm), so net exposure was never controlled. On top of that, when the gate fails the notebook falls back to the *sum* of every book it has accepted so far, not their average. So exposure grows until the list resets.

Measured on case3data (the diagnostics cell in `case3.ipynb`, 2,509 days):

| | Notebook as written |
|---|---|
| Net exposure | min −508%, median +522%, max +4,646% |
| Most negative single weight | −317% |
| Days net short / days below −50% net | 39 / 23 |
| Annualised Sharpe | 0.60 (1/N on the same data: 0.86) |

Here, net, gross, and per-name limits are applied explicitly.

The notebook's gate compared the spread of weight × return across the nine assets on a single day. Here, the gate compares each book's Sharpe over the past 63 days, which is the same rule measured over time.

## Running it

```bash
pip install -r requirements.txt
python run_daily.py --dry-run   # look without trading or logging
python run_daily.py             # after the close; refuses to run twice on the same close
python weekly_report.py
```

Environment variables: `ANTHROPIC_API_KEY` (for Claude's decision), `CLAUDE_MODEL` (default `claude-fable-5-2`), `BROKER=local|alpaca`, `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`.

**Schedule:** `.github/workflows/bl-portfolio.yml` runs the daily step at 21:45 UTC on weekdays (after the close in both EST and EDT) and the weekly report on Saturdays. It commits the logs back to the repo. GitHub only runs scheduled workflows from the default branch, so the schedule starts once this is merged to `main`. Add `ANTHROPIC_API_KEY` as a repository secret.

## Going live (not yet)

`broker.py` uses Alpaca's live endpoint only when all of these are true:
- `BROKER=alpaca` and `TRADING_MODE=live`
- `LIVE_CONFIRM=I_UNDERSTAND`
- `logs/equity.csv` holds at least 60 trading days of paper history

Until then, every order goes to paper. Sixty days is the minimum the code enforces. The decision to go live should rest on months of the weekly SPY reports.
