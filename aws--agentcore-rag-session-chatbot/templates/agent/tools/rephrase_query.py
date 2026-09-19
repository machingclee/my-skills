from strands import tool

from model.load import DEEPSEEK_MODEL, DEEPSEEK_NO_THINKING, get_llm_client

MODEL_ID = DEEPSEEK_MODEL
_client = get_llm_client()


@tool
def rephrase_query(question: str) -> str:
    """Rephrase a question for semantic search in the {{DOMAIN_DESCRIPTION}} knowledge base.

    This is the FIRST step. Makes the question concise and search-friendly.
    Tag/keyword selection is handled separately by find_tags.
    """
    system_prompt = (
        "You help search {{DOMAIN_DESCRIPTION}}. Rewrite the "
        "user's question into a short, focused query suitable for semantic "
        "search. Remove conversational filler and make the phrasing more "
        "search-friendly. Do NOT add keywords or tags — just make the "
        "question concise and clear. Return ONLY the rephrased query."
    )

    response = _client.chat.completions.create(
        model=MODEL_ID,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
        max_tokens=200,
        extra_body=DEEPSEEK_NO_THINKING,
    )

    return (response.choices[0].message.content or "").strip()
