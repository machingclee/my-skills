import os
from openai import AzureOpenAI
from litellm import completion
from pydantic import BaseModel, Field

from env import load_env, pg_connect

load_env()

# Set environment variables for litellm
os.environ["AZURE_API_KEY"] = os.getenv("AZURE_OPENAI_API_KEY")
os.environ["AZURE_API_BASE"] = os.getenv("AZURE_OPENAI_ENDPOINT")
os.environ["AZURE_API_VERSION"] = os.getenv("AZURE_API_VERSION")


class Result(BaseModel):
    page_content: str
    metadata: dict


class RankOrder(BaseModel):
    order: list[int] = Field(
        description="The order of relevance of chunks, from most relevant to least relevant, by chunk id number"
    )


class RAGQuestionAnswerer:
    """RAG system for answering questions using PostgreSQL vector store"""

    def __init__(self, retrieval_k: int = 10):
        self.conn = pg_connect()

        # Azure OpenAI setup
        self.client = AzureOpenAI(
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            api_version=os.getenv("AZURE_API_VERSION"),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
        )

        self.embedding_model = "text-embedding-ada-002"
        self.model = f"azure/{os.getenv('AZURE_OPENAI_MODEL')}"
        self.retrieval_k = retrieval_k

    def create_embeddings(self, batch_of_texts: list[str]) -> list[list[float]]:
        response = self.client.embeddings.create(
            model=self.embedding_model,
            input=batch_of_texts
        )
        return [e.embedding for e in response.data]

    def fetch_context_unranked(self, question: str) -> list[Result]:
        """Query PostgreSQL for relevant chunks"""
        # Get query embedding
        query_embedding = self.create_embeddings([question])[0]

        # Query PostgreSQL
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT id, content, metadata,
                   embedding <=> %s::vector AS distance
            FROM embeddings
            ORDER BY distance
            LIMIT %s
            """,
            (query_embedding, self.retrieval_k)
        )

        results = cur.fetchall()
        chunks = []
        for row in results:
            chunks.append(Result(
                page_content=row[1],
                metadata=row[2]
            ))

        return chunks

    def rerank(self, question: str, chunks: list[Result]) -> list[Result]:
        """Rerank chunks using LLM"""
        system_prompt = """
You are a document re-ranker.
You are provided with a question and a list of relevant chunks of text from a query of a knowledge base.
The chunks are provided in the order they were retrieved; this should be approximately ordered by relevance, but you may be able to improve on that.
You must rank order the provided chunks by relevance to the question, with the most relevant chunk first.
Reply only with the list of ranked chunk ids, nothing else. Include all the chunk ids you are provided with, reranked.
"""
        user_prompt = f"The user has asked the following question:\n\n{question}\n\nOrder all the chunks of text by relevance to the question, from most relevant to least relevant. Include all the chunk ids you are provided with, reranked.\n\n"
        user_prompt += "Here are the chunks:\n\n"
        for index, chunk in enumerate(chunks):
            user_prompt += f"# CHUNK ID: {index + 1}:\n\n{chunk.page_content}\n\n"
        user_prompt += "Reply only with the list of ranked chunk ids, nothing else."

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response = completion(model=self.model, messages=messages,
                              response_format=RankOrder)
        reply = response.choices[0].message.content
        order = RankOrder.model_validate_json(reply).order
        print(f"Reranked order: {order}")
        return [chunks[i - 1] for i in order]

    def fetch_reranked_context(self, question: str) -> list[Result]:
        """Fetch and rerank context"""
        chunks = self.fetch_context_unranked(question)
        return self.rerank(question, chunks)

    def rewrite_query(self, question: str, history: list = []) -> str:
        """Rewrite the user's question to be more specific"""
        sys_message = f"""
You are in a conversation with a user, answering questions about {{DOMAIN_DESCRIPTION}}.
You are about to look up information in a Knowledge Base to answer the user's question.

This is the history of your conversation so far with the user:
{history}

And this is the user's current question:
{question}

Respond only with a single, refined question that you will use to search the Knowledge Base.
It should be a VERY short specific question most likely to surface content. Focus on the question details.
IMPORTANT: Respond ONLY with the knowledgebase query, nothing else.

Do not mention internal tooling names unless they appear in the docs.
"""
        response = completion(model=self.model, messages=[
            {"role": "system", "content": sys_message}
        ])
        return response.choices[0].message.content

    def make_rag_messages(self, question: str, history: list, chunks: list[Result]) -> list[dict]:
        """Create messages for RAG"""
        SYSTEM_PROMPT = """
You are a knowledgeable, friendly assistant to search {{DOMAIN_DESCRIPTION}}.
You are chatting with a user about finding related articles.
Your answer will be evaluated for accuracy, relevance and completeness, so make sure it only answers the question and fully answers it.
If you don't know the answer, say so.
For context, here are specific extracts from the Knowledge Base that might be directly relevant to the user's question:
{context}

With this context, please answer the user's question. Be accurate, relevant and complete.
"""
        context = "\n\n".join(
            f"Extract from article titled '{chunk.metadata['title']}':\n{chunk.page_content}"
            for chunk in chunks
        )
        system_prompt = SYSTEM_PROMPT.format(context=context)
        return [{"role": "system", "content": system_prompt}] + history + [{"role": "user", "content": question}]

    def answer_question(self, question: str, history: list[dict] = []) -> tuple[str, list]:
        """
        Answer a question using RAG and PostgreSQL vector store

        Args:
            question: The user's question
            history: Conversation history

        Returns:
            tuple: (answer, retrieved_chunks)
        """
        # Rewrite query for better retrieval
        query = self.rewrite_query(question, history)
        print(f"Rewritten query: {query}")

        # Fetch and rerank context
        chunks = self.fetch_reranked_context(query)

        # Generate answer
        messages = self.make_rag_messages(question, history, chunks)
        response = completion(model=self.model, messages=messages)

        return response.choices[0].message.content, chunks

    def close(self):
        """Close database connection"""
        self.conn.close()


if __name__ == "__main__":
    # Example usage
    rag = RAGQuestionAnswerer(retrieval_k=10)

    try:
        question = "restore database "
        answer, chunks = rag.answer_question(question)

        print("\n" + "="*80)
        print("QUESTION:", question)
        print("="*80)
        print("\nANSWER:", answer)
        # print("\n" + "="*80)
        titles = [chunk.metadata['title'] for chunk in chunks]
        # print(titles)
        # print("="*80)
    finally:
        rag.close()
