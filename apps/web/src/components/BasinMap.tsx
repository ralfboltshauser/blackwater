import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type {
  BasinView,
  EvidenceView,
  MapEntityView,
  SectorView,
} from "../shared/view-model";
import { PLAYER_COLORS } from "../shared/view-model";
import {
  BASIN_HEIGHT,
  BASIN_WIDTH,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  cameraMetrics,
  centeredCamera,
  clampCamera,
  poseTransform,
  resistCamera,
  resizeCamera,
  worldAt,
  zoomAround,
  type CameraMetrics,
  type CameraPose,
  type Point,
} from "./map-camera";
import "./BasinMap.css";

type BasinMapProps = {
  basin: BasinView;
  selectedSectorId?: number | null;
  reachableSectorIds?: number[];
  focusSectorId?: number | null;
  compact?: boolean;
  privateView?: boolean;
  interactiveCamera?: boolean;
  inspectAllSectors?: boolean;
  onSectorSelect?: (sectorId: number) => void;
};

const spriteByKind: Record<MapEntityView["kind"], string> = {
  ark: "/sprites/ark-dir00.webp",
  submarine: "/sprites/submarine-dir00.webp",
  platform: "/sprites/platform.webp",
  extractor: "/sprites/extractor.webp",
  sonar: "/sprites/sonar.webp",
  laboratory: "/sprites/laboratory.webp",
  snare: "/sprites/snare-armed.webp",
  decoy: "/sprites/decoy-deployed.webp",
  salvage: "/sprites/sample-pod.webp",
  site: "/sprites/deep-site-a.webp",
};

const directionVector: Record<
  NonNullable<EvidenceView["direction"]>,
  { x: number; y: number }
> = {
  n: { x: 0, y: -1 },
  ne: { x: 0.72, y: -0.72 },
  e: { x: 1, y: 0 },
  se: { x: 0.72, y: 0.72 },
  s: { x: 0, y: 1 },
  sw: { x: -0.72, y: 0.72 },
  w: { x: -1, y: 0 },
  nw: { x: -0.72, y: -0.72 },
  still: { x: 0, y: 0 },
  unknown: { x: 0, y: 0 },
};

const CAMERA_TIP_KEY = "blackwater.map-camera-tip.v1";
const PAN_THRESHOLD_PX = 10;

type PointerSample = { x: number; y: number };
type CameraGesture =
  | {
      kind: "pending";
      pointerId: number;
      start: PointerSample;
      last: PointerSample;
    }
  | { kind: "pan"; pointerId: number; last: PointerSample }
  | {
      kind: "pinch";
      pointerIds: [number, number];
      startDistance: number;
      startZoom: number;
      worldAnchor: Point;
    };

function pointDistance(a: PointerSample, b: PointerSample): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointMidpoint(a: PointerSample, b: PointerSample): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function toCanvas(sector: SectorView) {
  return { x: sector.x * 1000, y: sector.y * 640 };
}

function EntityMarker({
  entity,
  position,
  offset,
  color,
}: {
  entity: MapEntityView;
  position: Point;
  offset: { x: number; y: number };
  color: string;
}) {
  const marker = useRef<HTMLDivElement>(null);
  const previousRect = useRef<DOMRect | null>(null);

  useLayoutEffect(() => {
    const node = marker.current;
    if (!node) return;
    const nextRect = node.getBoundingClientRect();
    const previous = previousRect.current;
    const reduceMotion =
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      Boolean(node.closest(".is-reduced-motion"));
    if (previous && !reduceMotion) {
      const deltaX = previous.left - nextRect.left;
      const deltaY = previous.top - nextRect.top;
      if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
        node.getAnimations().forEach((animation) => animation.cancel());
        node.animate(
          [
            {
              transform: `translate3d(${deltaX}px, ${deltaY}px, 0) translate(-50%, -50%)`,
            },
            { transform: "translate3d(0, 0, 0) translate(-50%, -50%)" },
          ],
          { duration: 680, easing: "cubic-bezier(0.77, 0, 0.175, 1)" },
        );
      }
    }
    previousRect.current = nextRect;
  }, [position.x, position.y, offset.x, offset.y]);

  return (
    <div
      ref={marker}
      className={`basin-map__entity basin-map__entity--${entity.kind} basin-map__entity--${entity.state ?? "active"}`}
      style={
        {
          left: position.x,
          top: position.y,
          translate: `${offset.x}px ${offset.y}px`,
          "--entity-color": color,
        } as CSSProperties
      }
      title={entity.label ?? entity.kind}
    >
      <span className="basin-map__entity-ring" />
      <img
        src={entity.sprite ?? spriteByKind[entity.kind]}
        alt=""
        draggable={false}
      />
      {entity.private && (
        <span className="basin-map__private-tag">PRIVATE</span>
      )}
    </div>
  );
}

export function BasinMap({
  basin,
  selectedSectorId,
  reachableSectorIds = [],
  focusSectorId,
  compact = false,
  privateView = false,
  interactiveCamera = false,
  inspectAllSectors = false,
  onSectorSelect,
}: BasinMapProps) {
  const sectorsById = useMemo(
    () => new Map(basin.sectors.map((sector) => [sector.id, sector])),
    [basin.sectors],
  );
  const entityOffsets = useMemo(() => {
    const groups = new Map<number, MapEntityView[]>();
    for (const entity of basin.entities) {
      const list = groups.get(entity.sectorId) ?? [];
      list.push(entity);
      groups.set(entity.sectorId, list);
    }
    return groups;
  }, [basin.entities]);
  const evidenceLayout = useMemo(() => {
    const groups = new Map<number, EvidenceView[]>();
    for (const evidence of basin.evidence) {
      if (evidence.sectorId === undefined || evidence.kind === "wake") continue;
      const list = groups.get(evidence.sectorId) ?? [];
      list.push(evidence);
      groups.set(evidence.sectorId, list);
    }
    const layout = new Map<string, { index: number; count: number }>();
    for (const items of groups.values()) {
      items
        .sort((a, b) => a.id.localeCompare(b.id))
        .forEach((evidence, index) =>
          layout.set(evidence.id, { index, count: items.length }),
        );
    }
    return layout;
  }, [basin.evidence]);

  const rootRef = useRef<HTMLDivElement>(null);
  const metricsRef = useRef<CameraMetrics>(cameraMetrics(0, 0));
  const poseRef = useRef<CameraPose>({ x: 0, y: 0, zoom: MIN_MAP_ZOOM });
  const pointersRef = useRef(new Map<number, PointerSample>());
  const gestureRef = useRef<CameraGesture | null>(null);
  const suppressClickUntil = useRef(0);
  const settleTimer = useRef<number | null>(null);
  const [metrics, setMetrics] = useState(metricsRef.current);
  const [pose, setPose] = useState(poseRef.current);
  const [settling, setSettling] = useState(false);
  const [zoomAnnouncement, setZoomAnnouncement] = useState("");
  const [showCameraTip, setShowCameraTip] = useState(() => {
    if (!interactiveCamera) return false;
    try {
      return localStorage.getItem(CAMERA_TIP_KEY) !== "seen";
    } catch {
      return true;
    }
  });
  const cameraSector = focusSectorId
    ? sectorsById.get(focusSectorId)
    : undefined;
  const focusPoint = cameraSector ? toCanvas(cameraSector) : null;
  const overviewPoint = useMemo(() => {
    if (basin.sectors.length === 0)
      return { x: BASIN_WIDTH / 2, y: BASIN_HEIGHT / 2 };
    const points = basin.sectors.map(toCanvas);
    return {
      x:
        (Math.min(...points.map((point) => point.x)) +
          Math.max(...points.map((point) => point.x))) /
        2,
      y:
        (Math.min(...points.map((point) => point.y)) +
          Math.max(...points.map((point) => point.y))) /
        2,
    };
  }, [basin.sectors]);

  const commitPose = useCallback((next: CameraPose) => {
    poseRef.current = next;
    setPose(next);
  }, []);

  const defaultPose = useCallback(
    (nextMetrics: CameraMetrics) =>
      centeredCamera(
        nextMetrics,
        compact && focusPoint ? focusPoint : overviewPoint,
        compact && focusPoint ? undefined : MIN_MAP_ZOOM,
      ),
    [compact, focusPoint?.x, focusPoint?.y, overviewPoint.x, overviewPoint.y],
  );

  const stopSettling = useCallback(() => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = null;
    setSettling(false);
  }, []);

  const markCameraUsed = useCallback(() => {
    if (!interactiveCamera) return;
    setShowCameraTip(false);
    try {
      localStorage.setItem(CAMERA_TIP_KEY, "seen");
    } catch {
      // The visible controls remain available when storage is unavailable.
    }
  }, [interactiveCamera]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resize = () => {
      const rect = root.getBoundingClientRect();
      const nextMetrics = cameraMetrics(rect.width, rect.height);
      const previousMetrics = metricsRef.current;
      const nextPose =
        previousMetrics.fitScale > 0
          ? resizeCamera(previousMetrics, nextMetrics, poseRef.current)
          : defaultPose(nextMetrics);
      metricsRef.current = nextMetrics;
      poseRef.current = nextPose;
      setMetrics(nextMetrics);
      setPose(nextPose);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    return () => observer.disconnect();
  }, [defaultPose]);

  useEffect(() => {
    if (metricsRef.current.fitScale <= 0) return;
    stopSettling();
    commitPose(defaultPose(metricsRef.current));
  }, [defaultPose, commitPose, stopSettling]);

  useEffect(
    () => () => {
      if (settleTimer.current !== null)
        window.clearTimeout(settleTimer.current);
    },
    [],
  );

  const localPoint = (
    event: Pick<ReactPointerEvent<HTMLDivElement>, "clientX" | "clientY">,
  ): Point => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const beginPinch = () => {
    const entries = [...pointersRef.current.entries()].slice(0, 2) as Array<
      [number, PointerSample]
    >;
    if (entries.length !== 2) return;
    const first = entries[0]!;
    const second = entries[1]!;
    const midpoint = pointMidpoint(first[1], second[1]);
    gestureRef.current = {
      kind: "pinch",
      pointerIds: [first[0], second[0]],
      startDistance: Math.max(1, pointDistance(first[1], second[1])),
      startZoom: poseRef.current.zoom,
      worldAnchor: worldAt(metricsRef.current, poseRef.current, midpoint),
    };
    for (const pointerId of [first[0], second[0]]) {
      try {
        rootRef.current?.setPointerCapture(pointerId);
      } catch {
        // Synthetic accessibility tooling may not create capturable pointers.
      }
    }
    suppressClickUntil.current = Number.POSITIVE_INFINITY;
    markCameraUsed();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !interactiveCamera ||
      (event.target instanceof Element &&
        event.target.closest(".basin-map__controls")) ||
      pointersRef.current.size >= 2
    )
      return;
    stopSettling();
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 2) {
      beginPinch();
      return;
    }
    gestureRef.current = {
      kind: "pending",
      pointerId: event.pointerId,
      start: point,
      last: point,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactiveCamera || !pointersRef.current.has(event.pointerId)) return;
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.kind === "pinch") {
      const first = pointersRef.current.get(gesture.pointerIds[0]);
      const second = pointersRef.current.get(gesture.pointerIds[1]);
      if (!first || !second) return;
      const distance = Math.max(1, pointDistance(first, second));
      const zoom = Math.min(
        MAX_MAP_ZOOM,
        Math.max(
          MIN_MAP_ZOOM,
          gesture.startZoom * (distance / gesture.startDistance),
        ),
      );
      const midpoint = pointMidpoint(first, second);
      const totalScale = metricsRef.current.fitScale * zoom;
      commitPose(
        resistCamera(metricsRef.current, {
          zoom,
          x: midpoint.x - gesture.worldAnchor.x * totalScale,
          y: midpoint.y - gesture.worldAnchor.y * totalScale,
        }),
      );
      return;
    }
    if (gesture.pointerId !== event.pointerId) return;
    if (
      gesture.kind === "pending" &&
      pointDistance(gesture.start, point) <= PAN_THRESHOLD_PX
    )
      return;
    const previous = gesture.kind === "pending" ? gesture.start : gesture.last;
    if (gesture.kind === "pending") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic accessibility tooling may not create a capturable pointer.
      }
    }
    gestureRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      last: point,
    };
    suppressClickUntil.current = Number.POSITIVE_INFINITY;
    markCameraUsed();
    commitPose(
      resistCamera(metricsRef.current, {
        ...poseRef.current,
        x: poseRef.current.x + point.x - previous.x,
        y: poseRef.current.y + point.y - previous.y,
      }),
    );
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture?.kind !== "pending" || gesture.pointerId !== event.pointerId)
      return;
    pointersRef.current.delete(event.pointerId);
    gestureRef.current = null;
  };

  const settleCamera = () => {
    const next = clampCamera(metricsRef.current, poseRef.current);
    if (next.x === poseRef.current.x && next.y === poseRef.current.y) return;
    setSettling(true);
    commitPose(next);
    settleTimer.current = window.setTimeout(() => {
      setSettling(false);
      settleTimer.current = null;
    }, 220);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const wasClaimed = gestureRef.current?.kind !== "pending";
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // The browser may already have released a cancelled pointer.
      }
    }
    if (pointersRef.current.size === 1 && wasClaimed) {
      const remaining = [...pointersRef.current.entries()][0]!;
      gestureRef.current = {
        kind: "pan",
        pointerId: remaining[0],
        last: remaining[1],
      };
      return;
    }
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      if (wasClaimed) {
        suppressClickUntil.current = performance.now() + 400;
        settleCamera();
      }
    }
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest(".basin-map__controls")
    )
      return;
    if (event.detail > 0 && performance.now() < suppressClickUntil.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil.current = 0;
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!interactiveCamera) return;
    event.preventDefault();
    stopSettling();
    const anchor = localPoint(event);
    const zoom = poseRef.current.zoom * Math.exp(-event.deltaY * 0.002);
    commitPose(
      zoomAround(metricsRef.current, poseRef.current, zoom, anchor, false),
    );
    markCameraUsed();
  };

  const announceZoom = (next: CameraPose) => {
    setZoomAnnouncement(`Map zoom ${Math.round(next.zoom * 100)} percent`);
  };

  const adjustZoom = (factor: number) => {
    stopSettling();
    const next = zoomAround(
      metricsRef.current,
      poseRef.current,
      poseRef.current.zoom * factor,
      { x: metricsRef.current.width / 2, y: metricsRef.current.height / 2 },
    );
    commitPose(next);
    announceZoom(next);
    markCameraUsed();
  };

  const resetCamera = () => {
    stopSettling();
    const next = defaultPose(metricsRef.current);
    commitPose(next);
    announceZoom(next);
    markCameraUsed();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!interactiveCamera || event.target !== event.currentTarget) return;
    let next: CameraPose | null = null;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      adjustZoom(1.2);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      adjustZoom(1 / 1.2);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      resetCamera();
      return;
    }
    if (event.key === "ArrowLeft")
      next = { ...poseRef.current, x: poseRef.current.x + 40 };
    if (event.key === "ArrowRight")
      next = { ...poseRef.current, x: poseRef.current.x - 40 };
    if (event.key === "ArrowUp")
      next = { ...poseRef.current, y: poseRef.current.y + 40 };
    if (event.key === "ArrowDown")
      next = { ...poseRef.current, y: poseRef.current.y - 40 };
    if (!next) return;
    event.preventDefault();
    stopSettling();
    commitPose(clampCamera(metricsRef.current, next));
    markCameraUsed();
  };

  const totalScale = metrics.fitScale * pose.zoom;
  const cameraStyle = {
    transform: poseTransform(metrics, pose),
    opacity: metrics.fitScale > 0 ? 1 : 0,
    "--camera-inverse-scale": String(totalScale > 0 ? 1 / totalScale : 1),
    "--camera-label-offset": `${totalScale > 0 ? 17 / totalScale : 17}px`,
  } as CSSProperties;
  const overlayPosition = (sector: SectorView): Point => ({
    x: sector.x * BASIN_WIDTH,
    y: sector.y * BASIN_HEIGHT,
  });

  return (
    <div
      ref={rootRef}
      className={`basin-map ${compact ? "basin-map--compact" : ""} ${privateView ? "basin-map--private" : ""} ${interactiveCamera ? "basin-map--interactive" : ""}`}
      role={interactiveCamera ? "region" : undefined}
      tabIndex={interactiveCamera ? 0 : undefined}
      aria-label={
        interactiveCamera
          ? "Interactive basin map. Drag to pan. Pinch or use the controls to zoom."
          : undefined
      }
      data-settling={settling || undefined}
      data-camera-zoom={pose.zoom.toFixed(2)}
      data-zoomed={pose.zoom >= 1.95 || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onClickCapture={handleClickCapture}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
    >
      <div className="basin-map__water" aria-hidden="true" />
      <div className="basin-map__camera" style={cameraStyle}>
        <svg
          className="basin-map__svg"
          viewBox={`0 0 ${BASIN_WIDTH} ${BASIN_HEIGHT}`}
          preserveAspectRatio="none"
          role={onSectorSelect ? "group" : "img"}
          aria-label="Blackwater basin map"
        >
          <defs>
            <filter
              id="softGlow"
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
            >
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id="wakeArrow"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          <g className="basin-map__regions" aria-hidden="true">
            <path d="M20 0H980L930 210 40 195Z" className="shelf" />
            <path d="m40 195 890 15 32 210L20 405Z" className="rift" />
            <path d="m20 405 942 15L1000 640H0Z" className="blackwater" />
          </g>
          <g className="basin-map__connections" aria-hidden="true">
            {basin.connections.map(([a, b]) => {
              const start = sectorsById.get(a);
              const end = sectorsById.get(b);
              if (!start || !end) return null;
              const p1 = toCanvas(start);
              const p2 = toCanvas(end);
              return (
                <line
                  key={`${a}-${b}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                />
              );
            })}
          </g>
          <g className="basin-map__evidence" aria-hidden="true">
            {basin.evidence.map((evidence) => {
              if (evidence.kind === "wake") {
                const start = evidence.fromSectorId
                  ? sectorsById.get(evidence.fromSectorId)
                  : evidence.sectorId
                    ? sectorsById.get(evidence.sectorId)
                    : undefined;
                const explicitEnd = evidence.toSectorId
                  ? sectorsById.get(evidence.toSectorId)
                  : undefined;
                if (!start) return null;
                const p1 = toCanvas(start);
                const vector = directionVector[evidence.direction ?? "unknown"];
                const p2 = explicitEnd
                  ? toCanvas(explicitEnd)
                  : { x: p1.x + vector.x * 54, y: p1.y + vector.y * 54 };
                const opacity = Math.max(0.25, 1 - (evidence.age ?? 0) * 0.28);
                const hasHeading =
                  Boolean(explicitEnd) || vector.x !== 0 || vector.y !== 0;
                return (
                  <path
                    key={evidence.id}
                    style={{ opacity }}
                    d={`M${p1.x} ${p1.y} Q${(p1.x + p2.x) / 2} ${(p1.y + p2.y) / 2 - 10} ${p2.x} ${p2.y}`}
                    markerEnd={hasHeading ? "url(#wakeArrow)" : undefined}
                  />
                );
              }
              const sector = evidence.sectorId
                ? sectorsById.get(evidence.sectorId)
                : undefined;
              if (!sector) return null;
              const p = toCanvas(sector);
              const layout = evidenceLayout.get(evidence.id) ?? {
                index: 0,
                count: 1,
              };
              if (layout.index >= 4) return null;
              const angle =
                (Math.PI * 2 * layout.index) / Math.min(4, layout.count) -
                Math.PI / 2;
              const spread = layout.count === 1 ? 0 : 22;
              const dx = 24 + Math.cos(angle) * spread;
              const dy = -25 + Math.sin(angle) * spread;
              return (
                <g
                  key={evidence.id}
                  transform={`translate(${p.x + dx} ${p.y + dy})`}
                  className={`basin-map__contact basin-map__contact--${evidence.kind}`}
                  style={
                    evidence.ownerColor
                      ? { color: PLAYER_COLORS[evidence.ownerColor] }
                      : undefined
                  }
                >
                  <circle r="15" />
                  <circle r="9" />
                  {evidence.kind === "identified" && (
                    <path d="M-4 0 0-5 4 0 0 5Z" />
                  )}
                  {layout.index === 0 && layout.count > 4 && (
                    <text x="13" y="-11">
                      +{layout.count - 4}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          <g className="basin-map__nodes">
            {basin.sectors.map((sector) => {
              const p = toCanvas(sector);
              const selected = selectedSectorId === sector.id;
              const reachable = reachableSectorIds.includes(sector.id);
              const selectable = inspectAllSectors || reachable;
              return (
                <g
                  key={sector.id}
                  transform={`translate(${p.x} ${p.y})`}
                  className={`basin-map__node ${selected ? "is-selected" : ""} ${reachable ? "is-reachable" : ""} ${sector.deepSite ? "is-deep" : ""} ${sector.dominionObjective ? "is-dominion" : ""}`}
                >
                  {(selected || reachable) && (
                    <circle
                      className="basin-map__selection"
                      r={selected ? 27 : 23}
                    />
                  )}
                  <circle
                    className="basin-map__node-halo"
                    r={sector.deepSite ? 18 : 13}
                  />
                  <circle
                    className="basin-map__node-core"
                    r={sector.deepSite ? 9 : 6}
                  />
                  {sector.dominionObjective && (
                    <path
                      className="basin-map__dominion"
                      d="M0-28 28 0 0 28-28 0Z"
                    />
                  )}
                  {sector.deepSite && sector.specimenStock && (
                    <path
                      className="basin-map__stock"
                      d="M-4-18h8l4 7-4 7h-8l-4-7Z"
                    />
                  )}
                  {onSectorSelect && (
                    <foreignObject
                      x="-57"
                      y="-10"
                      width="114"
                      height="74"
                      className="basin-map__sector-fo"
                    >
                      <button
                        type="button"
                        className="basin-map__sector-hit"
                        disabled={!selectable}
                        onClick={() => onSectorSelect(sector.id)}
                        aria-pressed={selected}
                        aria-label={`Sector ${sector.id}, ${sector.name}${sector.deepSite ? ", Deep Site" : ""}${sector.dominionObjective ? ", Dominion objective" : ""}`}
                      />
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="basin-map__labels" aria-hidden="true">
          {basin.sectors.map((sector) => (
            <div
              key={sector.id}
              className="basin-map__label"
              style={{
                left: overlayPosition(sector).x,
                top: overlayPosition(sector).y,
              }}
            >
              <b>S{String(sector.id).padStart(2, "0")}</b>
              <span>{sector.name}</span>
            </div>
          ))}
        </div>
        <div className="basin-map__entities" aria-hidden="true">
          {Array.from(entityOffsets.entries()).flatMap(
            ([sectorId, entities]) => {
              const sector = sectorsById.get(sectorId);
              if (!sector) return [];
              return entities.map((entity, index) => {
                const count = entities.length;
                const angle =
                  count === 1
                    ? -Math.PI / 2
                    : (Math.PI * 2 * index) / count - Math.PI / 2;
                const radius = count === 1 ? 28 : Math.min(43, 24 + count * 3);
                const dx = Math.cos(angle) * radius;
                const dy = Math.sin(angle) * radius * 0.65;
                const color = entity.ownerColor
                  ? PLAYER_COLORS[entity.ownerColor]
                  : "#d7c1a1";
                return (
                  <EntityMarker
                    key={entity.id}
                    entity={entity}
                    position={overlayPosition(sector)}
                    offset={{ x: dx, y: dy }}
                    color={color}
                  />
                );
              });
            },
          )}
        </div>
      </div>
      {interactiveCamera && (
        <>
          {showCameraTip && (
            <div className="basin-map__coach" aria-hidden="true">
              <span>↔</span>
              <div>
                <b>Move the map</b>
                <small>Drag to pan · pinch to zoom</small>
              </div>
            </div>
          )}
          <div
            className="basin-map__controls"
            aria-label="Map zoom controls"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Zoom out"
              disabled={pose.zoom <= MIN_MAP_ZOOM + 0.01}
              onClick={() => adjustZoom(1 / 1.22)}
            >
              −
            </button>
            <output aria-label="Current map zoom">
              {Math.round(pose.zoom * 100)}%
            </output>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={pose.zoom >= MAX_MAP_ZOOM - 0.01}
              onClick={() => adjustZoom(1.22)}
            >
              +
            </button>
            <button type="button" aria-label="Reset map" onClick={resetCamera}>
              ⌾
            </button>
          </div>
          <span className="sr-only" aria-live="polite">
            {zoomAnnouncement}
          </span>
        </>
      )}
    </div>
  );
}
