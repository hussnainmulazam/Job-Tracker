"""
backend/app/core/events.py
~~~~~~~~~~~~~~~~~~~~~~~~~~
Real-time Server-Sent Events (SSE) broadcaster for recruiter agent status.
Publishes lifecycle events:
- cv_received
- ai_scanning
- scored
- email_sent
- interview_scheduled
- status_changed
"""
import asyncio
import json
import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)


class AgentEventBroadcaster:
    def __init__(self):
        # user_id -> set of (asyncio.Queue, asyncio.AbstractEventLoop)
        self._subscribers: Dict[uuid.UUID, Set[Tuple[asyncio.Queue, asyncio.AbstractEventLoop]]] = {}
        self._lock = threading.Lock()

    def subscribe(self, user_id: uuid.UUID) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=100)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        with self._lock:
            if user_id not in self._subscribers:
                self._subscribers[user_id] = set()
            self._subscribers[user_id].add((q, loop))
        logger.info("SSE client connected for user %s (total clients: %d)", user_id, len(self._subscribers[user_id]))
        return q

    def unsubscribe(self, user_id: uuid.UUID, q: asyncio.Queue) -> None:
        with self._lock:
            if user_id in self._subscribers:
                self._subscribers[user_id] = {item for item in self._subscribers[user_id] if item[0] is not q}
                if not self._subscribers[user_id]:
                    del self._subscribers[user_id]
        logger.info("SSE client disconnected for user %s", user_id)

    def emit_sync(self, user_id: uuid.UUID, event_type: str, data: Dict[str, Any]) -> None:
        """Thread-safe synchronous emitter called from sync tasks, endpoints, and workers."""
        with self._lock:
            subscribers = list(self._subscribers.get(user_id, []))

        if not subscribers:
            return

        payload = {
            "event": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        def _safe_put(queue: asyncio.Queue, msg: Dict[str, Any]):
            try:
                queue.put_nowait(msg)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                    queue.put_nowait(msg)
                except Exception:
                    pass

        for q, loop in subscribers:
            try:
                if loop.is_running():
                    loop.call_soon_threadsafe(_safe_put, q, payload)
                else:
                    _safe_put(q, payload)
            except Exception as e:
                logger.debug("Failed to deliver SSE event to queue: %s", e)

    async def emit(self, user_id: uuid.UUID, event_type: str, data: Dict[str, Any]) -> None:
        self.emit_sync(user_id, event_type, data)


agent_events = AgentEventBroadcaster()
