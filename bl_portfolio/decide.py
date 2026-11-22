"""Claude reviews each rebalance that passed the Sharpe gate and answers execute or hold."""
import json
import os

import config

SYSTEM = """You are the risk reviewer for a small long/short equity book run by a \
Black-Litterman model whose views are Yahoo Finance consensus analyst price targets.

Each trading day after the close you get one proposed rebalance that has already \
passed the hard checks: per-name and net exposure limits, and a Sharpe gate (the \
proposed weights had a higher trailing Sharpe than the current book). Decide whether \
to EXECUTE it or HOLD the current book.

Things worth weighing: whether the turnover is worth it for the Sharpe improvement; \
whether a view rests on a stale, thin or very dispersed set of analyst targets; \
concentration; and whether the book is chasing a target that the price has already \
passed. Holding is a normal outcome, not a failure.

Give a reason of one to three sentences that names the specific numbers that decided it."""

SCHEMA = {
    "type": "object",
    "properties": {
        "decision": {"type": "string", "enum": ["execute", "hold"]},
        "reason": {"type": "string"},
    },
    "required": ["decision", "reason"],
    "additionalProperties": False,
}


def decide(proposal: dict) -> dict:
    """Returns {"decision", "reason", "decided_by"}."""
    if not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return {"decision": "execute",
                "reason": "No Anthropic credentials set; rule fallback executes every gated rebalance.",
                "decided_by": "rule"}

    import anthropic
    client = anthropic.Anthropic()
    try:
        resp = client.beta.messages.create(
            model=config.CLAUDE_MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": config.CLAUDE_EFFORT,
                           "format": {"type": "json_schema", "schema": SCHEMA}},
            system=SYSTEM,
            messages=[{"role": "user", "content": json.dumps(proposal, indent=2)}],
        )
    except anthropic.APIConnectionError as e:
        return {"decision": "hold", "reason": f"Claude unreachable ({e}); holding.", "decided_by": "error"}
    except anthropic.RateLimitError as e:
        return {"decision": "hold", "reason": f"Claude rate-limited ({e}); holding.", "decided_by": "error"}
    except anthropic.APIStatusError as e:
        return {"decision": "hold", "reason": f"Claude API error {e.status_code}; holding.", "decided_by": "error"}

    if resp.stop_reason == "refusal":
        return {"decision": "hold", "reason": "Claude declined to review; holding.", "decided_by": resp.model}
    text = next((b.text for b in resp.content if b.type == "text"), "")
    try:
        out = json.loads(text)
    except json.JSONDecodeError:
        return {"decision": "hold", "reason": "Unparseable reply from Claude; holding.", "decided_by": resp.model}
    out["decided_by"] = resp.model
    return out
