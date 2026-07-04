---
name: spring--paging-api
description: >-
  Scaffold a paging API for a Spring Boot entity using Spring Data's Page<Entity>
  and Pageable. Creates a repository method returning Page, a wrapper DTO with
  list + total, and a service/controller that accepts page & limit params. Use when
  adding pagination to a Spring Boot REST endpoint, creating a paged query for any
  entity, or wrapping a CrudRepository method with Pageable.
---

# Spring Boot Paging API Scaffold

This skill scaffolds a paging API for any JPA entity: a repository query returning
`Page<Entity>`, a wrapper DTO holding `List<EntityDTO> + total`, and the service
layer that wires them together.  Based on the author's convention from
[Create a Paging API in Spring Boot](https://www.machingclee.com/blog/article/Create-a-Paging-API-in-Spring-Boot).

## Mandatory Trigger

Invoke this skill before writing any paging code when the user asks to:

- "create a paging API" / "add pagination to a Spring Boot endpoint".
- "return Page<Entity> from a CrudRepository".
- "page an entity list" / "paginate [Entity]".
- "create a paged endpoint" following this project's convention.

## What It Produces

For an entity `Event` (replace with the user's entity):

1. **Repository** — a method accepting `Pageable` and returning `Page<Event>`.
2. **Wrapper DTO** — `EventsWithTotal(events: List<EventDTO>, total: Long)`.
3. **Service method** — creates a `PageRequest.of(page, limit)`, calls the
   repository, and maps results into the wrapper DTO.

## How To Use

### 1. Repository

Add a method that returns `Page<Entity>` and accepts `Pageable`:

```java
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;

interface EventRepository : CrudRepository<Event, Integer> {
    @Query("""
        select e from Event e
        order by e.createdAt desc
    """)
    fun findByPageAndLimit(pageable: Pageable): Page<Event>
}
```

- The `@Query` is optional — Spring Data derives the count query automatically
  for `Page` return types when using a custom query.
- Always include an `ORDER BY` so pagination is deterministic.
- Use the entity name (capitalised) in the JPQL query, not the table name.

### 2. Wrapper DTO

Create a simple data class that bundles the paged list with the total count:

```java
data class EventsWithTotal(
    val events: List<EventDTO>,
    val total: Long
)
```

- **`events`** — the list of DTOs for the current page (*not* the full entity
  list).  The frontend needs the DTO projection, not raw entities.
- **`total`** — the total number of matching rows across all pages.  The frontend
  uses this to calculate the number of pages (`Math.ceil(total / limit)`).

### 3. Service

Wire the repository and wrapper together:

```java
import org.springframework.data.domain.PageRequest;

@Service
class EventQueryApplicationService(
    private val eventRepository: EventRepository
) {
    fun getEvents(page: Int, limit: Int): EventsWithTotal {
        val pageable = PageRequest.of(page, limit)
        val eventPage = eventRepository.findByPageAndLimit(pageable)
        return EventsWithTotal(
            events = eventPage.content.map { it.toDTO() },
            total = eventPage.totalElements
        )
    }
}
```

Key points:
- `PageRequest.of(page, limit)` — `page` is **0-indexed** (page 0 = first page).
- `eventPage.content` — the list of entities for the requested page.
- `eventPage.totalElements` — the count of *all* matching rows (not just this
  page).  This is what the frontend uses to render "Page X of Y".
- Map entities to DTOs **inside the service**, not in the controller.  The
  controller receives `EventsWithTotal` ready to serialise.

### 4. Controller (expose it)

```java
@RestController
@RequestMapping("/events")
class EventController(
    private val eventQueryService: EventQueryApplicationService
) {
    @GetMapping
    fun getEvents(
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "20") limit: Int
    ): ResponseEntity<EventsWithTotal> {
        return ResponseEntity.ok(eventQueryService.getEvents(page, limit))
    }
}
```

- `page` defaults to `0` (first page); `limit` defaults to a sensible value
  like `20`.
- The frontend calls `GET /events?page=0&limit=20`, then `?page=1&limit=20`,
  etc.

## Notes

- **Page is 0-indexed.** Spring Data `PageRequest` uses 0-based page numbers.
  Make sure the frontend sends `page: 0` for the first page.
- **Sort direction** is fixed in the query.  If the user needs dynamic sorting,
  accept a `Sort` parameter and pass it to `PageRequest.of(page, limit, sort)`.
- **Count query.** Spring Data automatically derives a count query from the
  JPQL.  If performance is a concern for large tables, provide an explicit
  `countQuery` in the `@Query` annotation.
- **No extra dependency.**  `spring-data-jpa` (or `spring-data-jdbc`) already
  includes `Page`, `Pageable`, and `PageRequest`.

## Verify

- Call the endpoint with `?page=0&limit=5` and confirm the response includes
  both `events` (≤5 items) and `total` (the full count).
- Call with `?page=1&limit=5` and confirm the next page of items is returned.
- Confirm `total` stays constant across page changes.
