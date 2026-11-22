---
name: express--cqrs
description: >-
  Set up and extend an Express application that uses the @machingclee/express-cqrs package.
  Covers installing the package when it is missing, wiring the runtime with
  createCqrs/initializeCqrs, attachCqrs and registerEventStorming, getting the
  command-flow visualization page and its graph endpoints, and adding a Command,
  Command Handler, Domain Event, Query, Query Handler, Policy reaction, Service,
  audit repository, route and component-list entry. Use when the user asks to add a
  write endpoint or business action that goes through the CommandBus, add a domain
  event or a policy listener, add a read query, wire handlers into the module, or set
  the package up in a new Express app.
---

# Build Features With @machingclee/express-cqrs

The package is a small CQRS runtime: decorated classes are registered in an explicit component list, a `CommandBus` runs one command handler inside one transaction, handler-emitted domain events reach policies, and the decorators also build a command-flow graph that the package serves as JSON and as a static HTML diagram.

Read the host project first. This skill describes the package contract, but the host decides folder names, DI tokens, validation and error mapping.

## When To Use

- Adding a write endpoint or a business action that must run in a transaction.
- Adding a domain event, a policy reaction, a read query, or a service that handlers inject.
- Wiring a new or existing Express app to the package, including the diagram page.
- The project imports `@machingclee/express-cqrs` but something is not registered or does not appear in the graph.

## Step 1: Confirm Or Install The Package

The package is `@machingclee/express-cqrs`. Check the manifest before writing any code.

```bash
grep '"@machingclee/express-cqrs"' package.json
```

When it is absent, install it with the package manager the lockfile already uses.

```bash
npm install @machingclee/express-cqrs          # package-lock.json
pnpm add @machingclee/express-cqrs             # pnpm-lock.yaml
yarn add @machingclee/express-cqrs             # yarn.lock
bun add @machingclee/express-cqrs              # bun.lock / bun.lockb
```

Then confirm the import resolves and the installed version is the one expected.

```bash
node -e "console.log(require('@machingclee/express-cqrs/package.json').version)"
```

When the install fails with `E404`, ask the registry directly instead of trusting the local cache, because a broken `~/.npm` cache can make `npm view` report stale data:

```bash
curl -s "https://registry.npmjs.org/@machingclee%2Fexpress-cqrs" | head -c 200
```

A response with no `versions` and an `unpublished` entry means the package name is not installable. A whole-package unpublish also freezes the name for 24 hours, so the host either points its manifest at a local checkout or waits out the window before publishing again.

If the manifest still lists the unscoped `express-prisma-cqrs`, that is the same package under its earlier name. Install `@machingclee/express-cqrs` and update the imports; the API is unchanged.

A scoped package is private to its scope unless the first publish passes `--access public`, so a maintainer publishing for the first time runs `npm publish --access public`.

The package depends on `express` 5, `zod` 4 and `swagger-ui-express`, so a host that already uses Express 4 must upgrade to Express 5 rather than pinning a second copy. Decorators are the TC39 form: use TypeScript 5 or newer with a `target` of `ES2022` or later and do not enable `experimentalDecorators`.

## Step 2: Wire The Runtime

Two entry points exist. Use `createCqrs` when the process has one runtime and the caller keeps the returned module. Use `initializeCqrs` when the package's own routes must reach the module later, because it also stores the module as the process singleton that `attachCqrs()` and `registerEventStorming()` read.

```ts
import express from "express";
import {
  attachCqrs,
  initializeCqrs,
  registerEventStorming,
} from "@machingclee/express-cqrs";
import { APP_COMPONENTS } from "./components.ts";

const app = express();
app.use(express.json());

initializeCqrs({
  components: APP_COMPONENTS,
  auditEventRepository: new PrismaAuditRepository(prisma),   // optional
  transactionRunner: new PrismaUnitOfWork(prisma),            // optional
  configure: (container) => {
    container.registerValue(PrismaUnitOfWork, unitOfWork);
  },
});

app.use(attachCqrs());
registerEventStorming(app);

app.listen(3000);
```

The options are:

| Option | Required | Effect |
| --- | --- | --- |
| `components` | yes | every decorated handler, policy and service class |
| `auditEventRepository` | no | one `save(batch)` method; omit to discard audit rows |
| `transactionRunner` | no | opens one transaction per top-level command; omit and commands run unwrapped |
| `configure` | no | registers app providers that handlers inject |
| `strictDomainTypes` | no | defaults to `true`; require `@Actor` or `@BoundedContext` on commands, queries and events |

`attachCqrs(cqrs)` also accepts the module explicitly, or a function that returns it, which is the form to use in tests and in apps that build several modules.

What the runtime adds:

| Piece | What it gives |
| --- | --- |
| `attachCqrs()` | `req.commandBus`, `req.queryBus`, a per-request context and the `X-Request-Id` response header |
| `registerEventStorming(app)` | `GET /event-storming/` (static diagram), `GET /docs/commands` (graph JSON), `GET /docs/command-flow` (redirect for browsers, JSON for other clients) |
| `createCqrs` result | `container`, `commandBus`, `queryBus`, `events`, `flow()` |

## Step 3: Get The Command-Flow Visualization

`registerEventStorming(app)` mounts three things, and none of them needs a build step in the host project.

- `GET /event-storming/` serves the prebuilt HTML page from the package's `dist/event-storming/public`.
- `GET /docs/commands` returns the graph that the page draws: commands, queries, events, policies, invariants, payloads and DTOs, all derived from decorators at runtime.
- `GET /docs/command-flow` answers a browser with a `302` to the page and any other client with the paths as JSON.

Mount it before any token or auth middleware whose guard would block the page's own asset requests. The page fetches `/docs/commands` from the same backend, so protect the endpoint, not the assets: exempt `/event-storming` and let the page present the credential, or exempt `/docs/commands` when the graph is not sensitive. The host decides, because the package cannot attach a header to a browser's asset request.

Three details decide whether the diagram appears:

- Asset resolution looks at `EVENT_STORMING_DIR`, then the package's bundled `dist/event-storming/public`, then `./src/cqrs/event-storming/public` under the working directory. A directory counts only when it holds `index.html`.
- A compiled or bundled binary must set `EVENT_STORMING_DIR` to a folder it ships next to itself, because the working directory of a packaged app is not the project root.
- A `404` page that prints build instructions means no candidate directory held an `index.html`. That text comes from the source checkout layout, so treat it as the message to fix the path, not as instructions for a published package.

Pass `registerRoute` when the host already owns an OpenAPI registry, so the two graph routes appear in the host's document instead of the package's own `/docs` router.

```ts
registerEventStorming(app, {
  registerRoute: (path, config, handler) => docsRouter.get(path, config, handler),
});
```

The package does not install Swagger UI for the host's own routes; it only mounts its `/docs` router when `registerRoute` is absent. A host that wants Swagger keeps its own doc registry, which is what this project does.

## Step 4: Choose Folder Layout And Names

Keep one class per file and mirror the host's existing tree. The roles are fixed, the folder names are a convention.

| Role | Typical folder | Decorator |
| --- | --- | --- |
| Command | `command/` | `@Actor`, `@BoundedContext`, `@Payload` on the class |
| Command handler | `commandhandler/` | `@CommandHandler(Command, { inject, emits })` |
| Domain event | `event/` | `@BoundedContext`, `@Payload` on the class |
| Query | `query/` | `@Actor`, `@BoundedContext`, `@Payload` |
| Query handler | `queryhandler/` | `@QueryHandler(Query, { inject })` |
| Policy | `policy/` | `@Policy({ inject })`, then `@EventListener(Event, { sends })` |
| Service | `service/` | `@Service({ inject })` |

Name commands so they end with `Command` and events with `Event`. Nothing in the package enforces the suffix, because the decorators decide the role, but the audit row stores only the class name, so the suffix is what lets a reader of the trail tell a command row from an event row.

## Step 5: Add A Command And Its Handler

Write the command class first. The generic parameter is the value that `commandBus.send` resolves to; use `void` when the command returns nothing.

```ts
import { Actor, BoundedContext, Command, Payload } from "@machingclee/express-cqrs";

@Actor("Reader")
@BoundedContext("Notes")
@Payload({ documentId: "number", name: "string" })
export class ArchiveDocumentCommand extends Command<void> {
  constructor(
    readonly documentId: number,
    readonly name: string,
  ) {
    super();
  }
}
```

`@Payload` is not optional decoration. TypeScript erases constructor parameter types, so the graph has no other way to know the fields; a command without it shows up in the diagram with no payload.

Then write the handler. `handle` receives the command and a context carrying `requestId`, `actor` and `events`.

```ts
import {
  CommandHandler,
  type CommandContext,
  type ICommandHandler,
} from "@machingclee/express-cqrs";
import { PrismaUnitOfWork } from "../../../infrastructure/prisma/unitOfWork.ts";
import { ArchiveDocumentCommand } from "../command/ArchiveDocumentCommand.ts";
import { DocumentArchivedEvent } from "../event/DocumentArchivedEvent.ts";

@CommandHandler(ArchiveDocumentCommand, {
  inject: [PrismaUnitOfWork],
  emits: [DocumentArchivedEvent],
})
export class ArchiveDocumentCommandHandler
  implements ICommandHandler<ArchiveDocumentCommand>
{
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async handle(command: ArchiveDocumentCommand, context: CommandContext): Promise<void> {
    const db = this.uow.db();
    const document = await db.pdf_document.findUnique({ where: { id: command.documentId } });
    if (!document) throw new NotFoundError(`document ${command.documentId} does not exist`);

    await db.pdf_document.update({
      where: { id: document.id },
      data: { name: `${document.name} (archived)` },
    });

    context.events.add(new DocumentArchivedEvent(document.id, document.name));
  }
}
```

Rules for the handler body:

- `inject` order must match the constructor order. TypeScript has no parameter metadata here, so the container cannot infer it.
- `emits` is metadata for startup validation and the graph. The event still has to be added through `context.events`, because `emits` emits nothing.
- Validate HTTP input in the router and domain rules in the domain. A failed invariant throws, so the host's Express error middleware decides the status code.
- Never call `$transaction` in a handler or in anything it calls. The bus owns the transaction; on SQLite a nested one deadlocks instead of acting as a savepoint.

## Step 6: Add A Domain Event And Choose Its Timing

```ts
import { BoundedContext, DomainEvent, Payload } from "@machingclee/express-cqrs";

@BoundedContext("Notes")
@Payload({ documentId: "number", previousName: "string" })
export class DocumentArchivedEvent extends DomainEvent {
  constructor(
    readonly documentId: number,
    readonly previousName: string,
  ) {
    super();
  }
}
```

Events name something that already happened and carry the identifiers and values a policy or an audit reader needs. Do not put a whole database row in one.

Two dispatch timings exist, and picking the wrong one changes the transaction boundary:

| Call | Dispatch point | Consequence |
| --- | --- | --- |
| `context.events.add(event)` | after the handler returns, still inside the command transaction | a policy can send a nested command that joins the same transaction; a throw rolls the whole command back |
| `context.events.addTransactional(event)` | after the transaction commits | the listener cannot fail the command, and a command it sends opens a new transaction |

Use `add` for a reaction that must be consistent with the write. Use `addTransactional` for a side effect that must not abort a committed write, such as a notification.

## Step 7: Add A Policy Reaction

A policy is where a business rule that spans events lives, and it is the only place where `@Invariant` is allowed.

```ts
import {
  BoundedContext,
  CommandBus,
  EventListener,
  Invariant,
  Policy,
} from "@machingclee/express-cqrs";
import { CreateFolderCommand } from "../command/CreateFolderCommand.ts";
import { DocumentArchivedEvent } from "../event/DocumentArchivedEvent.ts";

@BoundedContext("Notes")
@Policy({ inject: [CommandBus] })
export class DocumentArchivePolicy {
  constructor(private readonly commandBus: CommandBus) {}

  @EventListener(DocumentArchivedEvent, { sends: [CreateFolderCommand] })
  @Invariant("an archived document keeps one folder for later notes")
  async onArchived(event: DocumentArchivedEvent): Promise<void> {
    await this.commandBus.send(
      new CreateFolderCommand({ pdf_document_id: event.documentId, name: "Archive" }),
    );
  }
}
```

Know three things about policies before writing one.

- `@Invariant("...")` is metadata. It is a sentence recorded in the graph for readers, and it enforces nothing. Write the rule as code in the listener.
- The listener runs inside the command transaction, so a `throw` rolls back the handler's writes and the API answers with the thrown error. That is the supported way to refuse a command from a policy, and it costs one rolled-back statement.
- `@Policy({ excludeFromFlow: true })` keeps a listener that subscribes to `DomainEvent` out of the diagram, which is what a development event log wants. Otherwise every node gains an edge.

## Step 8: Add A Query And Its Handler

A read path takes no transaction, emits no events and writes no audit row.

```ts
import { Actor, BoundedContext, Payload, Query } from "@machingclee/express-cqrs";
import type { FolderWithStrips } from "../types.ts";

@Actor("Reader")
@BoundedContext("Notes")
@Payload({ documentId: "number" })
export class ListFoldersQuery extends Query<FolderWithStrips[]> {
  constructor(readonly documentId: number) {
    super();
  }
}

@QueryHandler(ListFoldersQuery, { inject: [PrismaUnitOfWork] })
export class ListFoldersQueryHandler
  implements IQueryHandler<ListFoldersQuery, FolderWithStrips[]>
{
  constructor(private readonly uow: PrismaUnitOfWork) {}

  handle(query: ListFoldersQuery): Promise<FolderWithStrips[]> {
    return this.uow.db().folder.findMany({ where: { pdf_document_id: query.documentId } });
  }
}
```

A query handler's `handle` takes only the query, and `queryBus.send` resolves to its return value.

## Step 9: Add A Service And App Providers

Use `@Service` for a class that handlers inject and that is neither a handler nor a policy. It is a container singleton, so keep it stateless or make the state intentional.

```ts
import { Service } from "@machingclee/express-cqrs";
import { PrismaUnitOfWork } from "../../../infrastructure/prisma/unitOfWork.ts";

@Service({ inject: [PrismaUnitOfWork] })
export class NoteCounter {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  countFor(documentId: number): Promise<number> {
    return this.uow.db().focusable_strip.count({ where: { pdf_document_id: documentId } });
  }
}
```

Register the class in the component list. When a provider is built by the app instead of the container, register the instance in `configure`, and use the same token class that handlers list in `inject`.

```ts
const unitOfWork = new PrismaUnitOfWork(prisma);
const cqrs = createCqrs({
  components: APP_COMPONENTS,
  transactionRunner: unitOfWork,
  configure: (container) => container.registerValue(PrismaUnitOfWork, unitOfWork),
});
```

The container also offers `registerClass(token, ctor, inject)` and `registerFactory(token, factory)` for anything with a different construction path.

## Step 10: Add The Route

Send the command from the route and let the host's middleware validate and map errors.

```ts
app.post("/documents/:id/archive", async (req, res, next) => {
  try {
    await req.commandBus.send(new ArchiveDocumentCommand(Number(req.params.id), req.body.name));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
```

Keep the body validation in the route layer, then build the command from the parsed value. A command that is constructed from a Zod-parsed body should take that parsed type, so the router and the command cannot drift; this project derives `@Payload` from the same schema with a small helper.

## Step 11: Register Everything

There is no classpath scan. Every decorated class that the runtime must instantiate belongs in the component list, including policies and services.

```ts
export const APP_COMPONENTS = [
  ArchiveDocumentCommandHandler,
  ListFoldersQueryHandler,
  DocumentArchivePolicy,
  NoteCounter,
];
```

Startup fails fast, with the reason, when:

- a listed class carries no decorator;
- a listed class is already registered;
- a command, query or event lacks `@Actor` and `@BoundedContext` while strict mode is on;
- an injected token is missing from the container;
- the container graph has a cycle;
- two handlers claim the same command, or two listeners claim the same policy event.

Read the message and fix the registration rather than catching the error at runtime.

## Step 12: Add An Audit Store (Optional)

Audit is optional, and it is a single method. Implement `save` and pass the object as `auditEventRepository`.

```ts
import type { AuditBatch, AuditEventRepository } from "@machingclee/express-cqrs";

export class PrismaAuditRepository implements AuditEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(batch: AuditBatch): Promise<void> {
    await this.prisma.event_audit.createMany({
      data: batch.records.map((record) => ({
        request_id: record.requestId,
        event_type: record.type,
        payload: record.payload,
        event_order: record.order,
        request_user_email: record.actor,
        success: record.success,
        failure_reason: record.failureReason,
        created_at: record.createdAt,
      })),
    });
  }
}
```

The library already did the hard part when `save` runs: it built one record per command dispatch and one per event, ordered them per request, stamped `success` and `failureReason` after a rollback, serialized and capped the payload, and it calls `save` once per top-level request after the transaction ends. A throw from `save` is logged and does not fail the command, so the write is best-effort; use an outbox row inside the command transaction when the trail must be at-least-once. `MemoryAuditEventRepository` from the package is the test double.

## Transactions And Nesting

The bus opens one `$transaction` for a top-level command through the `TransactionRunner` port.

```ts
export class PrismaUnitOfWork implements TransactionRunner {
  private readonly storage = new AsyncLocalStorage<Prisma.TransactionClient>();

  run<T>(fn: () => Promise<T>): Promise<T> {
    return this.client.$transaction((tx) => this.storage.run(tx, fn), {
      maxWait: 5_000,
      timeout: 60_000,
    });
  }

  isActive(): boolean {
    return this.storage.getStore() !== undefined;
  }

  db(): Prisma.TransactionClient {
    return this.storage.getStore() ?? this.client;
  }
}
```

Handlers call `db()` and never open their own transaction. A nested command, including one a policy sends, reuses the ambient transaction through the same storage, which is what keeps the audit order and the write atomic. `@Transactional({ mode: "none" })` exists for a handler that manages its own I/O; do not use it in an all-required application without an explicit decision.

## Verify

Run the host's checks first, then exercise the runtime.

```bash
npm run typecheck   # or bun check, tsc --noEmit
npm test
```

Boot the app and check the four surfaces:

```bash
curl -s localhost:3000/docs/commands | head -c 400      # graph JSON
curl -sI localhost:3000/docs/command-flow               # 302 for a browser, JSON otherwise
curl -sI localhost:3000/event-storming/                 # 200 text/html
curl -s -X POST localhost:3000/documents/1/archive -H 'content-type: application/json' -d '{"name":"x"}'
```

In `GET /docs/commands`, confirm the new command appears with its handler, the event under its bounded context, the policy with its `sends` edge, the invariant under `invariants`, and the payload fields on each node. If a node is missing, it is almost always absent from the component list; if a payload is empty, `@Payload` is missing.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| `No handler registered for command X` | handler class not in the component list | add it to `components` |
| startup error `X is not decorated` | listed class has no `@CommandHandler`, `@QueryHandler`, `@Policy` or `@Service` | decorate it or drop it from the list |
| startup error about `@Actor`/`@BoundedContext` | strict mode is on and the command, query or event lacks an annotation | add the annotation |
| startup error about missing providers or a cycle | `inject` token not registered, or two classes inject each other | register through `configure`, or break the cycle |
| injected value is `undefined` | `inject` order differs from constructor order | align both lists |
| event handler never runs | event was constructed but not added to `context.events`, or the policy is not in the component list | add the event and register the policy |
| command hangs or times out | handler called `$transaction` inside the ambient transaction | call `uow.db()` and drop the inner transaction |
| invariant text does not stop anything | `@Invariant` is metadata | write the check as code in the listener |
| diagram page answers 404 with build text | no asset directory with an `index.html` | ship the folder and point `EVENT_STORMING_DIR` at it |
| diagram loads but draws nothing | the page cannot read `/docs/commands`, usually an auth guard on that path | exempt the graph or let the page send the credential |

## Minimal Complete App

```ts
import express from "express";
import {
  Actor,
  BoundedContext,
  Command,
  CommandHandler,
  DomainEvent,
  Payload,
  attachCqrs,
  initializeCqrs,
  registerEventStorming,
  type CommandContext,
} from "@machingclee/express-cqrs";

@Actor("User")
@BoundedContext("Notes")
@Payload({ text: "string" })
class CreateNote extends Command<string> {
  constructor(readonly text: string) {
    super();
  }
}

@BoundedContext("Notes")
@Payload({ id: "string" })
class NoteCreated extends DomainEvent {
  constructor(readonly id: string) {
    super();
  }
}

@CommandHandler(CreateNote, { inject: [], emits: [NoteCreated] })
class CreateNoteHandler {
  async handle(command: CreateNote, context: CommandContext): Promise<string> {
    const id = crypto.randomUUID();
    context.events.add(new NoteCreated(id));
    return id;
  }
}

const app = express();
app.use(express.json());
initializeCqrs({ components: [CreateNoteHandler] });
app.use(attachCqrs());
registerEventStorming(app);

app.post("/notes", async (req, res) => {
  res.status(201).json(await req.commandBus.send(new CreateNote(req.body.text)));
});

app.listen(3000, () => console.log("http://localhost:3000/event-storming/"));
```

Boot that file and the diagram at `/event-storming/` draws the command, the event and the edge between them, with no database and no build step.
