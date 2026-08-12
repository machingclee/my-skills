import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import "./flipbook-carousel.css"

export interface FlipbookCard {
    id: number | string
    content: ReactNode
}

interface Props {
    cards: FlipbookCard[]
    className?: string
    /** Accessible label for the carousel region. */
    ariaLabel?: string
    /**
     * When true (default), the deck wraps end↔start.
     * When false, progress clamps at the first/last card.
     */
    loop?: boolean
    /**
     * When true, auto-advances to the next card (toward “next” / right of the deck).
     * Default false.
     */
    autoplay?: boolean
    /**
     * Delay between autoplay advances in milliseconds.
     * Default 5000 (5s). Only used when `autoplay` is true.
     */
    autoplayIntervalMs?: number
}

const VISIBLE_RADIUS = 2

/**
 * Drag distance (as a fraction of stage width) that advances one full slide.
 * Lower = faster scroll (less pointer travel per card).
 */
const DRAG_DISTANCE_FRACTION = 0.42

/** Slow-release distance threshold (in slides) to commit to next/prev. */
const SNAP_DISTANCE_THRESHOLD = 0.18

/**
 * Fixed duration for the front→rear commit flip (ms).
 * Independent of drag speed so the handoff always has time to read.
 */
const COMMIT_TURN_MS = 520

const DEFAULT_AUTOPLAY_INTERVAL_MS = 5000

/**
 * Max CSS blur (px) for cards fully at the rear / side of the deck.
 * Eases to 0 at the selected (center) card via `sideT` in poseFor.
 * Change this constant to tune how soft background cards look.
 */
const SIDE_BLUR_PX = 100

/**
 * Stacked flipbook carousel of arbitrary React cards.
 * Front peels under next, tight deck; optional loop + autoplay.
 * Card spacing / arc scale with each card's measured content width.
 */
export default function FlipbookCarousel({
    cards,
    className,
    ariaLabel = "Carousel",
    loop = true,
    autoplay = false,
    autoplayIntervalMs = DEFAULT_AUTOPLAY_INTERVAL_MS,
}: Props) {
    const stageRef = useRef<HTMLDivElement>(null)
    const cardRefs = useRef(new Map<number, HTMLDivElement>())
    const progressRef = useRef(0)
    const [activeIndex, setActiveIndex] = useState(0)
    const [dragging, setDragging] = useState(false)

    const dragRef = useRef<{
        pointerId: number
        startX: number
        startProgress: number
        width: number
    } | null>(null)

    const commitRafRef = useRef(0)
    const autoplayRafRef = useRef(0)
    const autoplayCycleStartRef = useRef(0)
    /** Accumulated pause time within the current cycle (ms). */
    const autoplayPausedMsRef = useRef(0)
    const autoplayPauseBeganRef = useRef<number | null>(null)
    /** Skip counting while a commit flip animation is running. */
    const committingRef = useRef(false)
    const loopRef = useRef(loop)
    loopRef.current = loop
    const draggingRef = useRef(false)
    draggingRef.current = dragging
    const goByRef = useRef<(delta: number) => void>(() => {})

    const count = cards.length
    const countRef = useRef(count)
    countRef.current = count

    /** 0..1 fill for the autoplay countdown bar (only meaningful when autoplay). */
    const [autoplayProgress, setAutoplayProgress] = useState(0)
    const autoplayProgressRef = useRef(0)

    const restartAutoplayCycle = useCallback((now = performance.now()) => {
        autoplayCycleStartRef.current = now
        autoplayPausedMsRef.current = 0
        autoplayPauseBeganRef.current =
            draggingRef.current || committingRef.current ? now : null
        autoplayProgressRef.current = 0
        setAutoplayProgress(0)
    }, [])

    /** Signed index distance for poses (wraps when looping, linear when not). */
    const cardOffset = (i: number, p: number, n: number) => {
        if (n <= 0) return 0
        if (!loopRef.current) return i - p
        let d = i - mod(p, n)
        if (d > n / 2) d -= n
        if (d < -n / 2) d += n
        return d
    }

    const clampProgress = (p: number, n: number) => {
        if (n <= 1) return 0
        if (loopRef.current) return p
        return clamp(p, 0, n - 1)
    }

    /**
     * Rendered width of a card's content (prefers img, else first child, else card).
     * Used so neighbor spacing clears wide cards regardless of content type.
     */
    const measureCardContentWidth = (i: number, stageW: number) => {
        const card = cardRefs.current.get(i)
        if (!card) return stageW * 0.7
        const img = card.querySelector("img")
        if (img) {
            const imgW = img.getBoundingClientRect().width
            if (imgW > 1) return imgW
        }
        const content = card.querySelector(".flipbook-card-content") as HTMLElement | null
        const contentW = content?.getBoundingClientRect().width ?? 0
        if (contentW > 1) return contentW
        // Fall back to first element child
        const first = card.firstElementChild as HTMLElement | null
        const firstW = first?.getBoundingClientRect().width ?? 0
        if (firstW > 1) return firstW
        return stageW * 0.7
    }

    const selectedContentWidth = (p: number, n: number, stageW: number) => {
        if (n <= 0) return stageW * 0.7
        if (loopRef.current) {
            const wrapped = mod(p, n)
            const i0 = Math.floor(wrapped) % n
            const i1 = (i0 + 1) % n
            const t = wrapped - Math.floor(wrapped)
            const w0 = measureCardContentWidth(i0, stageW)
            const w1 = measureCardContentWidth(i1, stageW)
            return w0 * (1 - t) + w1 * t
        }
        const clamped = clamp(p, 0, n - 1)
        const i0 = Math.min(Math.floor(clamped), n - 1)
        const i1 = Math.min(i0 + 1, n - 1)
        const t = clamped - Math.floor(clamped)
        const w0 = measureCardContentWidth(i0, stageW)
        const w1 = measureCardContentWidth(i1, stageW)
        return w0 * (1 - t) + w1 * t
    }

    const stepXFor = (activeW: number, stageW: number) => {
        const peek = Math.max(12, activeW * 0.04)
        return Math.min(activeW / 2 + peek, stageW * 0.48)
    }

    /**
     * Front→rear path is a physical arc (not a z-index pop).
     * Rest slots + mid-turn swing scale with measured content widths.
     * Layer order follows translateZ continuously.
     */
    const poseFor = (
        i: number,
        p: number,
        n: number,
        stageWidth: number,
        activeW: number,
    ) => {
        const offset = cardOffset(i, p, n)
        const abs = Math.abs(offset)
        const w = Math.max(stageWidth, 1)
        const side = Math.sign(offset) || 0

        const turn = clamp(abs, 0, 1)
        const arc = Math.sin(turn * Math.PI)
        const dive = smoothstep(clamp((turn - 0.25) / 0.75, 0, 1))

        const ownW = measureCardContentWidth(i, w)
        const neighborRaw = i + (side <= 0 ? 1 : -1)
        const neighborIdx = n > 0
            ? (loopRef.current ? mod(neighborRaw, n) : clamp(neighborRaw, 0, n - 1))
            : i
        const neighborW = measureCardContentWidth(neighborIdx, w)

        const peek = Math.max(12, Math.min(activeW, ownW) * 0.04)
        const halfActive = activeW / 2
        const halfOwn = ownW / 2
        const halfNeighbor = neighborW / 2
        const stepX = stepXFor(activeW, w)

        const clearRadius = Math.max(halfActive, halfOwn, halfNeighbor)
        const swing = Math.min(clearRadius + peek * 2, w * 0.55)

        const depthUnit = Math.max(activeW, ownW) * 0.42

        let translateX: number
        let translateZ: number
        let rotateY: number
        let scale: number

        if (side < 0) {
            const restX = -stepX * 0.55
            translateX = restX * turn - swing * arc
            translateZ =
                -depthUnit * 0.25 * turn
                - depthUnit * 1.45 * dive
            const yaw = 48 + clamp(ownW / w, 0, 1) * 18
            rotateY = yaw * turn + 16 * arc
            scale = 1 - 0.08 * turn - 0.03 * arc
            if (abs > 1) {
                translateX += -(abs - 1) * stepX * 0.5
                translateZ += -(abs - 1) * depthUnit * 0.35
                rotateY += (abs - 1) * 6
                scale -= (abs - 1) * 0.02
            }
        } else if (side > 0) {
            const restX = stepX * 0.55
            translateX = restX * turn + swing * 0.22 * arc
            translateZ = -depthUnit * 0.95 * turn - depthUnit * 0.15 * arc
            const yaw = 28 + clamp(ownW / w, 0, 1) * 10
            rotateY = -yaw * turn - 6 * arc
            scale = 1 - 0.05 * turn
            if (abs > 1) {
                translateX += (abs - 1) * stepX * 0.5
                translateZ += -(abs - 1) * depthUnit * 0.35
                rotateY -= (abs - 1) * 6
                scale -= (abs - 1) * 0.02
            }
        } else {
            translateX = 0
            translateZ = 0
            rotateY = 0
            scale = 1
        }

        const opacity =
            abs > VISIBLE_RADIUS + 0.35
                ? 0
                : abs <= 1.15
                  ? 1
                  : clamp(1 - (abs - 1) * 0.45, 0, 1)

        // Side cards: blur + slight brighten; both ease to normal at center
        const sideT = smoothstep(clamp(abs / 1.05, 0, 1))
        const blurPx = sideT * SIDE_BLUR_PX
        const brightness = 1 + sideT * 0.18
        const filter = `brightness(${brightness}) blur(${blurPx}px)`

        const zIndex = Math.round(
            2500
            + translateZ * 1.8
            - Math.abs(translateX) * 0.15
            + offset * 4,
        )

        return {
            transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
            opacity,
            filter,
            zIndex,
            visibility: (opacity <= 0.02 ? "hidden" : "visible") as "hidden" | "visible",
        }
    }

    const stageWidth = () => Math.max(stageRef.current?.clientWidth ?? 1, 1)

    const paint = useCallback((withTransition: boolean) => {
        const n = countRef.current
        const p = progressRef.current
        const stage = stageRef.current
        const w = Math.max(stage?.clientWidth ?? 1, 1)
        if (stage) {
            stage.classList.toggle("is-dragging", !withTransition)
        }

        const activeW = selectedContentWidth(p, n, w)
        const active = n > 0
            ? (loopRef.current
                ? Math.round(mod(p, n)) % n
                : clamp(Math.round(p), 0, n - 1))
            : 0
        for (const [i, el] of cardRefs.current) {
            const pose = poseFor(i, p, n, w, activeW)
            el.style.transform = pose.transform
            el.style.opacity = String(pose.opacity)
            el.style.filter = pose.filter
            el.style.zIndex = String(pose.zIndex)
            el.style.visibility = pose.visibility
            el.setAttribute("aria-hidden", i === active ? "false" : "true")
        }
    }, [])

    const commitActive = useCallback(() => {
        const n = countRef.current
        if (n === 0) return
        const p = progressRef.current
        const next = loopRef.current
            ? Math.round(mod(p, n)) % n
            : clamp(Math.round(p), 0, n - 1)
        setActiveIndex(next)
    }, [])

    const stopCommit = useCallback(() => {
        cancelAnimationFrame(commitRafRef.current)
        commitRafRef.current = 0
    }, [])

    const animateCommitTo = useCallback((targetProgress: number) => {
        stopCommit()

        const n = countRef.current
        const from = progressRef.current
        const to = clampProgress(targetProgress, n)
        if (Math.abs(to - from) < 0.001) {
            progressRef.current = to
            paint(false)
            committingRef.current = false
            commitActive()
            restartAutoplayCycle()
            return
        }

        committingRef.current = true
        restartAutoplayCycle()

        const start = performance.now()
        const steps = Math.max(1, Math.abs(to - from))
        const duration = Math.min(COMMIT_TURN_MS * steps, COMMIT_TURN_MS * 1.6)

        paint(false)

        const tick = (now: number) => {
            const t = clamp((now - start) / duration, 0, 1)
            const eased = t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2

            progressRef.current = from + (to - from) * eased
            paint(false)

            if (t < 1) {
                commitRafRef.current = requestAnimationFrame(tick)
                return
            }

            progressRef.current = to
            paint(false)
            committingRef.current = false
            commitActive()
            commitRafRef.current = 0
            // Start the next countdown only after the flip finishes
            restartAutoplayCycle(now)
        }

        commitRafRef.current = requestAnimationFrame(tick)
    }, [commitActive, paint, restartAutoplayCycle, stopCommit])

    const snapTo = useCallback((targetProgress: number) => {
        animateCommitTo(targetProgress)
    }, [animateCommitTo])

    const goBy = useCallback((delta: number) => {
        const n = countRef.current
        if (n === 0) return
        dragRef.current = null
        setDragging(false)
        stopCommit()
        const base = Math.round(progressRef.current)
        if (!loopRef.current) {
            snapTo(clamp(base + delta, 0, n - 1))
            return
        }
        snapTo(base + delta)
    }, [snapTo, stopCommit])

    const goToIndex = useCallback((target: number) => {
        const n = countRef.current
        if (n === 0) return
        dragRef.current = null
        setDragging(false)
        stopCommit()
        const clampedTarget = clamp(target, 0, n - 1)
        if (!loopRef.current) {
            snapTo(clampedTarget)
            return
        }
        const current = progressRef.current
        const currentWrapped = mod(current, n)
        let delta = clampedTarget - currentWrapped
        if (delta > n / 2) delta -= n
        if (delta < -n / 2) delta += n
        snapTo(Math.round(current) + delta)
    }, [snapTo, stopCommit])

    goByRef.current = goBy

    // Autoplay countdown: single rAF clock for bar + advance (no activeIndex reset).
    useEffect(() => {
        const clear = () => {
            if (autoplayRafRef.current) {
                cancelAnimationFrame(autoplayRafRef.current)
                autoplayRafRef.current = 0
            }
        }

        if (!autoplay || count < 2) {
            clear()
            autoplayProgressRef.current = 0
            setAutoplayProgress(0)
            return
        }

        const interval = Math.max(autoplayIntervalMs, COMMIT_TURN_MS + 50)
        restartAutoplayCycle()

        const frame = (now: number) => {
            const paused =
                draggingRef.current
                || !!dragRef.current
                || committingRef.current

            if (paused) {
                if (autoplayPauseBeganRef.current == null) {
                    autoplayPauseBeganRef.current = now
                }
            } else if (autoplayPauseBeganRef.current != null) {
                autoplayPausedMsRef.current += now - autoplayPauseBeganRef.current
                autoplayPauseBeganRef.current = null
            }

            const n = countRef.current
            const base = Math.round(progressRef.current)
            const blocked = !loopRef.current && base >= n - 1

            if (blocked || paused) {
                if (blocked && autoplayProgressRef.current !== 0) {
                    autoplayProgressRef.current = 0
                    setAutoplayProgress(0)
                }
                autoplayRafRef.current = requestAnimationFrame(frame)
                return
            }

            const pausedExtra =
                autoplayPauseBeganRef.current != null
                    ? now - autoplayPauseBeganRef.current
                    : 0
            const elapsed =
                now - autoplayCycleStartRef.current - autoplayPausedMsRef.current - pausedExtra

            const t = clamp(elapsed / interval, 0, 1)
            if (Math.abs(t - autoplayProgressRef.current) >= 0.008 || t === 0 || t === 1) {
                autoplayProgressRef.current = t
                setAutoplayProgress(t)
            }

            if (t >= 1) {
                // goBy → commit animation restarts the cycle when the flip ends
                goByRef.current(1)
            }

            autoplayRafRef.current = requestAnimationFrame(frame)
        }

        autoplayRafRef.current = requestAnimationFrame(frame)
        return clear
    }, [autoplay, autoplayIntervalMs, count, restartAutoplayCycle])

    useLayoutEffect(() => {
        progressRef.current = 0
        stopCommit()
        paint(false)
        setActiveIndex(0)
        return () => stopCommit()
    }, [count, paint, stopCommit])

    useLayoutEffect(() => {
        paint(false)
        commitActive()
    }, [cards, paint, commitActive])

    useLayoutEffect(() => {
        const el = stageRef.current
        if (!el || typeof ResizeObserver === "undefined") return
        const ro = new ResizeObserver(() => {
            paint(false)
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [paint])

    const setCardRef = useCallback((i: number, el: HTMLDivElement | null) => {
        if (el) {
            cardRefs.current.set(i, el)
            const p = progressRef.current
            const n = countRef.current
            const w = stageWidth()
            const pose = poseFor(i, p, n, w, selectedContentWidth(p, n, w))
            el.style.transform = pose.transform
            el.style.opacity = String(pose.opacity)
            el.style.filter = pose.filter
            el.style.zIndex = String(pose.zIndex)
            el.style.visibility = pose.visibility

            // Remeasure when media inside this card finishes loading
            const media = el.querySelectorAll("img, video")
            media.forEach((node) => {
                if (node instanceof HTMLImageElement) {
                    if (node.complete) return
                    node.addEventListener("load", () => paint(false), { once: true })
                } else if (node instanceof HTMLVideoElement) {
                    node.addEventListener("loadeddata", () => paint(false), { once: true })
                }
            })
        } else {
            cardRefs.current.delete(i)
        }
    }, [paint])

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return
        if ((e.target as HTMLElement).closest("button, a, input, [role='tab']")) return

        const el = stageRef.current
        if (!el || count < 2) return

        stopCommit()
        paint(false)

        const width = Math.max(el.clientWidth * DRAG_DISTANCE_FRACTION, 1)
        dragRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startProgress: progressRef.current,
            width,
        }
        el.setPointerCapture(e.pointerId)
        setDragging(true)
    }

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== e.pointerId) return

        const dx = e.clientX - drag.startX
        const next = drag.startProgress - dx / drag.width
        progressRef.current = clampProgress(next, countRef.current)
        paint(false)
    }

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== e.pointerId) return

        const dx = e.clientX - drag.startX
        const delta = -dx / drag.width

        dragRef.current = null
        setDragging(false)

        try {
            stageRef.current?.releasePointerCapture(e.pointerId)
        } catch {
            /* already released */
        }

        const n = countRef.current
        const base = drag.startProgress
        let target: number
        if (delta > SNAP_DISTANCE_THRESHOLD) target = Math.round(base) + 1
        else if (delta < -SNAP_DISTANCE_THRESHOLD) target = Math.round(base) - 1
        else target = Math.round(base + delta)

        if (!loopRef.current) target = clamp(target, 0, Math.max(0, n - 1))
        snapTo(target)
    }

    if (count === 0) return null

    const atStart = !loop && activeIndex <= 0
    const atEnd = !loop && activeIndex >= count - 1

    return (
        <div className={`flipbook-root relative w-full ${className ?? ""}`.trim()}>
            {/*
              Clip shell is separate from the 3D stage: overflow:hidden on a
              perspective/preserve-3d ancestor often fails to clip filter blur.
            */}
            <div
                ref={stageRef}
                className={`flipbook-clip${dragging ? " is-dragging" : ""}`}
                role="region"
                aria-roledescription="carousel"
                aria-label={ariaLabel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            >
                <div className="flipbook-stage">
                    {cards.map((card, i) => (
                        <div
                            key={card.id}
                            ref={(el) => setCardRef(i, el)}
                            className="flipbook-card"
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${i + 1} of ${count}`}
                        >
                            <div className="flipbook-card-content">
                                {card.content}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {count > 1 && (
                <>
                    <button
                        type="button"
                        className="flipbook-nav flipbook-nav-prev"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation()
                            goBy(-1)
                        }}
                        disabled={atStart}
                        aria-label="Previous"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        className="flipbook-nav flipbook-nav-next"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation()
                            goBy(1)
                        }}
                        disabled={atEnd}
                        aria-label="Next"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>

                    <div
                        className="flex items-center justify-center gap-1.5 mt-2"
                        role="tablist"
                        aria-label="Slides"
                    >
                        {cards.map((card, i) => (
                            <button
                                key={card.id}
                                type="button"
                                role="tab"
                                aria-selected={i === activeIndex}
                                aria-label={`Go to slide ${i + 1}`}
                                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                    i === activeIndex
                                        ? "w-4 bg-brand"
                                        : "w-1.5 bg-border-strong/40 hover:bg-border-strong"
                                }`}
                                onClick={() => goToIndex(i)}
                            />
                        ))}
                    </div>

                    {autoplay && !(atEnd && !loop) && (
                        <div
                            className="flipbook-autoplay-track"
                            role="progressbar"
                            aria-label="Time until next slide"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(autoplayProgress * 100)}
                        >
                            <div
                                className="flipbook-autoplay-fill"
                                style={{ transform: `scaleX(${autoplayProgress})` }}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n))
}

function mod(n: number, m: number) {
    return ((n % m) + m) % m
}

function smoothstep(t: number) {
    return t * t * (3 - 2 * t)
}
