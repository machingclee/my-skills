import React, { useState, useRef } from "react";

interface ResizableImageProps {
    src: string;
    alt: string;
    initialWidth?: number;
    onWidthChange?: (width: number) => void;
}

function ResizableImage({
    src,
    alt,
    initialWidth,
    onWidthChange,
}: ResizableImageProps) {
    const [width, setWidth] = useState<number | undefined>(initialWidth);
    const [hovered, setHovered] = useState(false);
    const startRef = useRef<{ x: number; w: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const onHandleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const currentW =
            width ?? containerRef.current?.getBoundingClientRect().width ?? 300;
        startRef.current = { x: e.clientX, w: currentW };

        const calcDelta = (ev: MouseEvent) =>
            ev.clientX - startRef.current!.x - (ev.clientY - e.clientY);

        const onMove = (ev: MouseEvent) => {
            if (!startRef.current) return;
            setWidth(
                Math.max(50, Math.round(startRef.current.w + calcDelta(ev))),
            );
        };
        const onUp = (ev: MouseEvent) => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            if (!startRef.current) return;
            const finalW = Math.max(
                50,
                Math.round(startRef.current.w + calcDelta(ev)),
            );
            startRef.current = null;
            onWidthChange?.(finalW);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    return (
        <div
            ref={containerRef}
            style={{
                position: "relative",
                display: "inline-block",
                width: width ? `${width}px` : "100%",
                maxWidth: "100%",
                borderRadius: "4px",
                outline: hovered
                    ? "3px solid #3e6df1"
                    : "3px solid transparent",
                transition: "outline-color 0.15s",
                cursor: hovered ? "nesw-resize" : undefined,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onMouseDown={onHandleMouseDown}
            title={hovered ? "Drag to resize" : undefined}
        >
            <img
                src={src}
                alt={alt}
                style={{
                    display: "block",
                    width: "100%",
                    borderRadius: "4px",
                }}
                draggable={false}
            />
        </div>
    );
}

export default ResizableImage;
