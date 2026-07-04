---
name: frontend--paging-api
description: >-
  Create a paging UI for a React component backed by an RTK Query endpoint that
  accepts {page, limit}. Scaffolds a CustomPagination component built on shadcn
  pagination primitives (Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis) with
  ellipsis logic for large page counts, plus the wiring pattern for consuming a
  paged backend response ({items, total}). Use when adding pagination to any list
  in a React + RTK Query + shadcn project.
---

# Frontend Paging API Scaffold

This skill scaffolds pagination for a React list component: a `CustomPagination`
component using shadcn pagination primitives, and the wiring pattern for
consuming an RTK Query endpoint that returns `{ items, total }`.  Based on the
author's convention from
[Create a Paging API in Spring Boot](https://www.machingclee.com/blog/article/Create-a-Paging-API-in-Spring-Boot).

## Mandatory Trigger

Invoke this skill before writing any pagination UI when the user asks to:

- "add pagination" / "paginate the list" for a React component.
- "create a CustomPagination component" using shadcn.
- "add page controls" / "add page navigation" to a list.
- "wire up pagination" with RTK Query.

## What It Produces

1. **`CustomPagination` component** — a reusable pagination bar with
   Previous/Next, page numbers, ellipsis for large page counts.
2. **Wiring pattern** — how to connect an RTK Query hook to the pagination
   component (`useState` for page, `totalPages` calculation).

## How To Use

### 1. The CustomPagination Component

Create `src/components/common/CustomPagination.tsx` with shadcn pagination
imports:

```tsx
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';

interface CustomPaginationProps {
    consecutivePagesBlockSize: number;
    currentPageIndex: number;
    totalPages: number;
    onPageIndexChange: (page: number) => void;
}

const CustomPagination = ({
    consecutivePagesBlockSize,
    currentPageIndex,
    totalPages,
    onPageIndexChange,
}: CustomPaginationProps) => {
    const availablePageNumbers = Array.from({ length: totalPages }, (_, i) => i);
    const lastPageIndex = totalPages - 1;
    const consecutivePagesBlockStartIndex = Math.max(currentPageIndex - 1, 0);
    const approachesTheEnd =
        lastPageIndex - consecutivePagesBlockStartIndex <= consecutivePagesBlockSize - 1;
    const consecutivePagesBlock = availablePageNumbers.slice(
        approachesTheEnd
            ? lastPageIndex - (consecutivePagesBlockSize - 1)
            : consecutivePagesBlockStartIndex,
        consecutivePagesBlockStartIndex + consecutivePagesBlockSize
    );

    const forceDisplayPageOne = currentPageIndex >= consecutivePagesBlockSize - 1;
    const forceDisplayLast =
        lastPageIndex - currentPageIndex >= consecutivePagesBlockSize - 1;

    if (totalPages <= consecutivePagesBlockSize) {
        return (
            <Pagination>
                <PaginationContent>
                    <PaginationItem>
                        <PaginationPrevious
                            href="#"
                            onClick={() =>
                                onPageIndexChange(Math.max(currentPageIndex - 1, 0))
                            }
                        />
                    </PaginationItem>
                    {availablePageNumbers.map((page) => {
                        const isActive = page === currentPageIndex;
                        return (
                            <PaginationItem
                                key={page}
                                onClick={() => onPageIndexChange(page)}
                            >
                                <PaginationLink href="#" isActive={isActive}>
                                    {page + 1}
                                </PaginationLink>
                            </PaginationItem>
                        );
                    })}
                    <PaginationItem>
                        <PaginationNext
                            href="#"
                            onClick={() =>
                                onPageIndexChange(
                                    Math.min(currentPageIndex + 1, totalPages - 1)
                                )
                            }
                        />
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        );
    }

    return (
        <Pagination>
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        href="#"
                        onClick={() =>
                            onPageIndexChange(Math.max(currentPageIndex - 1, 0))
                        }
                    />
                </PaginationItem>
                {forceDisplayPageOne && (
                    <>
                        <PaginationItem onClick={() => onPageIndexChange(0)}>
                            <PaginationLink href="#" isActive={currentPageIndex === 0}>
                                1
                            </PaginationLink>
                        </PaginationItem>
                        {currentPageIndex >= 3 &&
                            totalPages > consecutivePagesBlockSize + 1 && (
                                <PaginationItem>
                                    <PaginationEllipsis />
                                </PaginationItem>
                            )}
                    </>
                )}
                {consecutivePagesBlock.map((page) => {
                    const isActive = page === currentPageIndex;
                    return (
                        <PaginationItem
                            key={page}
                            onClick={() => onPageIndexChange(page)}
                        >
                            <PaginationLink href="#" isActive={isActive}>
                                {page + 1}
                            </PaginationLink>
                        </PaginationItem>
                    );
                })}
                {lastPageIndex - currentPageIndex >= consecutivePagesBlockSize &&
                    totalPages > consecutivePagesBlockSize + 1 && (
                        <PaginationItem>
                            <PaginationEllipsis />
                        </PaginationItem>
                    )}
                {forceDisplayLast && (
                    <PaginationItem>
                        <PaginationLink
                            href="#"
                            isActive={currentPageIndex === lastPageIndex}
                            onClick={() => onPageIndexChange(lastPageIndex)}
                        >
                            {lastPageIndex + 1}
                        </PaginationLink>
                    </PaginationItem>
                )}
                <PaginationItem>
                    <PaginationNext
                        href="#"
                        onClick={() =>
                            onPageIndexChange(
                                Math.min(currentPageIndex + 1, totalPages - 1)
                            )
                        }
                    />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    );
};

export default CustomPagination;
```

**Props:**
- `consecutivePagesBlockSize` — how many page numbers to show in the middle
  block (e.g. `3` shows 3 consecutive page numbers around the current page).
- `currentPageIndex` — 0-indexed current page.
- `totalPages` — total number of pages.
- `onPageIndexChange` — callback fired when the user clicks a page number or
  navigation arrow.

**Behaviour:**
- When `totalPages <= consecutivePagesBlockSize`, renders all page numbers
  without ellipsis.
- When `totalPages > consecutivePagesBlockSize`, shows: page 1, an ellipsis
  (if needed), the consecutive block around the current page, another ellipsis
  (if needed), and the last page.
- Previous is disabled when on page 0; Next is disabled when on the last page.

### 2. Wiring Pattern (RTK Query)

In your list component, hold the page index in state and wire it to the RTK
Query hook:

```tsx
const LIMIT = 20;

export default function LoggingList() {
    const [page, setPage] = useState(0);
    const { data, isLoading } =
        logsApi.endpoints.getLogs.useQuery({ page, limit: LIMIT });

    const totalPages = Math.ceil((data?.total || 0) / LIMIT);

    return (
        <div>
            {/* ... list rendering of data?.items ... */}

            <CustomPagination
                consecutivePagesBlockSize={3}
                currentPageIndex={page}
                totalPages={totalPages}
                onPageIndexChange={(newPage) => {
                    setPage(newPage);
                }}
            />
        </div>
    );
}
```

**Key points:**
- `page` is **0-indexed** — the backend (Spring Data `PageRequest`) expects
  page 0 for the first page.
- `totalPages` is computed from `data.total / LIMIT` — the backend returns the
  total count of all matching rows, not just the current page.
- `setPage` triggers a re-fetch — RTK Query sees the new `{ page, limit }` args
  and automatically re-queries.
- Keep the `useState` for page inside the component, not in Redux — page state
  is local UI state, not shared app state.

### 3. RTK Query Endpoint Shape

The backend should return a response shaped like:

```typescript
interface PagedResponse<T> {
    items: T[];   // the items for the current page
    total: number; // total count across all pages
}
```

The endpoint definition in the api slice:

```typescript
getLogs: builder.query<PagedResponse<LogEntry>, { page: number; limit: number }>({
    query: ({ page, limit }) => `/logs?page=${page}&limit=${limit}`,
}),
```

## Dependencies

Requires shadcn pagination components installed:
- `@/components/ui/pagination` — install via `npx shadcn@latest add pagination`

## Verify

- Render the component with `totalPages: 5` and confirm all 5 pages show
  without ellipsis.
- Render with `totalPages: 20` and a middle page selected — confirm ellipsis
  appear and page 1 + last page are always reachable.
- Click Next/Previous and confirm `onPageIndexChange` fires with the correct
  index.
- Confirm the RTK Query hook re-fetches when `page` state changes.
