import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./FloatingChatBot.scss";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import chatSlice from "@/redux/slices/chatSlice";
import AgentChatInterface from "./AgentChatInterface";
import { RiRobot2Line } from "react-icons/ri";

const DEFAULT_WIDTH = 650;
const MIN_WIDTH = 360;
const DEFAULT_HEIGHT = 900;
const MIN_HEIGHT = 400;
const VIEWPORT_PAD = 16;
const EDGE_HANDLE = 8;
const CORNER_HANDLE = 14;
const DRAG_THRESHOLD = 4;
/** Keep in sync with the @media (max-width: 480px) rule in FloatingChatBot.scss. */
const NARROW_MAX = 480;

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type Frame = {
    left: number;
    top: number;
    width: number;
    height: number;
};

const RESIZE_CURSOR: Record<ResizeEdge, string> = {
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    ne: "nesw-resize",
    nw: "nwse-resize",
    se: "nwse-resize",
    sw: "nesw-resize",
};

const RESIZE_LABEL: Record<ResizeEdge, string> = {
    n: "Resize from the top",
    s: "Resize from the bottom",
    e: "Resize from the right",
    w: "Resize from the left",
    ne: "Resize from the top-right",
    nw: "Resize from the top-left",
    se: "Resize from the bottom-right",
    sw: "Resize from the bottom-left",
};

const RESIZE_HANDLES: { edge: ResizeEdge; style: React.CSSProperties }[] = [
    { edge: "n", style: { top: 0, left: CORNER_HANDLE, right: CORNER_HANDLE, height: EDGE_HANDLE } },
    { edge: "s", style: { bottom: 0, left: CORNER_HANDLE, right: CORNER_HANDLE, height: EDGE_HANDLE } },
    { edge: "e", style: { right: 0, top: CORNER_HANDLE, bottom: CORNER_HANDLE, width: EDGE_HANDLE } },
    { edge: "w", style: { left: 0, top: CORNER_HANDLE, bottom: CORNER_HANDLE, width: EDGE_HANDLE } },
    { edge: "ne", style: { top: 0, right: 0, width: CORNER_HANDLE, height: CORNER_HANDLE } },
    { edge: "nw", style: { top: 0, left: 0, width: CORNER_HANDLE, height: CORNER_HANDLE } },
    { edge: "se", style: { bottom: 0, right: 0, width: CORNER_HANDLE, height: CORNER_HANDLE } },
    { edge: "sw", style: { bottom: 0, left: 0, width: CORNER_HANDLE, height: CORNER_HANDLE } },
];

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(value)));

const clampSize = (width: number, height: number) => {
    const maxW = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
    const maxH = Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_PAD * 2);
    return {
        width: clamp(width, MIN_WIDTH, maxW),
        height: clamp(height, MIN_HEIGHT, maxH),
    };
};

const clampPosition = (left: number, top: number, width: number, height: number) => ({
    left: clamp(left, VIEWPORT_PAD, Math.max(VIEWPORT_PAD, window.innerWidth - width - VIEWPORT_PAD)),
    top: clamp(top, VIEWPORT_PAD, Math.max(VIEWPORT_PAD, window.innerHeight - height - VIEWPORT_PAD)),
});

function writeFrame(el: HTMLElement, next: Frame) {
    el.style.position = "fixed";
    el.style.left = `${next.left}px`;
    el.style.top = `${next.top}px`;
    el.style.width = `${next.width}px`;
    el.style.height = `${next.height}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.maxWidth = "none";
    el.style.maxHeight = "none";
    el.style.removeProperty("translate");
}

function writeTranslate(el: HTMLElement, x: number, y: number) {
    el.style.setProperty("translate", `${x}px ${y}px`);
}

function startGestureChrome(cursor: string) {
    const shield = document.createElement("div");
    shield.dataset.chatGestureShield = "true";
    shield.style.position = "fixed";
    shield.style.inset = "0";
    shield.style.zIndex = "100000";
    shield.style.cursor = cursor;
    shield.style.background = "none";
    shield.style.touchAction = "none";
    document.body.appendChild(shield);
    const blockSelect = (event: Event) => event.preventDefault();
    document.addEventListener("selectstart", blockSelect, true);
    return () => {
        shield.remove();
        document.removeEventListener("selectstart", blockSelect, true);
    };
}

function buildInitialFrame(
    storedWidth?: number,
    storedHeight?: number,
    storedLeft?: number,
    storedTop?: number,
): Frame {
    const size = clampSize(
        storedWidth && storedWidth >= MIN_WIDTH ? storedWidth : DEFAULT_WIDTH,
        storedHeight && storedHeight >= MIN_HEIGHT ? storedHeight : DEFAULT_HEIGHT,
    );
    const hasPosition = typeof storedLeft === "number" && typeof storedTop === "number";
    const position = clampPosition(
        hasPosition ? storedLeft : window.innerWidth - size.width - 57,
        hasPosition ? storedTop : window.innerHeight - size.height - 80,
        size.width,
        size.height,
    );
    return { ...position, ...size };
}

const FloatingChatBot: React.FC = () => {
    const dispatch = useAppDispatch();
    const isDarkMode = useAppSelector(state => state.theme.mode === "dark");
    const isOpen = useAppSelector(state => state.chat.isChatbotOpen);
    const storedWidth = useAppSelector(state => state.chat.chatbotWidth);
    const storedHeight = useAppSelector(state => state.chat.chatbotHeight);
    const storedLeft = useAppSelector(state => state.chat.chatbotLeft);
    const storedTop = useAppSelector(state => state.chat.chatbotTop);
    const isMaximized = useAppSelector(state => !!state.chat.chatbotMaximized);

    const [frame, setFrame] = useState(() =>
        buildInitialFrame(storedWidth, storedHeight, storedLeft, storedTop)
    );
    const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= NARROW_MAX);

    const windowRef = useRef<HTMLDivElement | null>(null);
    const interactingRef = useRef(false);
    const frameRef = useRef(frame);
    if (!interactingRef.current) {
        frameRef.current = frame;
    }

    const useFreeGeometry = !isMaximized && !isNarrow;

    const close = useCallback(() => {
        dispatch(chatSlice.actions.setIsChatbotOpen(false));
    }, [dispatch]);

    const persistFrame = useCallback((next: Frame) => {
        dispatch(chatSlice.actions.setChatbotFrame(next));
    }, [dispatch]);

    useEffect(() => {
        const onWindowResize = () => {
            const narrow = window.innerWidth <= NARROW_MAX;
            setIsNarrow(narrow);
            if (narrow || isMaximized || interactingRef.current) return;
            const size = clampSize(frameRef.current.width, frameRef.current.height);
            const position = clampPosition(
                frameRef.current.left,
                frameRef.current.top,
                size.width,
                size.height,
            );
            setFrame({ ...position, ...size });
        };
        window.addEventListener("resize", onWindowResize);
        return () => window.removeEventListener("resize", onWindowResize);
    }, [isMaximized]);

    useEffect(() => {
        if (isMaximized || isNarrow) return;
        const size = clampSize(frameRef.current.width, frameRef.current.height);
        const position = clampPosition(
            frameRef.current.left,
            frameRef.current.top,
            size.width,
            size.height,
        );
        const next = { ...position, ...size };
        setFrame((current) => (
            current.left === next.left &&
            current.top === next.top &&
            current.width === next.width &&
            current.height === next.height
                ? current
                : next
        ));
    }, [isMaximized, isNarrow]);

    useEffect(() => () => {
        document.querySelector("[data-chat-gesture-shield]")?.remove();
    }, []);

    const handleHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
        if (!useFreeGeometry) return;
        const target = e.target as HTMLElement;
        if (target.closest("button, a, input, textarea, .chat-history-panel")) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = frameRef.current.left;
        const startTop = frameRef.current.top;
        const startWidth = frameRef.current.width;
        const startHeight = frameRef.current.height;
        let dragging = false;
        const endChrome = startGestureChrome("move");
        windowRef.current?.classList.add("is-interacting");

        const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (!dragging) {
                if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
                dragging = true;
                interactingRef.current = true;
            }
            const el = windowRef.current;
            if (!el) return;
            const next = clampPosition(startLeft + dx, startTop + dy, startWidth, startHeight);
            frameRef.current = { ...next, width: startWidth, height: startHeight };
            // Compositor-only move. left/top stay put until release so the article tree is not restyled.
            writeTranslate(el, next.left - startLeft, next.top - startTop);
        };

        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
            endChrome?.();
            const el = windowRef.current;
            if (dragging && el) writeFrame(el, frameRef.current);
            el?.classList.remove("is-interacting");
            interactingRef.current = false;
            if (!dragging) return;
            setFrame(frameRef.current);
            persistFrame(frameRef.current);
        };

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
    }, [persistFrame, useFreeGeometry]);

    const handleResizeStart = useCallback((edge: ResizeEdge) => (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isOpen || !useFreeGeometry) return;
        e.preventDefault();
        e.stopPropagation();

        interactingRef.current = true;
        const handle = e.currentTarget;
        handle.classList.add("is-resizing");
        windowRef.current?.classList.add("is-interacting");
        const endChrome = startGestureChrome(RESIZE_CURSOR[edge]);

        const startX = e.clientX;
        const startY = e.clientY;
        const start = frameRef.current;
        const startRight = start.left + start.width;
        const startBottom = start.top + start.height;

        const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            let left = start.left;
            let top = start.top;
            let width = start.width;
            let height = start.height;

            if (edge.includes("e")) width = start.width + dx;
            if (edge.includes("s")) height = start.height + dy;
            if (edge.includes("w")) {
                width = start.width - dx;
                left = startRight - width;
            }
            if (edge.includes("n")) {
                height = start.height - dy;
                top = startBottom - height;
            }

            const nextSize = clampSize(width, height);
            if (edge.includes("w")) left = startRight - nextSize.width;
            if (edge.includes("n")) top = startBottom - nextSize.height;
            const nextPos = clampPosition(left, top, nextSize.width, nextSize.height);
            const next = { ...nextPos, ...nextSize };
            frameRef.current = next;
            const el = windowRef.current;
            if (el) writeFrame(el, next);
        };

        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
            endChrome();
            handle.classList.remove("is-resizing");
            windowRef.current?.classList.remove("is-interacting");
            interactingRef.current = false;
            setFrame(frameRef.current);
            persistFrame(frameRef.current);
        };

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
    }, [isOpen, persistFrame, useFreeGeometry]);

    return createPortal(
        <div className={`floating-chatbot${isDarkMode ? " dark" : ""}`}>
            <div
                ref={windowRef}
                className={`chatbot-window ${isOpen ? "open" : ""}${isMaximized ? " maximized" : ""}`}
                style={useFreeGeometry ? {
                    position: "fixed",
                    left: frame.left,
                    top: frame.top,
                    width: frame.width,
                    height: frame.height,
                    right: "auto",
                    bottom: "auto",
                    maxWidth: "none",
                    maxHeight: "none",
                } : undefined}
            >
                <AgentChatInterface
                    onClose={close}
                    onHeaderPointerDown={useFreeGeometry ? handleHeaderPointerDown : undefined}
                />
                {useFreeGeometry && isOpen && RESIZE_HANDLES.map(({ edge, style }) => (
                    <div
                        key={edge}
                        className="chatbot-resize"
                        role="separator"
                        aria-label={RESIZE_LABEL[edge]}
                        title="Drag to resize"
                        onPointerDown={handleResizeStart(edge)}
                        style={{
                            cursor: RESIZE_CURSOR[edge],
                            zIndex: edge.length === 2 ? 7 : 6,
                            ...style,
                        }}
                    />
                ))}
            </div>

            <button
                className={`chatbot-toggle ${isOpen ? "hidden" : ""}`}
                onClick={() => dispatch(chatSlice.actions.setIsChatbotOpen(true))}
                aria-label="Open chat"
            >
                <RiRobot2Line />
            </button>
        </div>,
        document.body,
    );
};

export default FloatingChatBot;
