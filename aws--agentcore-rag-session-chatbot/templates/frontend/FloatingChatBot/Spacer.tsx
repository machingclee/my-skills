import type { HTMLAttributes } from "react";

export default function Spacer({
    height = 20,
    width = 5,
    inline = false,
    ...props
}: {
    height?: number;
    width?: number;
    inline?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            style={{
                height,
                width,
                minHeight: height,
                userSelect: "none",
                display: inline ? "inline-block" : "block",
            }}
            {...props}
        />
    );
}
