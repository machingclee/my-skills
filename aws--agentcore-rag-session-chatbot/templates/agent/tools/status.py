from strands import tool


@tool
def status(message: str) -> str:
    """Echo a status message for the user to see in the frontend.

    Use this to show progress updates between search steps — the message
    is displayed as a visible tool result instead of fleeting streamed text.

    Args:
        message: A short progress message, e.g. "Searching for: Kubernetes
                 pod networking" or "Found 12 articles."
    """
    return message
