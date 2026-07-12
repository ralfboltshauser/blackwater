import { describe, expect, it } from "vitest";
import {
  BASIN_HEIGHT,
  BASIN_WIDTH,
  MAX_MAP_ZOOM,
  MAP_EDGE_MARGIN,
  cameraBounds,
  cameraMetrics,
  centeredCamera,
  clampCamera,
  resistCamera,
  resizeCamera,
  worldAt,
  zoomAround,
} from "./map-camera";

describe("basin map camera geometry", () => {
  it("fits the full stage without stretching in wide and tall containers", () => {
    expect(cameraMetrics(844, 300).fitScale).toBeCloseTo(300 / BASIN_HEIGHT);
    expect(cameraMetrics(300, 844).fitScale).toBeCloseTo(300 / BASIN_WIDTH);
  });

  it("centers a focused sector while respecting edge bounds", () => {
    const metrics = cameraMetrics(420, 240);
    const middle = centeredCamera(metrics, { x: 500, y: 320 });
    expect(worldAt(metrics, middle, { x: 210, y: 120 })).toEqual({
      x: 500,
      y: 320,
    });
    const edge = centeredCamera(metrics, { x: 0, y: 0 });
    const bounds = cameraBounds(metrics, edge.zoom);
    expect(edge.x).toBe(bounds.x.max);
    expect(edge.y).toBe(bounds.y.max);
  });

  it("keeps the world point beneath the finger fixed while zooming", () => {
    const metrics = cameraMetrics(520, 300);
    const pose = centeredCamera(metrics, { x: 280, y: 190 });
    const anchor = { x: 137, y: 91 };
    const before = worldAt(metrics, pose, anchor);
    const zoomed = zoomAround(metrics, pose, 2.2, anchor);
    const after = worldAt(metrics, zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
  });

  it("clamps zoom and pan, but gives direct drags resisted edge travel", () => {
    const metrics = cameraMetrics(400, 240);
    const raw = { x: 500, y: -900, zoom: 99 };
    const clamped = clampCamera(metrics, raw);
    expect(clamped.zoom).toBe(MAX_MAP_ZOOM);
    const bounds = cameraBounds(metrics, MAX_MAP_ZOOM);
    expect(clamped.x).toBe(bounds.x.max);
    expect(clamped.y).toBe(bounds.y.min);

    const resisted = resistCamera(metrics, raw);
    expect(resisted.x).toBeGreaterThan(bounds.x.max);
    expect(resisted.x).toBeLessThan(raw.x);
    expect(resisted.y).toBeLessThan(bounds.y.min);
    expect(resisted.y).toBeGreaterThan(raw.y);
  });

  it("keeps a screen-space margin beyond maps that touch the viewport edge", () => {
    const metrics = cameraMetrics(BASIN_WIDTH, BASIN_HEIGHT);
    const bounds = cameraBounds(metrics, 1);
    expect(bounds.x).toEqual({ min: -MAP_EDGE_MARGIN, max: MAP_EDGE_MARGIN });
    expect(bounds.y).toEqual({ min: -MAP_EDGE_MARGIN, max: MAP_EDGE_MARGIN });
  });

  it("preserves the viewed world center through resize", () => {
    const beforeMetrics = cameraMetrics(390, 240);
    const afterMetrics = cameraMetrics(780, 400);
    const before = centeredCamera(beforeMetrics, { x: 500, y: 320 }, 2.1);
    const worldCenter = worldAt(beforeMetrics, before, { x: 195, y: 120 });
    const after = resizeCamera(beforeMetrics, afterMetrics, before);
    const resizedCenter = worldAt(afterMetrics, after, { x: 390, y: 200 });
    expect(resizedCenter.x).toBeCloseTo(worldCenter.x, 8);
    expect(resizedCenter.y).toBeCloseTo(worldCenter.y, 8);
  });

  it("protects zero-sized containers and zero-distance zoom anchors", () => {
    const empty = cameraMetrics(0, 0);
    const pose = centeredCamera(empty, null);
    expect(pose).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(worldAt(empty, pose, { x: 0, y: 0 })).toEqual({
      x: BASIN_WIDTH / 2,
      y: BASIN_HEIGHT / 2,
    });
  });
});
