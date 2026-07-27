# Transactional ResourceLock

Scaffold a `ResourceLock`-based transactional locking system into a Spring Boot project. The lock is an application-level mutex backed by `ReentrantLock` whose release is deferred to transaction `afterCompletion`, guaranteeing that the next waiter sees fully committed database state. Swappable to Redis without call-site changes.

## When to Use

- Serializing concurrent requests on shared resources within a Spring transaction boundary
- Replacing `synchronized` with a lock that spans the full read-mutate-commit cycle
- Any scenario where two requests must not interleave between `saveAndFlush` and commit
- Preparing for multi-instance deployment with a future Redis-backed distributed lock

## Architecture

```
common/lock/
  interfaces/ResourceLock.java       ← pluggable interface
  LocalResourceLock.java             ← in-JVM default (ReentrantLock per key)
  LockAcquisitionException.java      ← timeout → caller maps to 409
  AbstractRedisResourceLock.java     ← skeleton for future Redis

<context>/service/lock/
  LockKey.java                       ← enum of key namespaces
  LockService.java                   ← typed wrapper: LockKey × ID → lock
```

## How It Works

### With an Active Transaction (the normal case)

When a Spring `@Transactional` is active, `LocalResourceLock.bindRelease()` registers a `TransactionSynchronization` that fires `unlock()` in `afterCompletion` — after commit. The returned `Handle` is `Handle.NOOP` (calling `close()` is harmless but unnecessary).

```
CommandHandler:
  lockService.lock(TIMESLOT, 42)   → acquire ReentrantLock, register TX sync, return NOOP
  repository.findAllById([42])     → read (previous TX committed, so data is current)
  mutate + saveAndFlush            → write
  return                           → Spring commits TX → afterCompletion → unlock
```

The lock is held across the full transaction lifecycle. The next waiter cannot acquire the lock until the previous transaction has fully committed.

### Without a Transaction

When no transaction is active, `bindRelease()` returns the unlock action directly as the `Handle`. The caller **must** use try-with-resources:

```java
try (var h = lockService.lock(TIMESLOT, 42, Duration.ofSeconds(5))) {
    // non-transactional work
} // close() → unlock() fires here
```

Forgetting try-with-resources leaks the lock permanently (until JVM restart).

## File Templates

### 1. ResourceLock Interface

`common/lock/interfaces/ResourceLock.java`

```java
package {{basePackage}}.common.lock.interfaces;

import java.time.Duration;
import java.util.Collection;
import java.util.List;

public interface ResourceLock {

    Handle acquire(String key, Duration timeout) throws LockAcquisitionException;

    default Handle acquireAll(Collection<String> keys, Duration timeout) throws LockAcquisitionException {
        if (keys == null || keys.isEmpty()) return Handle.NOOP;
        List<String> ordered = keys.stream().distinct().sorted().toList();
        if (ordered.size() == 1) return acquire(ordered.get(0), timeout);
        return acquireMany(ordered, timeout);
    }

    Handle acquireMany(List<String> orderedDistinctKeys, Duration timeout) throws LockAcquisitionException;

    @FunctionalInterface
    interface Handle extends AutoCloseable {
        Handle NOOP = () -> {};
        @Override void close();
    }
}
```

### 2. LocalResourceLock

`common/lock/LocalResourceLock.java`

```java
package {{basePackage}}.common.lock;

import {{basePackage}}.common.lock.interfaces.ResourceLock;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

@Component
public class LocalResourceLock implements ResourceLock {

    private final ConcurrentHashMap<String, ReentrantLock> locks = new ConcurrentHashMap<>();

    @Override
    public Handle acquire(String key, Duration timeout) throws LockAcquisitionException {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("lock key must not be blank");
        }
        ReentrantLock lock = lockRaw(key, timeout);
        return bindRelease(() -> unlockQuietly(lock));
    }

    @Override
    public Handle acquireMany(List<String> orderedDistinctKeys, Duration timeout) throws LockAcquisitionException {
        List<ReentrantLock> held = new ArrayList<>(orderedDistinctKeys.size());
        try {
            for (String key : orderedDistinctKeys) {
                held.add(lockRaw(key, timeout));
            }
            return bindRelease(() -> {
                for (int i = held.size() - 1; i >= 0; i--) {
                    unlockQuietly(held.get(i));
                }
            });
        } catch (RuntimeException e) {
            for (int i = held.size() - 1; i >= 0; i--) {
                unlockQuietly(held.get(i));
            }
            throw e;
        }
    }

    private ReentrantLock lockRaw(String key, Duration timeout) throws LockAcquisitionException {
        ReentrantLock lock = locks.computeIfAbsent(key, k -> new ReentrantLock());
        boolean acquired;
        try {
            acquired = lock.tryLock(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LockAcquisitionException(key, "Interrupted while waiting for lock: " + key, e);
        }
        if (!acquired) {
            throw new LockAcquisitionException(key,
                    "Could not acquire lock within " + timeout.toMillis() + "ms: " + key);
        }
        return lock;
    }

    private void unlockQuietly(ReentrantLock lock) {
        if (lock.isHeldByCurrentThread()) {
            lock.unlock();
        }
    }

    /**
     * TX active → unlock only in afterCompletion (close is no-op).
     * No TX → unlock on Handle.close() (try-with-resources).
     */
    private Handle bindRelease(Runnable unlock) {
        Once once = new Once(unlock);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    once.run();
                }
            });
            return Handle.NOOP;
        }
        return once::run;
    }

    private static final class Once {
        private final Runnable action;
        private boolean done;

        Once(Runnable action) { this.action = action; }

        synchronized void run() {
            if (done) return;
            done = true;
            action.run();
        }
    }
}
```

### 3. LockAcquisitionException

`common/lock/LockAcquisitionException.java`

```java
package {{basePackage}}.common.lock;

public class LockAcquisitionException extends RuntimeException {

    private final String lockKey;

    public LockAcquisitionException(String lockKey, String message) {
        super(message);
        this.lockKey = lockKey;
    }

    public LockAcquisitionException(String lockKey, String message, Throwable cause) {
        super(message, cause);
        this.lockKey = lockKey;
    }

    public String getLockKey() { return lockKey; }
}
```

### 4. AbstractRedisResourceLock (Future)

`common/lock/AbstractRedisResourceLock.java`

```java
package {{basePackage}}.common.lock;

import {{basePackage}}.common.lock.interfaces.ResourceLock;

/**
 * Skeleton for a future Redis-backed ResourceLock.
 *
 * Migration steps:
 * 1. Implement acquire/acquireMany with SET NX PX (or Redisson/Lettuce)
 * 2. Wire the same TX afterCompletion release pattern (Lua DEL only if token matches)
 * 3. Register as @Component + @Primary; mark LocalResourceLock @ConditionalOnMissingBean
 *
 * Do not enable until a Redis client is wired; intentionally not a Spring bean.
 */
public abstract class AbstractRedisResourceLock implements ResourceLock {
}
```

### 5. LockKey Enum

`<context>/service/lock/LockKey.java`

```java
package {{basePackage}}.{{context}}.service.lock;

public enum LockKey {
    TIMESLOT_OPTION
    // Add more: BOOKING_CANCEL, SCHEDULE_EDIT, etc.
}
```

The enum values form the key prefix. `LockKey.TIMESLOT_OPTION` + `:42` produces `TIMESLOT_OPTION:42`. Each value represents a distinct resource type and operation that needs serialization.

### 6. LockService

`<context>/service/lock/LockService.java`

```java
package {{basePackage}}.{{context}}.service.lock;

import {{basePackage}}.common.exception.EcapiException;
import {{basePackage}}.common.lock.LocalResourceLock;
import {{basePackage}}.common.lock.LockAcquisitionException;
import {{basePackage}}.common.lock.interfaces.ResourceLock;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Collection;
import java.util.List;

@Component
@RequiredArgsConstructor
public class LockService<T> {

    public static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(10);

    private final LocalResourceLock resourceLock;

    public ResourceLock.Handle lock(LockKey key, T id) {
        return lock(key, id, DEFAULT_TIMEOUT);
    }

    public ResourceLock.Handle lock(LockKey key, T id, Duration timeout) {
        try {
            return resourceLock.acquire(toKey(key, id), timeout);
        } catch (LockAcquisitionException e) {
            throw toEcapiException(e);
        }
    }

    public ResourceLock.Handle lockAll(LockKey key, Collection<T> ids) {
        return lockAll(key, ids, DEFAULT_TIMEOUT);
    }

    public ResourceLock.Handle lockAll(LockKey key, Collection<T> ids, Duration timeout) {
        List<String> keys = toKeys(key, ids);
        if (keys.isEmpty()) return ResourceLock.Handle.NOOP;
        try {
            return resourceLock.acquireAll(keys, timeout);
        } catch (LockAcquisitionException e) {
            throw toEcapiException(e);
        }
    }

    private List<String> toKeys(LockKey key, Collection<T> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        return ids.stream().distinct().map(id -> toKey(key, id)).sorted().toList();
    }

    private String toKey(LockKey key, T id) {
        return key + ":" + id;
    }

    private EcapiException toEcapiException(LockAcquisitionException e) {
        return new EcapiException(
                "RESOURCE_BUSY",
                "Another request is operating on this resource; please retry. (" + e.getLockKey() + ")",
                HttpStatus.CONFLICT);
    }
}
```

`T` is typically `Integer` or `String`. The key format is `LockKey:ID` (e.g., `TIMESLOT_OPTION:42`). Keys are sorted before multi-lock acquisition to avoid deadlock.

## Usage in Command Handlers

### Transactional (the default)

```java
@Component
@RequiredArgsConstructor
public class AssignCustomerCommandHandler implements CommandHandler<AssignCommand, Void> {

    private final LockService<Integer> lockService;
    private final BookingTimeslotOptionRepository repository;

    @Override
    public Void handle(EventQueue events, AssignCommand cmd) {
        // Lock held until TX afterCompletion — returned handle is NOOP
        lockService.lockAll(LockKey.TIMESLOT_OPTION, cmd.getTimeslotOptionIds());

        // Read after lock: previous TX has committed, data is current
        var options = repository.findAllById(cmd.getTimeslotOptionIds());

        // Mutate, save, publish events
        // ...
        return null;
    }
    // TX commits → afterCompletion → locks released
}
```

### Non-Transactional

```java
public void doWorkOutsideTransaction(Integer id) {
    // Must use try-with-resources — close() releases the lock
    try (var h = lockService.lock(LockKey.TIMESLOT_OPTION, id, Duration.ofSeconds(5))) {
        // non-transactional work
    } // lock released here
}
```

## Key Design Decisions

- **Sorted keys before multi-lock.** If thread A locks `[42, 99]` and thread B locks `[99, 42]`, without sorting they deadlock. Sorting guarantees a consistent global order every caller follows.
- **Release deferred to `afterCompletion`.** The gap between `saveAndFlush` and commit is a race window. Lock must span the full read-mutate-commit cycle.
- **`computeIfAbsent` for per-key lock pool.** Each distinct key gets its own `ReentrantLock`. Two threads for the same key contend; different keys proceed in parallel.
- **`tryLock(timeout)` with 10s default.** Prevents one stuck thread from exhausting the pool. Callers get 409 and can retry.
- **`isHeldByCurrentThread()` guard on unlock.** If `afterCompletion` fires and an error path also calls `close()`, the second unlock is a harmless no-op.
- **Interface-based swappability.** Call sites depend on `ResourceLock`, never on `LocalResourceLock`. Swap to Redis by changing one `@Bean`.

## Testing

The test pattern: Thread 1 acquires the lock inside a `@Transactional` method and sleeps. Thread 2 tries `lockService.lock()` outside a transaction (using try-with-resources). Thread 2 must wait until Thread 1's transaction commits:

```java
@SpringBootTest
@ActiveProfiles("local")
class LockServiceTest {

    @Autowired private LockService<Integer> lockService;
    @Autowired private TransactionalClaimOperations claimOps;  // @Transactional helper

    @Test
    void secondThreadGetsLockOnlyAfterFirstTransactionCommits() throws Exception {
        Integer id = seedFixture();
        CountDownLatch done = new CountDownLatch(2);
        AtomicReference<Throwable> error = new AtomicReference<>();

        var pool = Executors.newFixedThreadPool(2);
        long started = System.nanoTime();

        // Thread 1: transactional — lock held until afterCompletion
        pool.submit(() -> {
            try { claimOps.holdLockUnderTransaction(id, 4000); }
            catch (Throwable t) { error.compareAndSet(null, t); }
            finally { done.countDown(); }
        });

        Thread.sleep(100); // let Thread 1 acquire first

        // Thread 2: non-transactional — try-with-resources
        pool.submit(() -> {
            try (var h = lockService.lock(LockKey.TIMESLOT_OPTION, id, Duration.ofSeconds(10))) {
                // acquired only after Thread 1's TX committed
            } catch (Throwable t) { error.compareAndSet(null, t); }
            finally { done.countDown(); }
        });

        assertThat(done.await(15, TimeUnit.SECONDS)).isTrue();
        assertThat(error.get()).isNull();
        long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        assertThat(elapsed).isGreaterThanOrEqualTo(4000); // waited at least the hold duration
        pool.shutdownNow();
    }
}
```

The `TransactionalClaimOperations` helper:

```java
@Component
public class TransactionalClaimOperations {
    private final LockService<Integer> lockService;

    @Transactional
    public void holdLockUnderTransaction(Integer id, long holdMs) {
        lockService.lock(LockKey.TIMESLOT_OPTION, id).close(); // NOOP under TX
        Thread.sleep(holdMs);
    } // TX commits → afterCompletion → lock released
}
```
