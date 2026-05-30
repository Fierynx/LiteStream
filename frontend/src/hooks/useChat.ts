import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

export interface ChatMessage {
    id: number;
    user: string;
    color: string;
    text: string;
    badge?: string;
}

export function useChat(streamKey: string, vodId: string, username: string) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [connected, setConnected] = useState(false);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const msgIdRef = useRef(1);
    const seenDbIds = useRef<Set<number>>(new Set());

    // ── Phase 1: Fetch persisted history ───────────────────────────────────
    useEffect(() => {
        if (!streamKey) return;
        let cancelled = false;
        
        if (!vodId) {
            setHistoryLoaded(true);
            return;
        }

        axios
            .get<{
                data: Array<{
                    id: number;
                    user: string;
                    text: string;
                    color: string;
                }>;
            }>(`${import.meta.env.VITE_API_URL}/chat/${vodId}`)
            .then(({ data }) => {
                if (cancelled) return;
                const history: ChatMessage[] = (data.data ?? []).map((r) => {
                    seenDbIds.current.add(r.id);
                    return {
                        id: msgIdRef.current++,
                        user: r.user,
                        color: r.color ?? "#39ff14",
                        text: r.text,
                    };
                });
                setMessages(history);
            })
            .catch((err) => {
                if (!cancelled)
                    console.warn("[LiteStream] Could not load chat history:", err);
            })
            .finally(() => {
                if (!cancelled) setHistoryLoaded(true);
            });

        return () => {
            cancelled = true;
        };
    }, [vodId]);

    // ── Phase 2: Open WebSocket ONLY after history is loaded ───────────────
    useEffect(() => {
        if (!historyLoaded || !streamKey) return;

        let reconnectTimeout: ReturnType<typeof setTimeout>;
        let attempt = 0;
        let isUnmounted = false;

        const connect = () => {
            const token = localStorage.getItem("ls_token") || "";
            const wsUrl = `${import.meta.env.VITE_WS_URL}/ws/${streamKey}${token ? `?token=${token}` : ""}`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                if (isUnmounted) return;
                setConnected(true);
                attempt = 0; // reset backoff
                console.log("[LiteStream] WS connected");
            };

            ws.onmessage = (event: MessageEvent) => {
                if (isUnmounted) return;
                try {
                    const lines = (event.data as string).split("\n").filter(Boolean);
                    setMessages((prev) => {
                        let next = [...prev];
                        for (const line of lines) {
                            const parsed = JSON.parse(line) as {
                                user: string;
                                text: string;
                                color: string;
                            };
                            next = [
                                ...next,
                                {
                                    id: msgIdRef.current++,
                                    user: parsed.user,
                                    color: parsed.color ?? "#39ff14",
                                    text: parsed.text,
                                },
                            ];
                        }
                        return next.slice(-200);
                    });
                } catch (err) {
                    console.warn("[LiteStream] Failed to parse WS message", err);
                }
            };

            ws.onclose = () => {
                if (isUnmounted) return;
                setConnected(false);
                console.log("[LiteStream] WS disconnected");
                scheduleReconnect();
            };

            ws.onerror = (err) => {
                if (isUnmounted) return;
                console.error("[LiteStream] WS error", err);
                setConnected(false);
                // onclose will fire after onerror, triggering reconnect
            };
        };

        const scheduleReconnect = () => {
            if (isUnmounted) return;
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
            attempt++;
            console.log(`[LiteStream] WS reconnecting in ${delay}ms (attempt ${attempt})...`);
            reconnectTimeout = setTimeout(connect, delay);
        };

        connect();

        return () => {
            isUnmounted = true;
            clearTimeout(reconnectTimeout);
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [streamKey, historyLoaded]);

    const sendMessage = useCallback(
        (text: string) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
                return;
            wsRef.current.send(JSON.stringify({ user: username, text }));
        },
        [username],
    );

    return { messages, connected, historyLoaded, sendMessage };
}
