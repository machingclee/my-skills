from tools.search_articles import search_articles
from tools.rephrase_query import rephrase_query
from tools.find_tags import find_tags
from tools.rerank_chunks import rerank_chunks
from tools.status import status

# Do not register a title-keyed link builder. Page range is per *chunk*, and a
# title lookup cannot recover it. `rerank_chunks` already returns a finished
# `link`; a second builder made the model call it out of habit and drop the pages.
tools = [rephrase_query, find_tags, search_articles, rerank_chunks, status]
