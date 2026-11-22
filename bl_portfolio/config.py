"""Settings for the live Black-Litterman book. Edit these, not the code."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "logs"
REPORT_DIR = ROOT / "reports"

# Nine real names, standing in for the competition's assets A-I.
TICKERS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "JPM", "XOM", "UNH", "KO"]
BENCHMARK = "SPY"

# --- Black-Litterman (same constants as the notebook) ---
TAU = 0.05            # tuning constant
RISK_AVERSION = 2.4   # notebook's rap
LOOKBACK_DAYS = 252   # trading days used for the covariance matrix
TARGET_HORIZON_DAYS = 252  # analyst targets are ~12-month targets

# --- Sharpe gate ---
# A candidate book is only allowed in if its trailing Sharpe beats the current book's.
SHARPE_WINDOW_DAYS = 63

# --- Risk limits (applied before the gate) ---
MAX_SINGLE_SHORT = 0.10   # no name below -10% of equity
MAX_SINGLE_LONG = 0.30    # no name above +30% of equity
MIN_NET_EXPOSURE = 0.0    # book may not be net short
MAX_NET_EXPOSURE = 1.0
MAX_GROSS_EXPOSURE = 1.5

# --- Execution ---
MIN_TURNOVER_TO_TRADE = 0.02   # skip rebalances that move less than 2% of the book
SLIPPAGE_BPS = 5               # paper fills at close +/- 5 bps
STARTING_CASH = 100_000.0

# --- Claude decision step ---
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-fable-5-2")
CLAUDE_EFFORT = os.environ.get("CLAUDE_EFFORT", "high")

# --- Broker ---
# "local"  : simulated paper ledger in logs/ (default, no account needed)
# "alpaca" : Alpaca paper account (ALPACA_KEY_ID / ALPACA_SECRET_KEY)
BROKER = os.environ.get("BROKER", "local")
# Live trading needs ALL of: TRADING_MODE=live, LIVE_CONFIRM=I_UNDERSTAND,
# and at least MIN_PAPER_DAYS_BEFORE_LIVE days in logs/equity.csv.
TRADING_MODE = os.environ.get("TRADING_MODE", "paper")
MIN_PAPER_DAYS_BEFORE_LIVE = 60
