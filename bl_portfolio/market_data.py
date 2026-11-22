"""Yahoo Finance access via yfinance: closes, shares outstanding, analyst targets."""
import pandas as pd
import yfinance as yf


def closes(tickers, period="2y") -> pd.DataFrame:
    df = yf.download(tickers, period=period, interval="1d", auto_adjust=True,
                     progress=False, threads=True)["Close"]
    if isinstance(df, pd.Series):
        df = df.to_frame(tickers[0])
    return df[tickers].dropna(how="any")


def fundamentals(tickers):
    """Per ticker: shares outstanding and the analyst price-target summary."""
    out = {}
    for t in tickers:
        tk = yf.Ticker(t)
        tg = tk.analyst_price_targets or {}
        shares = tk.fast_info.shares
        n_analysts = None
        try:
            n_analysts = tk.info.get("numberOfAnalystOpinions")
        except Exception:
            pass
        if not tg.get("mean") or not shares:
            raise RuntimeError(f"{t}: missing analyst target or shares from Yahoo ({tg}, {shares})")
        out[t] = {"shares": float(shares), "target_mean": float(tg["mean"]),
                  "target_median": tg.get("median"), "target_high": tg.get("high"),
                  "target_low": tg.get("low"), "yahoo_current": tg.get("current"),
                  "n_analysts": n_analysts}
    return out
