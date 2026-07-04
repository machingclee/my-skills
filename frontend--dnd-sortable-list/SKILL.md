---
name: frontend--dnd-sortable-list
description: >-
  Create a drag-and-drop sortable list using @dnd-kit/core + @dnd-kit/sortable
  that follows this author's established conventions: a dedicated left-side
  GripVertical drag handle on every item, optional DragOverlay for a smooth
  floating preview, the two-sensor setup (Pointer + Keyboard), animation
  suppression to kill flicker, and a data.type-discriminated onDragEnd handler.
  Use when adding drag-and-drop reordering to any list of items — vertical or
  horizontal, single-container or cross-container.
---

# Create a dnd-kit Sortable List

This skill scaffolds a drag-and-drop sortable list that matches the conventions
used across this author's React apps (see the canonical examples in
`shell-script-manager-tauri`: `TabBar.tsx`, `SortableScriptItem.tsx`,
`SortableFolderItem.tsx`, `FolderColumn.tsx`). It is organised around the same
mental model as the author's blog article on Dnd-Kit:

1. **Orchestration of components** — how `DndContext` / `SortableContext` / the
   items / `DragOverlay` nest.
2. **Standard props for `DndContext`** — `sensors`, `collisionDetection`,
   `onDragStart`, `onDragEnd`.
3. **Data for dragging logic** — the `data.type` payload each sortable carries,
   which `onDragEnd` reads to decide what mutation to fire.

## Mandatory Trigger

Invoke this skill when the user asks to:

- "add drag and drop" / "make this list sortable" / "add reordering" to a list.
- "add a drag handle" / "grip handle" to list items.
- "add a DragOverlay" / "smooth drag preview" to an existing sortable list.
- "reorder tabs/folders/items/rows via drag".

## What It Produces

Three files, adapted to the target list's data shape:

```
<target-dir>/
├── SortableList.tsx     # DndContext + sensors + SortableContext + DragOverlay + onDragEnd
├── SortableItem.tsx     # useSortable item with the left-side GripVertical handle
└── DragHandle.tsx       # the reusable activator (cursor-grab GripVertical)
```

Copy the templates from `templates/` in this skill folder, then specialise the
four things that are always list-specific (see **How To Use** below).

## The Three-Part Mental Model

### 1. Orchestration of components

One `DndContext` owns a drag operation. Inside it live one or more
`SortableContext`s (one per reorderable group), and a single `DragOverlay` as a
sibling (NOT inside a `SortableContext`). The overlay floats the preview; the
item being dragged collapses to `opacity: 0` so only the overlay shows.

```
<DndContext sensors collisionDetection onDragStart onDragEnd>
  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
    {items.map(item => <SortableItem key={item.id} item={item} />)}
  </SortableContext>

  <DragOverlay>                         {/* optional, sibling of SortableContext */}
    {activeItem ? <ItemPreview item={activeItem} /> : null}
  </DragOverlay>
</DndContext>
```

Rules:

- **One `DndContext` per independent drag surface.** Two lists that never share
  dragged items get two `DndContext`s. Lists that exchange items (e.g. drag a
  folder into a workspace) share ONE `DndContext` wrapping both
  `SortableContext`s, with a custom `collisionDetection` to route drops.
- **`SortableContext.items` is an array of IDs** (strings or numbers), in the
  same order the children render. The IDs must match what each item passes to
  `useSortable({ id })`.
- **`DragOverlay` renders the real item component** (wrapped in an overlay shell),
  not a hand-written twin. This keeps the preview pixel-identical to the source.
  `TabBar.tsx` is the one exception — it renders a lighter clone with
  `dropAnimation={null}`.
- **No `createPortal`.** The overlay renders inline within its `DndContext`.

### 2. Standard props for `DndContext`

#### `sensors` — always PointerSensor + KeyboardSensor

Two variants, picked by whether items have a dedicated drag handle:

```ts
// (a) Items HAVE a dedicated left-side GripVertical handle.
//     The handle is the only drag activator, so no activationConstraint is
//     needed — a pointerdown on the handle starts the drag immediately.
const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);

// (b) Items do NOT have a handle (the whole row is the activator, e.g. tabs).
//     Require a small drag distance so a click is not mistaken for a drag.
const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
```

`distance: 10` is also fine for whole-row activation on taller rows. The
author's rule of thumb: **handle → no constraint; whole-row → distance 5–10.**

#### `collisionDetection` — `closestCenter` for one list, custom for cross-container

- **Single list, reorder only** → `closestCenter` (see `TabBar.tsx`).
- **Cross-container / move-into-folder** → write a custom `CollisionDetection`
  that starts from `pointerWithin` + `rectIntersection` and filters collisions
  by ID prefix / `data.type` so the right drop target wins (see
  `FolderColumn.tsx`'s `customFolderWorkspaceDetection` and
  `ScriptsColumn.tsx`'s `customCollisionDetection`). This is only needed when one
  drag can mean several different things (reorder vs. move vs. remove).

#### `onDragStart` — stash the active item for the overlay

Set local `activeId` / `activeItem` state so `DragOverlay` knows what to render.
If the project has a global "is reordering" flag (see **Conventions** below),
flip it on here.

```ts
const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
    // dispatch(setIsReordering(true));  // if using the global flag
};
```

#### `onDragEnd` — the only place mutations happen

Read `active` and `over`, guard the no-op cases, then fire the reorder. Two
flavours:

```ts
// Portable: client-side arrayMove, hand the new order to a callback.
const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) { setActiveId(null); return; }
    setItems((items) => {
        const from = items.findIndex((i) => i.id === active.id);
        const to = items.findIndex((i) => i.id === over.id);
        if (from === -1 || to === -1) return items;
        return arrayMove(items, from, to);
    });
    setActiveId(null);
};
```

```ts
// This author's apps: delegate to a backend mutation (RTK Query endpoint),
// rely on cache re-fetch. No client-side arrayMove. See FolderColumn.tsx.
const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) { setActiveId(null); return; }
    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;
    // switch on activeType × overType, call the matching reorderXxx endpoint
    setActiveId(null);
};
```

Always clear `activeId` at the end (and flip the reordering flag off).

### 3. Data for dragging logic

Every `useSortable` / `useDroppable` carries a `data` payload. The convention is
to put a discriminating `type` on it so `onDragEnd` can switch on intent:

```ts
useSortable({ id: item.id, data: { type: "item", item } });
//                                    ^^^^^^^^^^^^  onDragEnd reads active.data.current?.type
```

- For a single reorderable list, `type` can be a single constant — you mostly
  just need `active.id` / `over.id`.
- For cross-container drags, give each role a distinct `type` (an enum like
  `CollisionType { ROOT_FOLDER, WORKSPACE, ... }`, or raw strings
  `"script"` / `"folder"`). `onDragEnd` then branches on the
  `activeType × overType` pair.
- **Sortable + droppable on the same node** (e.g. a folder that is itself
  reorderable AND a drop target for scripts): register TWO ids with different
  prefixes — the plain id for `useSortable`, a prefixed id
  (`folder-droppable-${id}`) for `useDroppable` — and merge the refs:

  ```ts
  const sortable = useSortable({ id: folder.id, data: { type: "folder", folder } });
  const droppable = useDroppable({ id: `folder-droppable-${folder.id}`, data: { type: "folder", folder } });
  const combinedRef = (node: HTMLElement | null) => {
      sortable.setNodeRef(node);
      droppable.setNodeRef(node);
  };
  ```

## The Drag Handle (the author's signature idiom)

Every vertical sortable item has a `GripVertical` handle pinned to its left edge.
The handle — and ONLY the handle — receives `setActivatorNodeRef` + `{...listeners}`,
so the rest of the row stays free for clicks/selection. This exact markup is
extracted into `templates/DragHandle.tsx`; the gist:

```tsx
<div
    ref={setActivatorNodeRef}
    {...listeners}
    className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-200 flex-shrink-0 dark:hover:bg-neutral-700"
    onClick={(e) => e.stopPropagation()}   {/* don't fire the row's click on handle click */}
>
    <GripVertical className="w-4 h-4" />
</div>
```

Notes:

- `onClick={e => e.stopPropagation()}` on the handle is mandatory whenever the
  row itself has an `onClick` (select / expand), otherwise dragging also selects.
- `flex-shrink-0` + first-child positioning keeps the handle pinned left inside
  a `flex items-center` row.
- The horizontal exception (`TabBar.tsx`) spreads `attributes` + `listeners` on
  the WHOLE pill (no handle) and puts `cursor-grab active:cursor-grabbing` on the
  pill root. Use this only for compact horizontal bars where a handle would
  waste space.

## Animation suppression (kill the flicker)

Vertical sortable items in this codebase suppress dnd-kit's default layout
animation so the list doesn't twitch while dragging. Two parts, both required:

```ts
const sortable = useSortable({
    id: item.id,
    data: { type: "item", item },
    animateLayoutChanges: (args) => {
        const { isSorting, wasDragging } = args;
        if (isSorting || wasDragging) return false;   // no anim while sorting / just dragged
        return defaultAnimateLayoutChanges(args);
    },
});

const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transform ? "none" : transition,      // no transition mid-transform
    opacity: isDragging ? 0 : 1,                        // source slot hides; overlay floats
    width: "100%",
    touchAction: "none",                               // vertical only — stops page scroll stealing the drag
};
```

`touchAction: "none"` goes on vertical items; omit it on horizontal lists.

## Conventions specific to this author's apps

Carry these over when the target project is one of this author's React + RTK
Query apps (e.g. `shell-script-manager-tauri`):

- **Reordering goes through the backend.** No client-side `arrayMove`. Call the
  matching RTK Query `reorderXxx` endpoint and let the cache re-fetch. (The
  `SortableList.tsx` template ships the `arrayMove` version for portability; swap
  it for a mutation when wiring into these apps.)
- **Global `isReorderingFolder` flag.** The `folder` slice holds a boolean,
  flipped on in `onDragStart` and off in `onDragEnd`. Sortable items read it via
  `useAppSelector((s) => s.folder.isReorderingFolder)` and switch to
  `bg-transparent hover:bg-transparent` while a drag is in flight, so the
  selection/hover highlight doesn't flash on every item the pointer crosses.
- **`CollisionType` enum** (`src/types/dto.ts`) is the left column's type
  vocabulary; the scripts column uses raw `"script"` / `"folder"` strings. Pick
  one per `DndContext` and stay consistent within it.
- **Import RTK Query hooks via `.endpoints`**, never destructure hook names off
  the api object (matches the `setup-rtk` skill).
- **Sortable IDs are prefixed strings** when collision detection needs to tell
  roles apart: `workspace-${id}`, `folder-${id}`, `workspace-folder-${wsId}-${id}`.
  For a single flat list, plain ids are fine.

## How To Use

1. Read the three templates under `templates/` in this skill folder.
2. Pick orientation: vertical → `verticalListSortingStrategy` + handle +
   `touchAction:"none"`; horizontal → `horizontalListSortingStrategy` +
   whole-row activator (see `TabBar.tsx`).
3. Specialise the four list-specific things:
   - **The item type** — replace `Item` / `item.id` with the target's type and id.
   - **The id getter** — `SortableContext.items` and `useSortable({ id })` must
     agree. Use plain ids for a flat list; prefixed string ids for cross-container.
   - **`onDragEnd`** — `arrayMove` + callback (portable) OR an RTK Query
     `reorderXxx` mutation (this author's apps).
   - **`DragOverlay` content** — render the real item component inside the
     `opacity-80 cursor-grabbing` overlay shell, gated on `activeId`.
4. Decide on collision detection: `closestCenter` for one list; a custom
   `CollisionDetection` only when a drag can mean reorder-OR-move-OR-remove.
5. Keep the sensors, the handle markup, and the animation-suppression block
   verbatim — they are the parts that must stay consistent across the codebase.

## Wiring Notes (tell the user once)

- The `DragOverlay`'s child only renders when there is an active item; otherwise
  render `null`. dnd-kit handles positioning.
- The dragged source item sets `opacity: 0` (NOT `display: none`) so it still
  occupies layout space and the list doesn't collapse during the drag.
- If a row has interactive children (buttons, links), give them
  `onPointerDown={e => e.stopPropagation()}` so they don't start a drag — see
  the close button in `TabBar.tsx`.
- For "drop into empty zone" behaviour (e.g. remove-from-workspace), wrap an
  empty `useDroppable` area alongside the `SortableContext` and highlight it via
  its `isOver` state (see `RootFoldersDroppableArea.tsx`).

## Dependencies

Requires these in the project's `package.json`:

```json
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2"
```

`@dnd-kit/modifiers` is NOT used in this codebase (no `restrictTo*` scrolling
modifiers) — `touchAction: "none"` on vertical items is used instead.

The drag handle uses `GripVertical` from `lucide-react`. Class merging uses the
project's `cn` helper (`@/lib/utils`); swap for `clsx`/`classnames` if absent.
