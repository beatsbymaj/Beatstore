"""Black-Litterman maths, ported from case3.ipynb and vectorised.

Two changes from the notebook, both bug fixes:
  * exp_ret() in the notebook passed tau where it meant the risk-aversion delta
    when computing the implied prior; here the prior always uses delta.
  * fin_weights() used (tau*Sigma)^-1 * 2 and then L2-normalised, which leaves
    net exposure arbitrary (that is where the large net shorts came from).
    Here the weights are the standard (delta*Sigma)^-1 mu, then risk limits apply.
"""
import numpy as np

import config


def log_returns(prices: np.ndarray) -> np.ndarray:
    return np.log(prices[1:] / prices[:-1])


def covariance(returns: np.ndarray) -> np.ndarray:
    return np.cov(returns, rowvar=False, ddof=1)


def implied_returns(market_caps: np.ndarray, cov: np.ndarray, delta: float) -> np.ndarray:
    w_mkt = market_caps / market_caps.sum()
    return delta * cov @ w_mkt


def views_from_targets(prices: np.ndarray, targets: np.ndarray, horizon: int) -> np.ndarray:
    """Analyst target -> expected daily log return over the target horizon."""
    return np.log(targets / prices) / horizon


def posterior_returns(cov, pi, P, Q, tau):
    """E[R] = [(tau S)^-1 + P' O^-1 P]^-1 [(tau S)^-1 pi + P' O^-1 Q], O = tau P S P'."""
    omega = tau * P @ cov @ P.T
    ts_inv = np.linalg.pinv(tau * cov)
    om_inv = np.linalg.pinv(omega)
    a = ts_inv + P.T @ om_inv @ P
    b = ts_inv @ pi + P.T @ om_inv @ Q
    return np.linalg.pinv(a) @ b


def raw_weights(mu, cov, delta):
    return np.linalg.pinv(delta * cov) @ mu


def apply_limits(w: np.ndarray) -> np.ndarray:
    """Scale to the gross cap, then clip per-name and net limits until stable."""
    w = w.astype(float).copy()
    for _ in range(50):
        gross = np.abs(w).sum()
        if gross > config.MAX_GROSS_EXPOSURE:
            w *= config.MAX_GROSS_EXPOSURE / gross
        w = np.clip(w, -config.MAX_SINGLE_SHORT, config.MAX_SINGLE_LONG)
        net = w.sum()
        if net < config.MIN_NET_EXPOSURE:
            # lift the shorts toward zero first, then add to longs
            shorts = w < 0
            need = config.MIN_NET_EXPOSURE - net
            room = -w[shorts].sum()
            if room > 0:
                w[shorts] *= max(0.0, 1 - need / room)
                need = config.MIN_NET_EXPOSURE - w.sum()
            if need > 1e-12:
                longs = w > 0
                w[longs] += need * (w[longs] / w[longs].sum()) if longs.any() else need / len(w)
        elif net > config.MAX_NET_EXPOSURE:
            longs = w > 0
            w[longs] *= max(0.0, 1 - (net - config.MAX_NET_EXPOSURE) / w[longs].sum())
        ok = (np.abs(w).sum() <= config.MAX_GROSS_EXPOSURE + 1e-9
              and w.min() >= -config.MAX_SINGLE_SHORT - 1e-9
              and w.max() <= config.MAX_SINGLE_LONG + 1e-9
              and config.MIN_NET_EXPOSURE - 1e-9 <= w.sum() <= config.MAX_NET_EXPOSURE + 1e-9)
        if ok:
            break
    return w


def trailing_sharpe(weights: np.ndarray, returns: np.ndarray) -> float:
    """Annualised Sharpe of holding `weights` over the trailing return window."""
    pnl = returns @ weights
    sd = pnl.std(ddof=1)
    return float("nan") if sd == 0 else float(pnl.mean() / sd * np.sqrt(252))


def candidate_book(prices, market_caps, targets):
    """prices: (T, N) closes, oldest first. Returns dict with every intermediate."""
    rets = log_returns(prices[-(config.LOOKBACK_DAYS + 1):])
    cov = covariance(rets)
    n = prices.shape[1]
    P = np.eye(n)
    pi = implied_returns(market_caps, cov, config.RISK_AVERSION)
    Q = views_from_targets(prices[-1], targets, config.TARGET_HORIZON_DAYS)
    mu = posterior_returns(cov, pi, P, Q, config.TAU)
    raw = raw_weights(mu, cov, config.RISK_AVERSION)
    capped = apply_limits(raw)
    return {"returns": rets, "cov": cov, "pi": pi, "views": Q, "posterior": mu,
            "raw_weights": raw, "weights": capped}
