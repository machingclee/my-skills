"""Per-request DeepSeek max_tokens for the chat completion.

The four values match the slider in the chat UI. Tool calls keep their own
short cap and do not read this context.
"""

from contextvars import ContextVar

# DeepSeek V4 Flash maximum output is 384K. The other three are the API's
# own defaults: 8_192 without thinking, 65_536 with thinking, 131_072 at
# reasoning effort max.
MAX_TOKEN_LEVELS = {
    "min": 8192,
    "moderate": 65536,
    "max": 131072,
    "ultra": 393216,
}
ALLOWED_MAX_TOKENS = frozenset(MAX_TOKEN_LEVELS.values())
DEFAULT_MAX_TOKENS = MAX_TOKEN_LEVELS["min"]

_current_max_tokens: ContextVar[int] = ContextVar(
    "deepseek_max_tokens",
    default=DEFAULT_MAX_TOKENS,
)


def set_request_max_tokens(value) -> int:
    """Accept only the four slider values. Anything else stays at min."""
    try:
        tokens = int(value)
    except (TypeError, ValueError):
        tokens = DEFAULT_MAX_TOKENS
    if tokens not in ALLOWED_MAX_TOKENS:
        tokens = DEFAULT_MAX_TOKENS
    _current_max_tokens.set(tokens)
    return tokens


def current_max_tokens() -> int:
    """The ceiling for this request. Missing or unknown values are min."""
    return _current_max_tokens.get()
