"""Removed.

Page range is per chunk, not per title. A title-keyed lookup cannot recover
it, and registering this tool made the model call it instead of copying
`rerank_chunks`'s finished `link`. Do not re-add it.

This file is a tombstone so an old import fails loudly rather than silently
dropping page numbers. Delete it when copying templates into a new repo.
"""

raise ImportError(
    "article_links was removed. Copy `rerank_chunks` `link` verbatim; "
    "do not rebuild citations from titles."
)
