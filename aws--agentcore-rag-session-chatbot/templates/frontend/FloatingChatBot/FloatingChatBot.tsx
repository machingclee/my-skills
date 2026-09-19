import React, { useCallback, useEffect, useRef, useState } from "react";
import "./FloatingChatBot.scss";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import chatSlice from "@/redux/slices/chatSlice";
import AgentChatInterface from "./AgentChatInterface";
import { RiRobot2Line } from "react-icons/ri";

const DEFAULT_WIDTH = 650;
const MIN_WIDTH = 360;
const MAX_WIDTH_VIEWPORT_PAD = 40;

const DEFAULT_HEIGHT = 900;
const MIN_HEIGHT = 400;
const MAX_HEIGHT_VIEWPORT_PAD = 100;

const FloatingChatBot: React.FC = () => {
    const dispatch = useAppDispatch();
    const isDarkMode = useAppSelector(state => state.theme.mode === "dark");
    const isOpen = useAppSelector(state => state.chat.isChatbotOpen);
    const storedWidth = useAppSelector(state => state.chat.chatbotWidth);
    const storedHeight = useAppSelector(state => state.chat.chatbotHeight);
    const isMaximized = useAppSelector(state => !!state.chat.chatbotMaximized);
    const [width, setWidth] = useState(() =>
        storedWidth && storedWidth >= MIN_WIDTH ? storedWidth : DEFAULT_WIDTH
    );
    const [height, setHeight] = useState(() => {
        const h = storedHeight && storedHeight >= MIN_HEIGHT ? storedHeight : DEFAULT_HEIGHT;
        const max = Math.max(MIN_HEIGHT, window.innerHeight - MAX_HEIGHT_VIEWPORT_PAD);
        return Math.min(max, Math.max(MIN_HEIGHT, Math.round(h)));
    });
    const [resizeAxis, setResizeAxis] = useState<'width' | 'height' | null>(null);
    const widthRef = useRef(width);
    widthRef.current = width;
    const heightRef = useRef(height);
    heightRef.current = height;
    const savedSizeRef = useRef<{ width: number; height: number } | null>(null);

    const close = useCallback(() => {
        dispatch(chatSlice.actions.setIsChatbotOpen(false));
    }, [dispatch]);

    const clampWidth = useCallback((w: number) => {
        const max = Math.max(MIN_WIDTH, window.innerWidth - MAX_WIDTH_VIEWPORT_PAD);
        return Math.min(max, Math.max(MIN_WIDTH, Math.round(w)));
    }, []);

    const clampHeight = useCallback((h: number) => {
        // Window is bottom-anchored; keep its top edge inside the viewport.
        const max = Math.max(MIN_HEIGHT, window.innerHeight - MAX_HEIGHT_VIEWPORT_PAD);
        return Math.min(max, Math.max(MIN_HEIGHT, Math.round(h)));
    }, []);

    const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!isOpen) return;
        e.preventDefault();
        e.stopPropagation();

        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);

        const startX = e.clientX;
        const startWidth = widthRef.current;
        setResizeAxis('width');
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";

        const onMove = (ev: PointerEvent) => {
            // Window is right-anchored: dragging the left edge leftward widens the panel.
            const next = clampWidth(startWidth + (startX - ev.clientX));
            setWidth(next);
        };

        const onUp = (ev: PointerEvent) => {
            handle.releasePointerCapture(ev.pointerId);
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            handle.removeEventListener("pointercancel", onUp);
            setResizeAxis(null);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            dispatch(chatSlice.actions.setChatbotWidth(widthRef.current));
        };

        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
    }, [clampWidth, isOpen]);

    const onResizePointerDownVertical = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!isOpen) return;
        e.preventDefault();
        e.stopPropagation();

        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);

        const startY = e.clientY;
        const startHeight = heightRef.current;
        setResizeAxis('height');
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";

        const onMove = (ev: PointerEvent) => {
            // Window is bottom-anchored: dragging the top edge upward heightens the panel.
            const next = clampHeight(startHeight + (startY - ev.clientY));
            setHeight(next);
        };

        const onUp = (ev: PointerEvent) => {
            handle.releasePointerCapture(ev.pointerId);
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            handle.removeEventListener("pointercancel", onUp);
            setResizeAxis(null);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            dispatch(chatSlice.actions.setChatbotHeight(heightRef.current));
        };

        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
    }, [clampHeight, isOpen]);

    // Keep width/height within viewport on resize
    useEffect(() => {
        const onWindowResize = () => {
            setWidth((w) => clampWidth(w));
            setHeight((h) => clampHeight(h));
        };
        window.addEventListener("resize", onWindowResize);
        return () => window.removeEventListener("resize", onWindowResize);
    }, [clampWidth, clampHeight]);

    // Remember the pre-maximize size so restoring returns to it; apply on restore.
    const wasMaximizedRef = useRef(isMaximized);
    useEffect(() => {
        if (isMaximized && !wasMaximizedRef.current) {
            savedSizeRef.current = { width: widthRef.current, height: heightRef.current };
        } else if (!isMaximized && wasMaximizedRef.current) {
            const saved = savedSizeRef.current;
            if (saved) {
                setWidth(clampWidth(saved.width));
                setHeight(clampHeight(saved.height));
            }
            savedSizeRef.current = null;
        }
        wasMaximizedRef.current = isMaximized;
    }, [isMaximized, clampWidth, clampHeight]);

    return (
        <div
            className={`floating-chatbot${isDarkMode ? " dark" : ""}${resizeAxis ? " resizing" : ""}`}>
            <div
                className={`chatbot-window ${isOpen ? "open" : ""}${isMaximized ? " maximized" : ""}`}
                style={isOpen && !isMaximized ? { width, height, maxHeight: "none" } : undefined}
            >
                <div
                    className={`chatbot-resize-handle chatbot-resize-handle--top${resizeAxis === "height" ? " active" : ""}`}
                    onPointerDown={onResizePointerDownVertical}
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize chat panel height"
                    title="Drag to resize height"
                >
                    <div className="chatbot-resize-grip" aria-hidden="true" />
                </div>
                <div
                    className={`chatbot-resize-handle${resizeAxis === "width" ? " active" : ""}`}
                    onPointerDown={onResizePointerDown}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize chat panel"
                    title="Drag to resize"
                >
                    <div className="chatbot-resize-grip" aria-hidden="true" />
                </div>
                <AgentChatInterface onClose={close} />
            </div>

            <button
                className={`chatbot-toggle ${isOpen ? "hidden" : ""}`}
                onClick={() => dispatch(chatSlice.actions.setIsChatbotOpen(true))}
                aria-label="Open chat"
            >
                {/* <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg> */}
                <RiRobot2Line />
            </button>
        </div>
    );
};

export default FloatingChatBot;
