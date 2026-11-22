"""Paper (and, later, live) execution.

LocalPaperBroker  - simulated ledger in logs/book.json, fills at the close +/- slippage.
AlpacaBroker      - Alpaca REST; paper endpoint unless the live guard passes.
"""
import json
import os

import pandas as pd
import requests

import config

BOOK = config.LOG_DIR / "book.json"
EQUITY = config.LOG_DIR / "equity.csv"


def live_allowed() -> tuple[bool, str]:
    if config.TRADING_MODE != "live":
        return False, "TRADING_MODE is not 'live'"
    if os.environ.get("LIVE_CONFIRM") != "I_UNDERSTAND":
        return False, "LIVE_CONFIRM=I_UNDERSTAND not set"
    days = len(pd.read_csv(EQUITY)) if EQUITY.exists() else 0
    if days < config.MIN_PAPER_DAYS_BEFORE_LIVE:
        return False, f"only {days} paper days logged, need {config.MIN_PAPER_DAYS_BEFORE_LIVE}"
    return True, "live guard passed"


class LocalPaperBroker:
    name = "local-paper"

    def __init__(self):
        if BOOK.exists():
            self.state = json.loads(BOOK.read_text())
        else:
            self.state = {"cash": config.STARTING_CASH, "positions": {}, "trades": 0}

    def equity(self, px: dict) -> float:
        return self.state["cash"] + sum(q * px[t] for t, q in self.state["positions"].items())

    def weights(self, px: dict, tickers) -> list[float]:
        eq = self.equity(px)
        return [self.state["positions"].get(t, 0.0) * px[t] / eq for t in tickers]

    def rebalance(self, target: dict, px: dict) -> list[dict]:
        eq = self.equity(px)
        fills = []
        for t, w in target.items():
            cur = self.state["positions"].get(t, 0.0)
            want = w * eq / px[t]
            dq = want - cur
            if abs(dq * px[t]) < 1.0:
                continue
            slip = config.SLIPPAGE_BPS / 1e4 * (1 if dq > 0 else -1)
            fill_px = px[t] * (1 + slip)
            self.state["cash"] -= dq * fill_px
            self.state["positions"][t] = want
            fills.append({"ticker": t, "qty": round(dq, 4), "price": round(fill_px, 4)})
        self.state["trades"] += len(fills)
        return fills

    def save(self):
        BOOK.write_text(json.dumps(self.state, indent=2))


class AlpacaBroker:
    """Whole-share market orders, queued for the next open when sent after the close."""
    name = "alpaca"

    def __init__(self):
        live, why = live_allowed()
        self.live = live
        self.base = ("https://api.alpaca.markets" if live else "https://paper-api.alpaca.markets")
        self.name = "alpaca-live" if live else "alpaca-paper"
        self.h = {"APCA-API-KEY-ID": os.environ["ALPACA_KEY_ID"],
                  "APCA-API-SECRET-KEY": os.environ["ALPACA_SECRET_KEY"]}
        self.guard_reason = why

    def _get(self, path):
        r = requests.get(self.base + path, headers=self.h, timeout=30)
        r.raise_for_status()
        return r.json()

    def equity(self, px=None) -> float:
        return float(self._get("/v2/account")["equity"])

    def positions(self) -> dict:
        return {p["symbol"]: float(p["qty"]) for p in self._get("/v2/positions")}

    def weights(self, px: dict, tickers) -> list[float]:
        eq, pos = self.equity(), self.positions()
        return [pos.get(t, 0.0) * px[t] / eq for t in tickers]

    def rebalance(self, target: dict, px: dict) -> list[dict]:
        eq, pos = self.equity(), self.positions()
        fills = []
        for t, w in target.items():
            dq = int(round(w * eq / px[t] - pos.get(t, 0.0)))
            if dq == 0:
                continue
            order = {"symbol": t, "qty": str(abs(dq)), "side": "buy" if dq > 0 else "sell",
                     "type": "market", "time_in_force": "day"}
            r = requests.post(self.base + "/v2/orders", headers=self.h, json=order, timeout=30)
            r.raise_for_status()
            fills.append({"ticker": t, "qty": dq, "order_id": r.json().get("id")})
        return fills

    def save(self):
        pass


def get_broker():
    return AlpacaBroker() if config.BROKER == "alpaca" else LocalPaperBroker()
