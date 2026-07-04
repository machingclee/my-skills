import React from "react";
import { defaultAnimateLayoutChanges, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import DragHandle from "./DragHandle";

/**
 * One row in a vertical sortable list.
 *
 * Carries this codebase's three non-obvious conventions:
 *   1. A dedicated LEFT-SIDE GripVertical drag handle (DragHandle.tsx). Because
 *      the handle is the only activator, the parent DndContext's PointerSensor
 *      needs NO activationConstraint — pointerdown on the handle starts the drag.
 *   2. Animation suppression: `animateLayoutChanges` returns false while
 *      sorting / just-dragged, and `transition: transform ? "none" : transition`
 *      kills the mid-drag tween. Together these stop the list flickering.
 *   3. The dragged source collapses to `opacity: 0` (keeps its layout slot) so
 *      only the DragOverlay float is visible.
 *
 * Pass the row's visible content as `children` — it renders in the `flex-1`
 * slot to the right of the handle. The `item` is also stashed on the sortable's
 * `data` payload so `onDragEnd` can read `active.data.current?.item`.
 *
 * Canonical source: SortableScriptItem.tsx.
 */
export interface Item {
    id: string | number;
}

export default function SortableItem({ item, children }: { item: Item; children: React.ReactNode }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: item.id,
        data: { type: "item", item }, // onDragEnd reads active.data.current?.type / .item
        animateLayoutChanges: (args) => {
            const { isSorting, wasDragging } = args;
            if (isSorting || wasDragging) return false;
            return defaultAnimateLayoutChanges(args);
        },
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition: transform ? "none" : transition,
        opacity: isDragging ? 0 : 1,
        width: "100%",
        touchAction: "none", // vertical only — stops the page scrolling under the drag
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} className="flex items-center gap-2 w-full">
            <DragHandle listeners={listeners} setActivatorNodeRef={setActivatorNodeRef} />
            <div className="flex-1">{children}</div>
        </div>
    );
}
