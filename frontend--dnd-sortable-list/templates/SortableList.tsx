import React, { useState } from "react";
import {
    DndContext,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import SortableItem, { type Item } from "./SortableItem";

/**
 * A complete vertical sortable list with a smooth DragOverlay.
 *
 * Orchestration (the blog's part 1):
 *   <DndContext>                 owns the drag; one per independent surface
 *     <SortableContext>          one per reorderable group; items = ids in render order
 *       <SortableItem/>          each row, with its left-side GripVertical handle
 *     <DragOverlay>              SIBLING of SortableContext; floats the preview
 *
 * Standard props (the blog's part 2): sensors, collisionDetection, onDragStart,
 * onDragEnd — see SKILL.md for the cross-container / custom-collision variants.
 *
 * This template uses CLIENT-SIDE `arrayMove` + an `onReorder` callback so it is
 * portable. In this author's RTK Query apps, replace the body of `handleDragEnd`
 * with a `reorderXxx` backend mutation and read `items` from the query cache
 * instead of local state. See SKILL.md "Conventions".
 *
 * Canonical source: TabBar.tsx (cleanest end-to-end example).
 */
export default function SortableList({
    items: initialItems,
    onReorder,
    renderItem,
    renderOverlay,
}: {
    items: Item[];
    onReorder?: (next: Item[]) => void;
    /** Render the row's real content for item `i`. */
    renderItem: (i: Item) => React.ReactNode;
    /** Render the floating preview. Defaults to `renderItem`. */
    renderOverlay?: (i: Item) => React.ReactNode;
}) {
    const [items, setItems] = useState<Item[]>(initialItems);
    const [activeId, setActiveId] = useState<string | number | null>(null);

    // Handle present → no activationConstraint (pointerdown on handle starts drag).
    // Whole-row activation instead? Add `{ activationConstraint: { distance: 5 } }`.
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const activeItem = activeId !== null ? items.find((i) => i.id === activeId) ?? null : null;

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string | number);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        // No-op: dropped nowhere, or back on itself.
        if (!over || active.id === over.id) return;

        setItems((prev) => {
            const from = prev.findIndex((i) => i.id === active.id);
            const to = prev.findIndex((i) => i.id === over.id);
            if (from === -1 || to === -1) return prev;
            const next = arrayMove(prev, from, to);
            onReorder?.(next);
            return next;
        });
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter} // single list → closestCenter; cross-container → custom
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                    {items.map((i) => (
                        <SortableItem key={i.id} item={i}>
                            {renderItem(i)}
                        </SortableItem>
                    ))}
                </div>
            </SortableContext>

            <DragOverlay>
                {activeItem ? (
                    <div className="opacity-80 cursor-grabbing">
                        {(renderOverlay ?? renderItem)(activeItem)}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
