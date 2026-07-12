export const BASIN_WIDTH = 1000;
export const BASIN_HEIGHT = 640;
export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 2.4;
export const COMPACT_FOCUS_ZOOM = 1.68;
export const MAP_EDGE_MARGIN = 48;

export type Point = { x: number; y: number };

export type CameraMetrics = {
  width: number;
  height: number;
  fitScale: number;
};

export type CameraPose = {
  x: number;
  y: number;
  zoom: number;
};

export function cameraMetrics(width: number, height: number): CameraMetrics {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  return {
    width: safeWidth,
    height: safeHeight,
    fitScale:
      safeWidth > 0 && safeHeight > 0
        ? Math.min(safeWidth / BASIN_WIDTH, safeHeight / BASIN_HEIGHT)
        : 0,
  };
}

function axisBounds(container: number, content: number) {
  if (content <= container) {
    const center = (container - content) / 2;
    if (container - content >= MAP_EDGE_MARGIN * 2)
      return { min: center, max: center };
    return {
      min: container - content - MAP_EDGE_MARGIN,
      max: MAP_EDGE_MARGIN,
    };
  }
  return {
    min: container - content - MAP_EDGE_MARGIN,
    max: MAP_EDGE_MARGIN,
  };
}

export function cameraBounds(metrics: CameraMetrics, zoom: number) {
  const totalScale = metrics.fitScale * zoom;
  return {
    x: axisBounds(metrics.width, BASIN_WIDTH * totalScale),
    y: axisBounds(metrics.height, BASIN_HEIGHT * totalScale),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampCamera(
  metrics: CameraMetrics,
  pose: CameraPose,
): CameraPose {
  const zoom = clamp(pose.zoom, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
  const bounds = cameraBounds(metrics, zoom);
  return {
    zoom,
    x: clamp(pose.x, bounds.x.min, bounds.x.max),
    y: clamp(pose.y, bounds.y.min, bounds.y.max),
  };
}

function resist(value: number, min: number, max: number): number {
  if (value < min) return min + (value - min) * 0.18;
  if (value > max) return max + (value - max) * 0.18;
  return value;
}

export function resistCamera(
  metrics: CameraMetrics,
  pose: CameraPose,
): CameraPose {
  const zoom = clamp(pose.zoom, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
  const bounds = cameraBounds(metrics, zoom);
  return {
    zoom,
    x: resist(pose.x, bounds.x.min, bounds.x.max),
    y: resist(pose.y, bounds.y.min, bounds.y.max),
  };
}

export function centeredCamera(
  metrics: CameraMetrics,
  focus: Point | null,
  zoom = focus ? COMPACT_FOCUS_ZOOM : MIN_MAP_ZOOM,
): CameraPose {
  const safeZoom = clamp(zoom, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
  const totalScale = metrics.fitScale * safeZoom;
  const point = focus ?? { x: BASIN_WIDTH / 2, y: BASIN_HEIGHT / 2 };
  return clampCamera(metrics, {
    zoom: safeZoom,
    x: metrics.width / 2 - point.x * totalScale,
    y: metrics.height / 2 - point.y * totalScale,
  });
}

export function worldAt(
  metrics: CameraMetrics,
  pose: CameraPose,
  screenPoint: Point,
): Point {
  const totalScale = metrics.fitScale * pose.zoom;
  if (totalScale <= 0) return { x: BASIN_WIDTH / 2, y: BASIN_HEIGHT / 2 };
  return {
    x: (screenPoint.x - pose.x) / totalScale,
    y: (screenPoint.y - pose.y) / totalScale,
  };
}

export function zoomAround(
  metrics: CameraMetrics,
  pose: CameraPose,
  nextZoom: number,
  screenAnchor: Point,
  withResistance = false,
): CameraPose {
  const anchor = worldAt(metrics, pose, screenAnchor);
  const zoom = clamp(nextZoom, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
  const totalScale = metrics.fitScale * zoom;
  const next = {
    zoom,
    x: screenAnchor.x - anchor.x * totalScale,
    y: screenAnchor.y - anchor.y * totalScale,
  };
  return withResistance
    ? resistCamera(metrics, next)
    : clampCamera(metrics, next);
}

export function resizeCamera(
  previousMetrics: CameraMetrics,
  nextMetrics: CameraMetrics,
  pose: CameraPose,
): CameraPose {
  if (previousMetrics.fitScale <= 0)
    return centeredCamera(nextMetrics, null, pose.zoom);
  const worldCenter = worldAt(previousMetrics, pose, {
    x: previousMetrics.width / 2,
    y: previousMetrics.height / 2,
  });
  const totalScale = nextMetrics.fitScale * pose.zoom;
  return clampCamera(nextMetrics, {
    zoom: pose.zoom,
    x: nextMetrics.width / 2 - worldCenter.x * totalScale,
    y: nextMetrics.height / 2 - worldCenter.y * totalScale,
  });
}

export function poseTransform(
  metrics: CameraMetrics,
  pose: CameraPose,
): string {
  const totalScale = metrics.fitScale * pose.zoom;
  return `translate3d(${pose.x}px, ${pose.y}px, 0) scale(${totalScale})`;
}
