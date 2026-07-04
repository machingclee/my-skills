import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// Matches @dnd-kit's SyntheticListenerMap (Record<string, Function>), which is
// not re-exported from the top-level @dnd-kit/core entry — so we type it locally
// to avoid a fragile deep import.
type ListenerMap = Record<string, Function> | undefined;

/**
 * The signature drag handle for a sortable item: a GripVertical icon pinned to
 * the LEFT edge of the row. Only this element receives the sortable's
 * `setActivatorNodeRef` + `listeners`, so the rest of the row stays free for
 * clicks / selection / context menus.
 *
 * Pass through the `listeners` and `setActivatorNodeRef` returned by
 * `useSortable(...)`. `onClick` is stopped so dragging does not also trigger the
 * row's own click handler.
 *
 * Canonical source: SortableScriptItem.tsx / SortableFolderItem.tsx.
 */
export default function DragHandle({
    listeners,
    setActivatorNodeRef,
    className,
    iconClassName = "w-4 h-4",
}: {
    listeners: ListenerMap;
    setActivatorNodeRef: (node: HTMLElement | null) => void;
    className?: string;
    iconClassName?: string;
}) {
    return (
        <div
            ref={setActivatorNodeRef}
            {...listeners}
            className={cn(
                "cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-200 flex-shrink-0 dark:hover:bg-neutral-700",
                className,
            )}
            onClick={(e) => e.stopPropagation()}
        >
            <GripVertical className={iconClassName} />
        </div>
    );
}
