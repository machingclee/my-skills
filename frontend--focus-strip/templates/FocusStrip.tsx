import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import "./focus-strip.css";

export const MIN_STRIP = 10;
export const MAX_STRIP = 640;
export const DEFAULT_STRIP = 160;
export const STRIP_STEP = 12;
export const MIN_BLUR = 0;
export const MAX_BLUR = 25;
export const DEFAULT_BLUR = 5;

type FocusStripApi = {
  disabled: boolean;
  focusMode: boolean;
  height: number;
  minHeight: number;
  maxHeight: number;
  blurRadius: number;
  minBlurRadius: number;
  maxBlurRadius: number;
  unit: string;
  toggleFocusMode: () => void;
  setFocusMode: (on: boolean) => void;
  setHeight: (next: number) => void;
  setBlurRadius: (next: number) => void;
};

type DragLock = {
  holeTop: number;
  holeHeight: number;
};

type InternalApi = FocusStripApi & {
  scale: number;
  shortcuts: boolean;
  parkOnDoubleClick: boolean;
  stageRef: MutableRefObject<HTMLDivElement | null>;
  scrollerRef: MutableRefObject<HTMLElement | null>;
  overlayRef: MutableRefObject<HTMLDivElement | null>;
  parkedCenterYRef: MutableRefObject<number | null>;
  cursorRef: MutableRefObject<{ x: number; y: number } | null>;
  heightRef: MutableRefObject<number>;
  scaleRef: MutableRefObject<number>;
  dragLockRef: MutableRefObject<DragLock | null>;
  layoutFocusOverlay: () => void;
  parkAtPoint: (clientX: number, clientY: number, target: EventTarget | null) => boolean;
  nudgeFocusStrip: (deltaY: number) => void;
  commitParkedCenterY: (y: number) => void;
};

const FocusStripContext = createContext<InternalApi | null>(null);

export function useFocusStrip(): FocusStripApi {
  const api = useContext(FocusStripContext);
  if (!api) {
    throw new Error("useFocusStrip must be used inside <FocusStrip> or <FocusStripProvider>");
  }
  const {
    disabled,
    focusMode,
    height,
    minHeight,
    maxHeight,
    blurRadius,
    minBlurRadius,
    maxBlurRadius,
    unit,
    toggleFocusMode,
    setFocusMode,
    setHeight,
    setBlurRadius,
  } = api;
  return {
    disabled,
    focusMode,
    height,
    minHeight,
    maxHeight,
    blurRadius,
    minBlurRadius,
    maxBlurRadius,
    unit,
    toggleFocusMode,
    setFocusMode,
    setHeight,
    setBlurRadius,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stripScreenPx(height: number, scale: number): number {
  return height * scale;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

export type FocusStripProviderProps = {
  children: ReactNode;
  /** Disable the toolbox and shortcuts (e.g. nothing loaded yet). */
  disabled?: boolean;
  /** Controlled strip height in content units (1 unit = 1 CSS px at scale 1). */
  height?: number;
  defaultHeight?: number;
  onHeightChange?: (height: number) => void;
  minHeight?: number;
  maxHeight?: number;
  /** Multiply height to get on-screen CSS px. Pass zoom from a PDF/canvas viewer. */
  scale?: number;
  /** Label next to the height readout (`px`, `pt`, …). */
  unit?: string;
  defaultFocusMode?: boolean;
  onFocusChange?: (on: boolean) => void;
  shortcuts?: boolean;
  /** Double-click parks and enables. Default false — too easy to trigger on the web. */
  parkOnDoubleClick?: boolean;
  /** Persist height to localStorage under this key. */
  storageKey?: string;
  blurRadius?: number;
  defaultBlurRadius?: number;
  onBlurRadiusChange?: (radius: number) => void;
  minBlurRadius?: number;
  maxBlurRadius?: number;
  /** Persist veil blur radius (px) to localStorage under this key. */
  blurStorageKey?: string;
  parkedCenterY?: number | null;
  defaultParkedCenterY?: number | null;
  onParkedCenterYChange?: (y: number | null) => void;
};

export function FocusStripProvider({
  children,
  disabled = false,
  height: heightProp,
  defaultHeight = DEFAULT_STRIP,
  onHeightChange,
  minHeight = MIN_STRIP,
  maxHeight = MAX_STRIP,
  scale = 1,
  unit = "px",
  defaultFocusMode = false,
  onFocusChange,
  shortcuts = true,
  parkOnDoubleClick = false,
  storageKey,
  blurRadius: blurRadiusProp,
  defaultBlurRadius = DEFAULT_BLUR,
  onBlurRadiusChange,
  minBlurRadius = MIN_BLUR,
  maxBlurRadius = MAX_BLUR,
  blurStorageKey,
  parkedCenterY: parkedCenterYProp,
  defaultParkedCenterY = null,
  onParkedCenterYChange,
}: FocusStripProviderProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragLockRef = useRef<DragLock | null>(null);
  const parkedCenterYRef = useRef<number | null>(
    parkedCenterYProp !== undefined ? parkedCenterYProp : defaultParkedCenterY,
  );
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const nudgeRef = useRef<(deltaY: number) => void>(() => {});

  const readStoredHeight = () => {
    if (!storageKey || typeof window === "undefined") return defaultHeight;
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw == null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? clamp(parsed, minHeight, maxHeight) : defaultHeight;
  };

  const readStoredBlur = () => {
    if (!blurStorageKey || typeof window === "undefined") return defaultBlurRadius;
    const raw = window.localStorage.getItem(blurStorageKey);
    const parsed = raw == null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? clamp(parsed, minBlurRadius, maxBlurRadius) : defaultBlurRadius;
  };

  const [uncontrolledHeight, setUncontrolledHeight] = useState(readStoredHeight);
  const [uncontrolledBlur, setUncontrolledBlur] = useState(readStoredBlur);
  const [focusMode, setFocusModeState] = useState(defaultFocusMode);

  const height = heightProp ?? uncontrolledHeight;
  const blurRadius = blurRadiusProp ?? uncontrolledBlur;
  const heightRef = useRef(height);
  const scaleRef = useRef(scale);
  const focusModeRef = useRef(focusMode);
  heightRef.current = height;
  scaleRef.current = scale;
  focusModeRef.current = focusMode;

  const setHeight = useCallback(
    (next: number) => {
      const clamped = clamp(next, minHeight, maxHeight);
      if (heightProp == null) setUncontrolledHeight(clamped);
      onHeightChange?.(clamped);
    },
    [heightProp, maxHeight, minHeight, onHeightChange],
  );

  const setBlurRadius = useCallback(
    (next: number) => {
      const clamped = clamp(next, minBlurRadius, maxBlurRadius);
      if (blurRadiusProp == null) setUncontrolledBlur(clamped);
      onBlurRadiusChange?.(clamped);
    },
    [blurRadiusProp, maxBlurRadius, minBlurRadius, onBlurRadiusChange],
  );

  const setFocusMode = useCallback(
    (on: boolean) => {
      setFocusModeState(on);
      onFocusChange?.(on);
    },
    [onFocusChange],
  );

  useEffect(() => {
    if (!storageKey || heightProp != null) return;
    window.localStorage.setItem(storageKey, String(height));
  }, [height, heightProp, storageKey]);

  useEffect(() => {
    if (!blurStorageKey || blurRadiusProp != null) return;
    window.localStorage.setItem(blurStorageKey, String(blurRadius));
  }, [blurRadius, blurRadiusProp, blurStorageKey]);

  const commitParkedCenterY = useCallback(
    (y: number) => {
      parkedCenterYRef.current = y;
      onParkedCenterYChange?.(y);
    },
    [onParkedCenterYChange],
  );

  useLayoutEffect(() => {
    if (parkedCenterYProp === undefined) return;
    if (dragLockRef.current) return;
    parkedCenterYRef.current = parkedCenterYProp;
  }, [parkedCenterYProp]);

  const layoutFocusOverlay = useCallback(() => {
    const stage = stageRef.current;
    const overlay = overlayRef.current;
    if (!stage || !overlay) return;
    const stageRect = stage.getBoundingClientRect();
    const drag = dragLockRef.current;
    if (drag) {
      overlay.style.setProperty("--hole-top", `${drag.holeTop}px`);
      overlay.style.setProperty("--hole-height", `${drag.holeHeight}px`);
      return;
    }
    const hole = stripScreenPx(heightRef.current, scaleRef.current);
    const centerY = parkedCenterYRef.current ?? stageRect.height / 2;
    overlay.style.setProperty("--hole-top", `${centerY - hole / 2}px`);
    overlay.style.setProperty("--hole-height", `${hole}px`);
  }, []);

  const parkAtPoint = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      if (disabled) return false;
      const scroller = scrollerRef.current;
      if (!scroller) return false;
      if (target instanceof Element) {
        if (target.closest(".focus-strip-toolbox")) return false;
        const overlay = overlayRef.current;
        const inOverlay = overlay?.contains(target) ?? false;
        if (!inOverlay && !scroller.contains(target) && target !== scroller) return false;
      }
      cursorRef.current = { x: clientX, y: clientY };
      const stage = stageRef.current;
      if (stage) {
        commitParkedCenterY(clientY - stage.getBoundingClientRect().top);
      }
      window.getSelection()?.removeAllRanges();
      setFocusMode(true);
      layoutFocusOverlay();
      requestAnimationFrame(() => layoutFocusOverlay());
      return true;
    },
    [commitParkedCenterY, disabled, layoutFocusOverlay, setFocusMode],
  );

  const toggleFocusMode = useCallback(() => {
    if (disabled) return;
    if (focusModeRef.current) {
      setFocusMode(false);
      return;
    }
    const stage = stageRef.current;
    const rect = stage?.getBoundingClientRect();
    const y = cursorRef.current?.y ?? (rect ? rect.top + rect.height / 2 : 0);
    if (parkedCenterYRef.current == null && rect) {
      commitParkedCenterY(y - rect.top);
    }
    setFocusMode(true);
  }, [commitParkedCenterY, disabled, setFocusMode]);

  const nudgeFocusStrip = useCallback(
    (deltaY: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      const stageRect = stage.getBoundingClientRect();
      const current = parkedCenterYRef.current ?? stageRect.height / 2;
      commitParkedCenterY(current + deltaY);
      layoutFocusOverlay();
    },
    [commitParkedCenterY, layoutFocusOverlay],
  );
  nudgeRef.current = nudgeFocusStrip;

  useEffect(() => {
    if (!shortcuts || disabled) return;
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (focusModeRef.current && event.key === "Escape") {
        event.preventDefault();
        setFocusMode(false);
        return;
      }
      if (event.key.toLowerCase() === "f" && !meta && !event.altKey) {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        toggleFocusMode();
        return;
      }
      if (
        event.code === "BracketLeft" ||
        event.code === "BracketRight" ||
        event.key === "[" ||
        event.key === "]"
      ) {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        const direction = event.code === "BracketRight" || event.key === "]" ? 1 : -1;
        const step = event.altKey ? 1 : STRIP_STEP * (event.shiftKey ? 3 : 1) * (meta ? 3 : 1);
        setHeight(heightRef.current + direction * step);
        return;
      }
      if (focusModeRef.current && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        const distance = event.altKey ? 1 : stripScreenPx(heightRef.current, scaleRef.current);
        nudgeRef.current((event.key === "ArrowDown" ? 1 : -1) * distance);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [disabled, setFocusMode, setHeight, shortcuts, toggleFocusMode]);

  const api = useMemo<InternalApi>(
    () => ({
      disabled,
      focusMode,
      height,
      minHeight,
      maxHeight,
      blurRadius,
      minBlurRadius,
      maxBlurRadius,
      unit,
      scale,
      shortcuts,
      parkOnDoubleClick,
      toggleFocusMode,
      setFocusMode,
      setHeight,
      setBlurRadius,
      stageRef,
      scrollerRef,
      overlayRef,
      parkedCenterYRef,
      cursorRef,
      heightRef,
      scaleRef,
      dragLockRef,
      layoutFocusOverlay,
      parkAtPoint,
      nudgeFocusStrip,
      commitParkedCenterY,
    }),
    [
      blurRadius,
      commitParkedCenterY,
      disabled,
      focusMode,
      height,
      layoutFocusOverlay,
      maxBlurRadius,
      maxHeight,
      minBlurRadius,
      minHeight,
      nudgeFocusStrip,
      parkAtPoint,
      parkOnDoubleClick,
      scale,
      setBlurRadius,
      setFocusMode,
      setHeight,
      shortcuts,
      toggleFocusMode,
      unit,
    ],
  );

  return <FocusStripContext.Provider value={api}>{children}</FocusStripContext.Provider>;
}

export function FocusStripToolbox({
  className,
  focusLabel = "Focus",
  stripLabel = "Strip",
  blurLabel = "Blur",
}: {
  className?: string;
  focusLabel?: string;
  stripLabel?: string;
  blurLabel?: string;
}) {
  const {
    disabled,
    focusMode,
    height,
    minHeight,
    maxHeight,
    blurRadius,
    minBlurRadius,
    maxBlurRadius,
    unit,
    toggleFocusMode,
    setHeight,
    setBlurRadius,
  } = useFocusStrip();
  return (
    <div className={["focus-strip-toolbox", className].filter(Boolean).join(" ")}>
      <button
        type="button"
        className={focusMode ? "active" : undefined}
        onClick={toggleFocusMode}
        aria-pressed={focusMode}
        aria-label={focusLabel}
        disabled={disabled}
      >
        {focusLabel}
      </button>
      <label
        className="focus-strip-height"
        title="Height in content units. 1 unit is 1 CSS pixel at scale 1."
      >
        <span>{stripLabel}</span>
        <input
          type="range"
          min={minHeight}
          max={maxHeight}
          value={Math.round(height)}
          disabled={disabled}
          aria-label={stripLabel}
          onChange={(event) => setHeight(Number(event.target.value))}
        />
        <output className="focus-strip-readout">
          {Math.round(height)} {unit}
        </output>
      </label>
      <label
        className="focus-strip-height"
        title="Backdrop blur on the veil outside the reading strip."
      >
        <span>{blurLabel}</span>
        <input
          type="range"
          min={minBlurRadius}
          max={maxBlurRadius}
          value={Math.round(blurRadius)}
          disabled={disabled}
          aria-label={blurLabel}
          onChange={(event) => setBlurRadius(Number(event.target.value))}
        />
        <output className="focus-strip-readout">
          {Math.round(blurRadius)} px
        </output>
      </label>
    </div>
  );
}

export function FocusStripViewport({
  children,
  className,
  scrollerRef: scrollerRefProp,
}: {
  children: ReactNode;
  className?: string;
  /** Use an existing scrollport instead of the built-in one (e.g. a PDF scroller). */
  scrollerRef?: RefObject<HTMLElement | null>;
}) {
  const api = useContext(FocusStripContext);
  if (!api) {
    throw new Error("FocusStripViewport must be used inside <FocusStrip> or <FocusStripProvider>");
  }

  const {
    focusMode,
    blurRadius,
    parkOnDoubleClick,
    stageRef,
    scrollerRef,
    overlayRef,
    cursorRef,
    heightRef,
    scaleRef,
    dragLockRef,
    layoutFocusOverlay,
    parkAtPoint,
    commitParkedCenterY,
  } = api;

  const setStage = useCallback(
    (node: HTMLDivElement | null) => {
      stageRef.current = node;
    },
    [stageRef],
  );

  const setScroller = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerRef.current = scrollerRefProp?.current ?? node;
    },
    [scrollerRef, scrollerRefProp],
  );

  useLayoutEffect(() => {
    if (scrollerRefProp?.current) scrollerRef.current = scrollerRefProp.current;
  });

  useLayoutEffect(() => {
    if (focusMode) layoutFocusOverlay();
  }, [focusMode, layoutFocusOverlay, api.height, api.scale]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const relayout = () => layoutFocusOverlay();
    const observer = new ResizeObserver(relayout);
    observer.observe(stage);
    window.addEventListener("resize", relayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", relayout);
    };
  }, [layoutFocusOverlay, stageRef]);

  useEffect(() => {
    if (!parkOnDoubleClick) return;
    const stage = stageRef.current;
    if (!stage) return;
    let suppressSelection = false;
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        suppressSelection = false;
        return;
      }
      const target = event.target;
      const inChrome = target instanceof Element && target.closest(".focus-strip-toolbox");
      suppressSelection = event.detail >= 2 && !inChrome;
      if (!suppressSelection) return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      parkAtPoint(event.clientX, event.clientY, event.target);
    };
    const onSelectStart = (event: Event) => {
      if (!suppressSelection) return;
      event.preventDefault();
    };
    stage.addEventListener("mousedown", onMouseDown, true);
    stage.addEventListener("selectstart", onSelectStart, true);
    return () => {
      stage.removeEventListener("mousedown", onMouseDown, true);
      stage.removeEventListener("selectstart", onSelectStart, true);
    };
  }, [parkAtPoint, parkOnDoubleClick, stageRef]);

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    cursorRef.current = { x: event.clientX, y: event.clientY };
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!parkOnDoubleClick) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    parkAtPoint(event.clientX, event.clientY, event.target);
  };

  const onStripDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".focus-strip-edge")) return;
    const overlay = overlayRef.current;
    const stage = stageRef.current;
    if (!overlay || !stage) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("dragging");

    const startTop = Number.parseFloat(overlay.style.getPropertyValue("--hole-top")) || 0;
    const holeHeight =
      Number.parseFloat(overlay.style.getPropertyValue("--hole-height")) ||
      stripScreenPx(heightRef.current, scaleRef.current);
    const startPointerY = event.clientY;
    dragLockRef.current = { holeTop: startTop, holeHeight };

    const onMove = (move: PointerEvent) => {
      const nextTop = startTop + (move.clientY - startPointerY);
      dragLockRef.current = { holeTop: nextTop, holeHeight };
      cursorRef.current = { x: move.clientX, y: move.clientY };
      layoutFocusOverlay();
    };
    const onUp = () => {
      const lock = dragLockRef.current;
      commitParkedCenterY((lock?.holeTop ?? startTop) + holeHeight / 2);
      dragLockRef.current = null;
      handle.classList.remove("dragging");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      layoutFocusOverlay();
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const onEdgeResize = (edge: "top" | "bottom") => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const overlay = overlayRef.current;
    const stage = stageRef.current;
    if (!overlay || !stage) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("dragging");
    overlay.classList.add("resizing");

    const startTop = Number.parseFloat(overlay.style.getPropertyValue("--hole-top")) || 0;
    const startHeight =
      Number.parseFloat(overlay.style.getPropertyValue("--hole-height")) ||
      stripScreenPx(heightRef.current, scaleRef.current);
    const startBottom = startTop + startHeight;
    const startPointerY = event.clientY;
    const grabbedEdgeY = stage.getBoundingClientRect().top + (edge === "top" ? startTop : startBottom);
    const grabOffset = startPointerY - grabbedEdgeY;
    const scale = scaleRef.current || 1;
    const minHole = api.minHeight * scale;
    const maxHole = api.maxHeight * scale;
    dragLockRef.current = { holeTop: startTop, holeHeight: startHeight };

    const applyHole = (clientX: number, clientY: number, commit: boolean) => {
      const stageRect = stage.getBoundingClientRect();
      const y = clientY - grabOffset - stageRect.top;
      let newTop = startTop;
      let newHole = startHeight;
      if (edge === "top") {
        newHole = clamp(startBottom - y, minHole, maxHole);
        newTop = startBottom - newHole;
      } else {
        newHole = clamp(y - startTop, minHole, maxHole);
        newTop = startTop;
      }
      const nextHeight = newHole / scale;
      heightRef.current = nextHeight;
      api.setHeight(nextHeight);
      dragLockRef.current = { holeTop: newTop, holeHeight: newHole };
      cursorRef.current = { x: clientX, y: clientY };
      if (commit) commitParkedCenterY(newTop + newHole / 2);
      layoutFocusOverlay();
    };

    const onMove = (move: PointerEvent) => applyHole(move.clientX, move.clientY, false);
    const onUp = (up: PointerEvent) => {
      applyHole(up.clientX, up.clientY, true);
      dragLockRef.current = null;
      handle.classList.remove("dragging");
      overlay.classList.remove("resizing");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      layoutFocusOverlay();
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const scroller = (
    <div className="focus-strip-scroller" ref={scrollerRefProp ? undefined : setScroller}>
      {children}
    </div>
  );

  return (
    <div
      className={["focus-strip-viewport", className].filter(Boolean).join(" ")}
      ref={setStage}
      onPointerMove={onPointerMove}
      onDoubleClick={onDoubleClick}
    >
      {scrollerRefProp ? children : scroller}
      {focusMode && (
        <div
          className="focus-strip-overlay"
          ref={overlayRef}
          style={{ ["--focus-strip-blur" as string]: `${blurRadius}px` }}
        >
          <div className="focus-strip-mask" aria-hidden />
          <div
            className="focus-strip-band"
            onPointerDown={onStripDrag}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Move reading strip"
          >
            <div
              className="focus-strip-edge focus-strip-edge-top"
              onPointerDown={onEdgeResize("top")}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize reading strip from top"
            />
            <div
              className="focus-strip-edge focus-strip-edge-bottom"
              onPointerDown={onEdgeResize("bottom")}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize reading strip from bottom"
            />
          </div>
          <div className="focus-strip-mask" aria-hidden />
        </div>
      )}
    </div>
  );
}

export type FocusStripProps = FocusStripProviderProps & {
  className?: string;
  /** Render the Focus / Strip / Blur toolbox above the viewport. Default true. */
  toolbox?: boolean;
  toolboxClassName?: string;
  viewportClassName?: string;
  /** Existing scrollport. When set, children are not wrapped in an inner scroller. */
  scrollerRef?: RefObject<HTMLElement | null>;
};

/**
 * Parked reading strip: a horizontal window stays locked to a fixed
 * viewport Y. The page scrolls underneath. Enable with Focus / F.
 * Does not follow the cursor.
 */
export default function FocusStrip({
  children,
  className,
  toolbox = true,
  toolboxClassName,
  viewportClassName,
  scrollerRef,
  ...providerProps
}: FocusStripProps) {
  return (
    <FocusStripProvider {...providerProps}>
      <div className={["focus-strip", className].filter(Boolean).join(" ")}>
        {toolbox && <FocusStripToolbox className={toolboxClassName} />}
        <FocusStripViewport className={viewportClassName} scrollerRef={scrollerRef}>
          {children}
        </FocusStripViewport>
      </div>
    </FocusStripProvider>
  );
}
