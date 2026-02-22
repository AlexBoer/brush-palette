/**
 * RibbonBrush – A custom Foundry VTT drawing tool that produces
 * variable-width calligraphic strokes.
 *
 * How it works:
 *  1. The user draws a freehand path (drag on canvas).
 *  2. At every captured point, mouse speed is measured.
 *  3. Speed is mapped to stroke width: slow → thick, fast → thin.
 *  4. Two offset curves (left/right of the centre-line) are built using
 *     the per-point widths, then joined into a closed polygon.
 *  5. The polygon is saved as a standard Foundry Drawing document
 *     (shape type "p" with solid fill), making it fully persistent,
 *     selectable, movable and deletable.
 *
 * The tool registers itself as a new button ("Ribbon") in the drawing
 * controls toolbar, right after the built-in Freehand tool.
 */

import { brush } from "./module.mjs";

const MODULE_ID = "brush-palette";

/** Flag key set on ribbon Drawings so the preCreateDrawing hook can skip them. */
export const RIBBON_FLAG = "isRibbonDrawing";

export class RibbonBrush {
  // ─── Drawing state ───────────────────────────────────────────
  static _isDrawing = false;
  static _points = []; // Array of {x, y, time, speed, width}
  static _preview = null; // PIXI.Graphics for live preview
  static _layer = null; // DrawingsLayer reference

  // ─── Tuning constants ────────────────────────────────────────
  /** Minimum width as a fraction of the brush stroke-width setting */
  static MIN_WIDTH_RATIO = 0.08;
  /** Speed-to-width scaling (higher → more speed sensitivity) */
  static SPEED_SCALE = 0.35;
  /** Fraction of total path length to taper at the start */
  static TAPER_START = 0.08;
  /** Fraction of total path length to taper at the end */
  static TAPER_END = 0.12;
  /** Minimum distance (canvas px) between captured points */
  static MIN_POINT_DIST = 3;
  /** Number of Gaussian-smooth passes on the width channel */
  static SMOOTH_PASSES = 2;
  /** Exponential-smoothing weight for the *previous* width during capture */
  static LIVE_SMOOTH = 0.3;
  /** Chaikin corner-cutting subdivision iterations (smooths outline) */
  static CHAIKIN_ITERS = 3;
  /** Chaikin iterations used for live preview (fewer = faster) */
  static CHAIKIN_ITERS_PREVIEW = 1;

  // ─────────────────────────────────────────────────────────────
  //  Tool registration
  // ─────────────────────────────────────────────────────────────

  /** Is the ribbon tool the currently active drawing tool? */
  static isActive() {
    return (
      ui.controls?.control?.name === "drawings" && game.activeTool === "ribbon"
    );
  }

  /**
   * One-time setup: adds the toolbar button and registers libWrapper
   * hooks.  Call during Hooks.once("init").
   */
  static register() {
    // ── Toolbar button ──────────────────────────────────────────
    Hooks.on("getSceneControlButtons", (controls) => {
      // Only show the tool when the experimental setting is enabled
      if (!game.settings.get(MODULE_ID, "experimental")) return;
      let drawings;
      if (Array.isArray(controls)) {
        drawings = controls.find((c) => c.name === "drawings");
      } else {
        drawings = controls.drawings ?? controls.get?.("drawings");
      }
      if (!drawings) return;

      const tool = {
        name: "ribbon",
        title: game.i18n.localize("BRUSH_PALETTE.RibbonBrush"),
        icon: "fas fa-pen-fancy",
      };

      if (Array.isArray(drawings.tools)) {
        const idx = drawings.tools.findIndex((t) => t.name === "freehand");
        if (idx >= 0) drawings.tools.splice(idx + 1, 0, tool);
        else drawings.tools.push(tool);
      } else if (drawings.tools instanceof Map) {
        drawings.tools.set("ribbon", tool);
      } else if (typeof drawings.tools === "object") {
        drawings.tools.ribbon = tool;
      }
    });

    // ── libWrapper (deferred until game is ready) ───────────────
    Hooks.once("ready", () => {
      if (game.settings.get(MODULE_ID, "experimental")) {
        RibbonBrush._registerWrappers();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  libWrapper integration
  // ─────────────────────────────────────────────────────────────

  static _registerWrappers() {
    const pairs = [
      ["_onDragLeftStart", RibbonBrush._onDragStart],
      ["_onDragLeftMove", RibbonBrush._onDragMove],
      ["_onDragLeftDrop", RibbonBrush._onDragDrop],
      ["_onDragLeftCancel", RibbonBrush._onDragCancel],
    ];

    for (const [method, handler] of pairs) {
      libWrapper.register(
        MODULE_ID,
        `foundry.canvas.layers.DrawingsLayer.prototype.${method}`,
        function (wrapped, event) {
          if (RibbonBrush.isActive() || RibbonBrush._isDrawing) {
            return handler(event, this);
          }
          return wrapped(event);
        },
        "MIXED",
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Canvas event handlers
  // ─────────────────────────────────────────────────────────────

  static _onDragStart(event, layer) {
    const pos = event.interactionData?.origin;
    if (!pos) return;

    RibbonBrush._isDrawing = true;
    RibbonBrush._layer = layer;
    RibbonBrush._points = [
      {
        x: pos.x,
        y: pos.y,
        time: performance.now(),
        speed: 0,
        width: brush.strokeWidth || 8,
      },
    ];

    // Live-preview PIXI graphic – added directly to the drawings layer
    // so world-space coordinates match without extra transforms.
    const gfx = new PIXI.Graphics();
    gfx.eventMode = "none"; // don't steal pointer events
    layer.addChild(gfx);
    RibbonBrush._preview = gfx;
  }

  static _onDragMove(event, _layer) {
    if (!RibbonBrush._isDrawing) return;

    const pos =
      event.interactionData?.destination ?? event.interactionData?.origin;
    if (!pos) return;

    const now = performance.now();
    const pts = RibbonBrush._points;
    const last = pts[pts.length - 1];

    const dx = pos.x - last.x;
    const dy = pos.y - last.y;
    const dist = Math.hypot(dx, dy);
    if (dist < RibbonBrush.MIN_POINT_DIST) return;

    const dt = Math.max(1, now - last.time); // ms
    const speed = dist / dt; // px / ms

    // Map speed → width  (slow = thick, fast = thin)
    const baseWidth = brush.strokeWidth || 8;
    const minWidth = Math.max(1, baseWidth * RibbonBrush.MIN_WIDTH_RATIO);
    const factor = Math.max(0, 1 - speed * RibbonBrush.SPEED_SCALE);
    const rawWidth = minWidth + (baseWidth - minWidth) * factor;

    // Exponential smooth with previous width
    const smoothed =
      last.width * RibbonBrush.LIVE_SMOOTH +
      rawWidth * (1 - RibbonBrush.LIVE_SMOOTH);

    pts.push({ x: pos.x, y: pos.y, time: now, speed, width: smoothed });

    RibbonBrush._updatePreview();
  }

  static async _onDragDrop(event, layer) {
    if (!RibbonBrush._isDrawing) return;

    const pts = RibbonBrush._points;
    if (pts.length < 3) {
      RibbonBrush._cleanup();
      return;
    }

    // ── Post-process widths and positions ──
    RibbonBrush._smoothPositions(pts, 2);
    RibbonBrush._applyTaper(pts);
    RibbonBrush._smoothWidths(pts, RibbonBrush.SMOOTH_PASSES);

    // ── Subdivide for smoothness ──
    const smooth = RibbonBrush._chaikinSubdivide(
      pts,
      RibbonBrush.CHAIKIN_ITERS,
    );

    // ── Build closed polygon ──
    const polygon = RibbonBrush._buildPolygon(smooth);
    if (polygon.length < 6) {
      RibbonBrush._cleanup();
      return;
    }

    // Bounding box
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < polygon.length; i += 2) {
      const px = polygon[i],
        py = polygon[i + 1];
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 1 || h < 1) {
      RibbonBrush._cleanup();
      return;
    }

    // Normalise points relative to top-left corner
    const rel = new Array(polygon.length);
    for (let i = 0; i < polygon.length; i += 2) {
      rel[i] = polygon[i] - minX;
      rel[i + 1] = polygon[i + 1] - minY;
    }

    const drawingData = {
      shape: { type: "p", width: w, height: h, points: rel },
      x: minX,
      y: minY,
      strokeWidth: 1, // minimum valid value
      strokeColor: brush.strokeColor || "#000000",
      strokeAlpha: 0, // invisible stroke outline
      fillType: 1, // CONST.DRAWING_FILL_TYPES.SOLID
      fillColor: brush.strokeColor || "#000000",
      fillAlpha: brush.strokeAlpha ?? 1,
      bezierFactor: 0, // vertices are pre-computed, no smoothing needed
      flags: { [MODULE_ID]: { [RIBBON_FLAG]: true } },
    };

    try {
      if (canvas.scene) {
        await canvas.scene.createEmbeddedDocuments("Drawing", [drawingData]);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to create ribbon drawing:`, err);
    } finally {
      RibbonBrush._cleanup();
    }
  }

  static _onDragCancel(_event, _layer) {
    RibbonBrush._cleanup();
  }

  // ─────────────────────────────────────────────────────────────
  //  Clean-up
  // ─────────────────────────────────────────────────────────────

  static _cleanup() {
    if (RibbonBrush._preview) {
      RibbonBrush._preview.parent?.removeChild(RibbonBrush._preview);
      RibbonBrush._preview.destroy({ children: true });
      RibbonBrush._preview = null;
    }
    RibbonBrush._isDrawing = false;
    RibbonBrush._points = [];
    RibbonBrush._layer = null;
  }

  // ─────────────────────────────────────────────────────────────
  //  Width post-processing
  // ─────────────────────────────────────────────────────────────

  /** Taper at start and end of stroke for natural-looking endpoints. */
  static _applyTaper(pts) {
    const n = pts.length;
    let totalLen = 0;
    const cum = [0];
    for (let i = 1; i < n; i++) {
      totalLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      cum.push(totalLen);
    }
    if (totalLen === 0) return;

    const sLen = totalLen * RibbonBrush.TAPER_START;
    const eLen = totalLen * RibbonBrush.TAPER_END;

    for (let i = 0; i < n; i++) {
      let t = 1;
      if (cum[i] < sLen) t = Math.min(t, cum[i] / sLen);
      const rem = totalLen - cum[i];
      if (rem < eLen) t = Math.min(t, rem / eLen);
      pts[i].width *= Math.max(0.05, t);
    }
  }

  /** Gaussian-like smoothing of the width channel. */
  static _smoothWidths(pts, passes = 2) {
    const n = pts.length;
    for (let p = 0; p < passes; p++) {
      const w = pts.map((pt) => pt.width);
      for (let i = 1; i < n - 1; i++) {
        pts[i].width = w[i - 1] * 0.25 + w[i] * 0.5 + w[i + 1] * 0.25;
      }
    }
  }

  /** Gaussian-like smoothing of the centre-line x/y positions.
   *  Endpoints are preserved so the stroke doesn't shift. */
  static _smoothPositions(pts, passes = 2) {
    const n = pts.length;
    for (let p = 0; p < passes; p++) {
      const xs = pts.map((pt) => pt.x);
      const ys = pts.map((pt) => pt.y);
      for (let i = 1; i < n - 1; i++) {
        pts[i].x = xs[i - 1] * 0.25 + xs[i] * 0.5 + xs[i + 1] * 0.25;
        pts[i].y = ys[i - 1] * 0.25 + ys[i] * 0.5 + ys[i + 1] * 0.25;
      }
    }
  }

  /**
   * Chaikin corner-cutting subdivision.
   * Each iteration replaces every segment with two new points at 25 % and
   * 75 % along the segment, smoothing angles while interpolating width.
   * The first and last points are preserved so endpoints stay put.
   */
  static _chaikinSubdivide(pts, iterations = 2) {
    let src = pts;
    for (let iter = 0; iter < iterations; iter++) {
      const dst = [src[0]];
      for (let i = 0; i < src.length - 1; i++) {
        const a = src[i];
        const b = src[i + 1];
        dst.push({
          x: 0.75 * a.x + 0.25 * b.x,
          y: 0.75 * a.y + 0.25 * b.y,
          width: 0.75 * a.width + 0.25 * b.width,
        });
        dst.push({
          x: 0.25 * a.x + 0.75 * b.x,
          y: 0.25 * a.y + 0.75 * b.y,
          width: 0.25 * a.width + 0.75 * b.width,
        });
      }
      dst.push(src[src.length - 1]);
      src = dst;
    }
    return src;
  }

  // ─────────────────────────────────────────────────────────────
  //  Polygon construction
  // ─────────────────────────────────────────────────────────────

  /**
   * Build a closed polygon (flat [x,y,…] array) that outlines a
   * variable-width ribbon along the captured centre-line.
   *
   * For each centre-line point the perpendicular (normal) is computed,
   * then the point is offset left and right by half the local width.
   * The final polygon is: left-side forward + right-side reversed.
   *
   * Sharp-turn handling: when two adjacent segments form a tight angle
   * the miter (average normal) can shoot far out.  We detect this via
   * the dot-product of the two segment directions: if it is below a
   * threshold we fall back to a simple bevel (use the incoming or
   * outgoing normal, whichever is shorter) and clamp the maximum
   * offset to 2× the half-width.
   */
  static _buildPolygon(pts) {
    const n = pts.length;
    if (n < 2) return [];

    // Pre-compute unit normals for every segment (i → i+1)
    const segNx = new Float64Array(n - 1);
    const segNy = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      const l = Math.hypot(dx, dy) || 1;
      segNx[i] = -dy / l;
      segNy[i] = dx / l;
    }

    const left = [];
    const right = [];

    /** Max miter extension as a multiple of half-width */
    const MITER_LIMIT = 2;

    for (let i = 0; i < n; i++) {
      let nx, ny;

      if (i === 0) {
        nx = segNx[0];
        ny = segNy[0];
      } else if (i === n - 1) {
        nx = segNx[n - 2];
        ny = segNy[n - 2];
      } else {
        // Average normals of the two adjacent segments
        const n1x = segNx[i - 1],
          n1y = segNy[i - 1];
        const n2x = segNx[i],
          n2y = segNy[i];

        // Dot product of the two *direction* vectors tells us about the turn
        // (normals rotated 90°, but the dot of the normals == dot of the dirs)
        const dot = n1x * n2x + n1y * n2y;

        if (dot < 0.2) {
          // Very sharp turn → fall back to one of the segment normals
          // (pick the incoming one; avoids the spike entirely)
          nx = n1x;
          ny = n1y;
        } else {
          // Smooth join – average & re-normalise
          const ax = n1x + n2x;
          const ay = n1y + n2y;
          const al = Math.hypot(ax, ay) || 1;
          nx = ax / al;
          ny = ay / al;

          // Clamp miter length: the true perpendicular distance is
          // hw / cos(halfAngle).  cos(halfAngle) ≈ al/2.
          // If the miter multiplier exceeds MITER_LIMIT, scale back.
          const miterScale = 2 / al; // 1/cos(halfAngle)
          if (miterScale > MITER_LIMIT) {
            const clamp = MITER_LIMIT / miterScale;
            nx *= clamp;
            ny *= clamp;
          }
        }
      }

      const hw = pts[i].width * 0.5;
      left.push(pts[i].x + nx * hw, pts[i].y + ny * hw);
      right.push(pts[i].x - nx * hw, pts[i].y - ny * hw);
    }

    // Assemble closed polygon: left forward, then right reversed
    const out = new Array(left.length + right.length);
    for (let i = 0; i < left.length; i++) out[i] = left[i];
    for (let i = right.length - 2; i >= 0; i -= 2) {
      const dst = left.length + (right.length - 2 - i);
      out[dst] = right[i];
      out[dst + 1] = right[i + 1];
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  //  Live preview
  // ─────────────────────────────────────────────────────────────

  static _updatePreview() {
    const gfx = RibbonBrush._preview;
    if (!gfx) return;
    const pts = RibbonBrush._points;
    if (pts.length < 2) return;

    // Light subdivision for the preview (fewer iterations for performance)
    const smooth = RibbonBrush._chaikinSubdivide(
      pts,
      RibbonBrush.CHAIKIN_ITERS_PREVIEW,
    );
    const polygon = RibbonBrush._buildPolygon(smooth);
    if (polygon.length < 6) return;

    const colorInt = Number(Color.from(brush.strokeColor || "#000000"));
    const alpha = brush.strokeAlpha ?? 1;

    // PIXI v7 API: beginFill / endFill
    gfx.clear();
    gfx.beginFill(colorInt, alpha);
    gfx.moveTo(polygon[0], polygon[1]);
    for (let i = 2; i < polygon.length; i += 2) {
      gfx.lineTo(polygon[i], polygon[i + 1]);
    }
    gfx.closePath();
    gfx.endFill();
  }
}
