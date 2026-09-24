import os
from typing import Any, Optional

from strands import Agent
from strands.session import S3SessionManager
from strands.types.content import Message
from strands.types.session import SessionAgent, SessionMessage

S3_SESSION_BUCKET = os.getenv(
    "S3_SESSION_BUCKET", "{{S3_SESSION_BUCKET}}")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# Side-question turns are numbered from this base instead of continuing the parent
# thread's numbering. The parent counts up from 0, so every side id sorts after every
# parent id and the two ranges can never collide — including once the parent
# conversation keeps growing past the point where the side question was asked.
SIDE_QUESTION_MESSAGE_INDEX_BASE = 1_000_000


def get_s3_session_manager(
    session_id: Optional[str], actor_id: str
) -> Optional[S3SessionManager]:
    """Return an S3-backed session manager for conversation history."""
    return S3SessionManager(
        session_id=session_id or "default",
        bucket=S3_SESSION_BUCKET,
        prefix=f"sessions/{session_id or 'default'}",
        region_name=AWS_REGION,
    )


class SideQuestionSessionManager(S3SessionManager):
    """Session manager for `/btw` side questions.

    A side question must see the conversation it is a side question *about*, but must
    not write into it. So reads resolve to the parent thread while writes stay on this
    thread's own session id.

    The asymmetry is what makes it work: ``self.session_id`` is never changed, so the
    inherited ``create_message`` / ``update_agent`` already write under the side
    prefix. Only the reads are overridden, and each ignores the ``session_id`` it is
    handed and reaches for the parent prefix instead.

    Nothing is ever copied between the two prefixes. The parent's messages are
    materialised into ``agent.messages`` in memory by ``initialize()``; the side
    prefix only ever receives the side thread's own turns.
    """

    def __init__(
        self,
        session_id: str,
        parent_session_id: str,
        bucket: str,
        prefix: str = "",
        region_name: Optional[str] = None,
        **kwargs: Any,
    ):
        self.parent_session_id = parent_session_id
        super().__init__(
            session_id=session_id,
            bucket=bucket,
            prefix=prefix,
            region_name=region_name,
            **kwargs,
        )
        # ``super().__init__`` has just created this session's ``session.json`` if it
        # was missing. Force the restore path: ``_is_new_session`` is read ONLY by the
        # ``initialize*`` methods, and only to decide whether to attempt a
        # ``read_agent`` at all. What that read resolves to is our call, so this flag
        # is the single, well-understood lever.
        self._is_new_session = False

    # ── reads resolve to the parent ──────────────────────────────────────────

    def _get_session_path(self, session_id: str) -> str:
        """Resolve every session id against its *own* prefix.

        ``S3SessionManager`` bakes ``self.prefix`` in at construction, and builds every
        path as ``{self.prefix}/session_{session_id}/`` — so overriding the ``session_id``
        argument alone would still address this manager's own bucket path (e.g.
        ``sessions/{side}/session_{parent}/…``, which does not exist).

        Every path in the class funnels through here (``_get_agent_path`` and
        ``_get_message_path`` both call it), so deriving the prefix from the id being
        asked about is enough to make both the side thread's own reads and its parent's
        reads resolve correctly. Our own id keeps the base behaviour, so writes and the
        side's own ``session.json`` are unaffected.
        """
        if session_id == self.session_id:
            return super()._get_session_path(session_id)
        return f"sessions/{session_id}/session_{session_id}/"

    def read_agent(
        self, session_id: str, agent_id: str, **kwargs: Any
    ) -> Optional[SessionAgent]:
        """Return the parent thread's agent record.

        This is what carries the parent's ``AgentState`` and conversation-manager
        state into the side run — the latter keeps ``initialize()``'s
        ``offset=removed_message_count`` meaningful against the parent transcript.

        Falls back to this session's own record, then to ``None``; ``None`` makes
        ``initialize()`` take its *creating* branch (keyed off ``session_agent is
        None``, not ``_is_new_session``), so a side thread whose parent no longer
        exists starts clean instead of failing.
        """
        parent_agent = super().read_agent(
            self.parent_session_id, agent_id, **kwargs)
        if parent_agent is not None:
            return parent_agent
        return super().read_agent(session_id, agent_id, **kwargs)

    def list_messages(
        self,
        session_id: str,
        agent_id: str,
        limit: Optional[int] = None,
        offset: int = 0,
        **kwargs: Any,
    ) -> list[SessionMessage]:
        """Return the parent thread's transcript, then this thread's own turns.

        ``offset`` applies to the parent read only: it comes from the parent's
        conversation manager (``removed_message_count``) and says nothing about the
        side's own messages. ``S3SessionManager`` sorts each read numerically by
        ``message_id``, and side ids all sit above every parent id, so the two lists
        concatenate into the correct order.
        """
        parent_messages = super().list_messages(
            self.parent_session_id, agent_id, offset=offset, **kwargs)
        own_messages = super().list_messages(
            session_id, agent_id, offset=0, **kwargs)
        merged = parent_messages + own_messages
        if limit is not None:                      # no caller passes limit today
            merged = merged[:limit]
        return merged

    # ── writes stay on this session's own prefix (inherited unchanged) ───────

    def append_message(
        self, message: Message, agent: Agent, **kwargs: Any
    ) -> None:
        """Append a message, numbering it from the reserved side-question range.

        Identical to ``RepositorySessionManager.append_message`` except for the index.
        The inherited version continues from ``latest + 1``, which — once the parent
        conversation grows past that point — hands out ids this thread has already
        used, leaving two different messages claiming one id in the merged view.
        """
        latest = self._latest_agent_message.get(agent.agent_id)
        if latest is not None and latest.message_id >= SIDE_QUESTION_MESSAGE_INDEX_BASE:
            next_index = latest.message_id + 1
        else:
            next_index = SIDE_QUESTION_MESSAGE_INDEX_BASE

        session_message = SessionMessage.from_message(message, next_index)
        self._latest_agent_message[agent.agent_id] = session_message
        # ``self.session_id`` is the side thread, so this lands on the side prefix.
        self.create_message(self.session_id, agent.agent_id, session_message)


def get_side_question_session_manager(
    session_id: str, parent_session_id: str
) -> SideQuestionSessionManager:
    """Return a session manager that reads the parent thread and writes its own."""
    return SideQuestionSessionManager(
        session_id=session_id,
        parent_session_id=parent_session_id,
        bucket=S3_SESSION_BUCKET,
        prefix=f"sessions/{session_id}",
        region_name=AWS_REGION,
    )
