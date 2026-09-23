export type Point = { x: number; y: number };
/** Screen point = world point * zoom + camera translation. */
export type Camera = Point & { zoom: number };
export type Bounds = Point & { width: number; height: number };

const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
const add = (base: number, delta: number): number => finite(base + delta, base);

/** Nonfinite scales recover to 1; all finite scales clamp to the camera range. */
export function clampZoom(zoom: number): number {
  return Math.min(2, Math.max(0.2, finite(zoom, 1)));
}

export function panCamera(camera: Camera, delta: Point): Camera {
  const x = finite(camera.x), y = finite(camera.y);
  return { x: add(x, finite(delta.x)), y: add(y, finite(delta.y)), zoom: clampZoom(camera.zoom) };
}

/** Zoom around a screen-space anchor without moving its world-space point. */
export function zoomCameraAt(camera: Camera, anchor: Point, nextZoom: number): Camera {
  const current = panCamera(camera, { x: 0, y: 0 });
  const zoom = clampZoom(nextZoom);
  const ratio = zoom / current.zoom;
  const x = finite(anchor.x), y = finite(anchor.y);
  return {
    x: finite(x - (x - current.x) * ratio, current.x),
    y: finite(y - (y - current.y) * ratio, current.y),
    zoom
  };
}

/** Negative dimensions normalize to positive bounds; zero bounds stay centered. */
export function fitCamera(bounds: Bounds, viewport: { width: number; height: number }, padding = 32): Camera {
  const viewportWidth = Math.max(1, finite(viewport.width, 1));
  const viewportHeight = Math.max(1, finite(viewport.height, 1));
  const inset = Math.max(0, finite(padding));
  const width = Math.abs(finite(bounds.width));
  const height = Math.abs(finite(bounds.height));
  const availableWidth = Math.max(1, viewportWidth - 2 * inset);
  const availableHeight = Math.max(1, viewportHeight - 2 * inset);
  const scale = Math.min(width ? availableWidth / width : 2, height ? availableHeight / height : 2);
  const zoom = clampZoom(scale);
  const centerX = add(finite(bounds.x), finite(bounds.width) / 2);
  const centerY = add(finite(bounds.y), finite(bounds.height) / 2);
  return {
    x: finite(viewportWidth / 2 - centerX * zoom),
    y: finite(viewportHeight / 2 - centerY * zoom),
    zoom
  };
}

/** Convert a pointer's screen delta into world movement at the camera scale. */
export function moveWorldPoint(start: Point, screenDelta: Point, zoom: number): Point {
  const scale = clampZoom(zoom);
  return {
    x: add(finite(start.x), finite(screenDelta.x) / scale),
    y: add(finite(start.y), finite(screenDelta.y) / scale)
  };
}
