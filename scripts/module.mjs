/**
 * Brush Palette - A floating palette for quickly changing drawing brush settings
 * Compatible with Foundry VTT v13, advanced-drawing-tools, and precise-drawing-tools
 */

import { BrushPalette } from "./BrushPalette.mjs";

const MODULE_ID = "brush-palette";

// Default brush settings
const DEFAULT_BRUSH = {
  strokeColor: "#000000",
  strokeWidth: 8,
  strokeAlpha: 1,
  strokeStyle: "solid", // solid, dotted, dashed
  fillType: 0, // CONST.DRAWING_FILL_TYPES.NONE
  fillColor: "#ffffff",
  fillAlpha: 0.5,
  bezierFactor: 0,
};

// Stroke style dash patterns (for advanced-drawing-tools compatibility)
const STROKE_DASH_PATTERNS = {
  solid: null,
  dotted: [4, 8],
  dashed: [18, 3],
};

// Default swatches
const DEFAULT_SWATCHES = [
  "#000000",
  "#ffffff",
  "#ff0000",
  "#ff8800",
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#0088ff",
  "#0000ff",
  "#8800ff",
  "#ff00ff",
  "#888888",
];

// Default presets
const DEFAULT_PRESETS = [
  {
    name: "Fine Pen",
    strokeColor: "#000000",
    strokeWidth: 2,
    strokeAlpha: 1,
    strokeStyle: "solid",
    fillType: 0,
    fillColor: "#ffffff",
    fillAlpha: 0.5,
    bezierFactor: 0.3,
  },
  {
    name: "Marker",
    strokeColor: "#ff0000",
    strokeWidth: 8,
    strokeAlpha: 1,
    strokeStyle: "solid",
    fillType: 0,
    fillColor: "#ffffff",
    fillAlpha: 0.5,
    bezierFactor: 0.2,
  },
  {
    name: "Highlighter",
    strokeColor: "#ffff00",
    strokeWidth: 20,
    strokeAlpha: 0.4,
    strokeStyle: "solid",
    fillType: 0,
    fillColor: "#ffffff",
    fillAlpha: 0.5,
    bezierFactor: 0.1,
  },
  {
    name: "Thick Outline",
    strokeColor: "#000000",
    strokeWidth: 4,
    strokeAlpha: 1,
    strokeStyle: "solid",
    fillType: 1,
    fillColor: "#4488ff",
    fillAlpha: 0.3,
    bezierFactor: 0.25,
  },
  {
    name: "Area Fill",
    strokeColor: "#228822",
    strokeWidth: 2,
    strokeAlpha: 1,
    strokeStyle: "dashed",
    fillType: 1,
    fillColor: "#88ff88",
    fillAlpha: 0.5,
    bezierFactor: 0,
  },
  {
    name: "Danger Zone",
    strokeColor: "#cc0000",
    strokeWidth: 3,
    strokeAlpha: 1,
    strokeStyle: "dotted",
    fillType: 1,
    fillColor: "#ff4444",
    fillAlpha: 0.4,
    bezierFactor: 0,
  },
];

// Current brush state (shared)
export let brush = { ...DEFAULT_BRUSH };

// Palette instance
let palette = null;

// Track drawing tool state
let _wasDrawingActive = false;

/**
 * Initialize the module
 */
Hooks.once("init", () => {
  // Register settings for brush persistence
  game.settings.register(MODULE_ID, "lastBrush", {
    name: "Last Brush Settings",
    scope: "client",
    config: false,
    type: Object,
    default: DEFAULT_BRUSH,
  });

  game.settings.register(MODULE_ID, "presets", {
    name: "Brush Presets",
    scope: "client",
    config: false,
    type: Array,
    default: DEFAULT_PRESETS,
  });

  game.settings.register(MODULE_ID, "swatches", {
    name: "Color Swatches",
    scope: "client",
    config: false,
    type: Array,
    default: DEFAULT_SWATCHES,
  });

  game.settings.register(MODULE_ID, "palettePosition", {
    name: "Palette Position",
    scope: "client",
    config: false,
    type: Object,
    default: null,
  });

  // Register restore presets menu button
  game.settings.registerMenu(MODULE_ID, "restorePresetsMenu", {
    name: "BRUSH_PALETTE.RestorePresets",
    hint: "BRUSH_PALETTE.RestorePresetsHint",
    label: "BRUSH_PALETTE.RestorePresets",
    icon: "fas fa-undo",
    type: RestorePresetsButton,
    restricted: false,
  });

  // Use the public preCreateDrawing hook to apply brush settings to new drawings
  Hooks.on("preCreateDrawing", (document, data, options, userId) => {
    // Ensure valid numeric values with safe defaults
    const strokeWidth = Math.max(1, Number(brush.strokeWidth) || 8);
    const strokeAlpha = Math.max(0.1, Number(brush.strokeAlpha) || 1);
    let fillType = Number(brush.fillType) ?? 0;
    const fillAlpha = Number(brush.fillAlpha) ?? 0.5;
    const bezierFactor = Number(brush.bezierFactor) ?? 0;

    // fillType 2 (pattern) requires a texture - fall back to solid if none
    if (fillType === 2 && !data.texture) {
      fillType = 1;
    }

    // Apply our brush palette settings with guaranteed valid values
    const updateData = {
      strokeColor: brush.strokeColor || "#000000",
      strokeWidth: strokeWidth,
      strokeAlpha: strokeAlpha,
      fillType: fillType,
      fillColor: brush.fillColor || "#ffffff",
      fillAlpha: fillAlpha >= 0 ? fillAlpha : 0.5,
      bezierFactor: bezierFactor >= 0 ? bezierFactor : 0,
    };

    // Apply stroke style (dashed lines) via advanced-drawing-tools flags
    const dashPattern = STROKE_DASH_PATTERNS[brush.strokeStyle] || null;
    if (dashPattern) {
      updateData.flags = {
        "advanced-drawing-tools": {
          lineStyle: { dash: dashPattern },
        },
      };
    }

    document.updateSource(updateData);
  });
});

/**
 * Fake FormApplication that immediately shows a confirm dialog
 */
class RestorePresetsButton extends FormApplication {
  constructor() {
    super();
    this._showConfirmDialog();
  }

  async _showConfirmDialog() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("BRUSH_PALETTE.RestorePresetsConfirmTitle"),
      },
      content: `<p>${game.i18n.localize("BRUSH_PALETTE.RestorePresetsConfirmContent")}</p>`,
      yes: { default: false },
      no: { default: true },
    });

    if (confirmed) {
      await game.settings.set(MODULE_ID, "presets", DEFAULT_PRESETS);
      ui.notifications.info(
        game.i18n.localize("BRUSH_PALETTE.RestorePresetsSuccess"),
      );

      // Refresh palette if open
      if (palette?.rendered) {
        palette.render();
      }
    }
  }

  async _updateObject() {}
  render() {
    return this;
  }
}

/**
 * Ready hook - load persisted settings
 */
Hooks.once("ready", () => {
  // Load persisted brush settings now that game is fully ready
  _loadPersistedBrush();
  _validateBrush();

  // Update Foundry's core drawing config to match our brush
  // This is critical to prevent validation errors in _onDragLeftStart
  _updateCoreDrawingConfig();
});

/**
 * When the drawings layer is activated, ensure valid brush values
 */
Hooks.on("canvasReady", () => {
  // Ensure brush is valid whenever canvas loads
  _validateBrush();
  _updateCoreDrawingConfig();
});

/**
 * Ensure brush values are valid (won't cause validation errors)
 */
function _validateBrush() {
  brush.strokeWidth = Math.max(1, Number(brush.strokeWidth) || 8);
  brush.strokeAlpha = Math.max(0.1, Number(brush.strokeAlpha) || 1);
  brush.strokeColor = brush.strokeColor || "#000000";
  brush.fillType = Number(brush.fillType) ?? 0;
  brush.fillAlpha = Number(brush.fillAlpha) ?? 0.5;
  brush.fillColor = brush.fillColor || "#ffffff";
  brush.bezierFactor = Number(brush.bezierFactor) ?? 0;
  brush.strokeStyle = brush.strokeStyle || "solid";
}

/**
 * Monitor scene controls to show/hide palette when drawing tools are active
 */
Hooks.on("renderSceneControls", (controls, html) => {
  const isDrawingActive = _isDrawingToolActive();

  if (isDrawingActive && !_wasDrawingActive) {
    _showPalette();
  } else if (!isDrawingActive && _wasDrawingActive) {
    _hidePalette();
  }

  _wasDrawingActive = isDrawingActive;
});

/**
 * Clean up on canvas teardown
 */
Hooks.on("canvasTearDown", () => {
  _hidePalette();
  _wasDrawingActive = false;
});

/**
 * Check if a drawing tool is currently active
 */
function _isDrawingToolActive() {
  return ui.controls?.control?.name === "drawings";
}

/**
 * Show the palette window
 */
function _showPalette() {
  if (!palette) {
    palette = new BrushPalette();
  }
  palette.render(true);
}

/**
 * Hide the palette window
 */
function _hidePalette() {
  if (palette?.rendered) {
    palette.close();
  }
}

/**
 * Load persisted brush settings
 */
function _loadPersistedBrush() {
  const saved = game.settings.get(MODULE_ID, "lastBrush");
  if (saved) {
    Object.assign(brush, saved);

    // Validate brush - ensure all values are valid and can create valid drawings
    brush.strokeWidth = Math.max(
      1,
      Number(brush.strokeWidth) || DEFAULT_BRUSH.strokeWidth,
    );
    brush.strokeAlpha = Math.max(
      0.05,
      Number(brush.strokeAlpha) || DEFAULT_BRUSH.strokeAlpha,
    );
    brush.fillType = Number(brush.fillType) || 0;
    brush.fillAlpha = Math.max(
      0,
      Number(brush.fillAlpha) || DEFAULT_BRUSH.fillAlpha,
    );
    brush.bezierFactor = Math.max(0, Number(brush.bezierFactor) || 0);
    brush.strokeStyle = brush.strokeStyle || "solid";
    brush.strokeColor = brush.strokeColor || DEFAULT_BRUSH.strokeColor;
    brush.fillColor = brush.fillColor || DEFAULT_BRUSH.fillColor;
  }
}

/**
 * Save current brush settings
 */
export function saveBrushSettings() {
  game.settings.set(MODULE_ID, "lastBrush", { ...brush });

  // Also update Foundry's core defaultDrawingConfig so validation passes
  // This is critical because _onDragLeftStart validates the default config
  // BEFORE creating the drawing with our modified data
  _updateCoreDrawingConfig();
}

/**
 * Update Foundry's core defaultDrawingConfig with current brush settings
 * This ensures the default config validation passes in _onDragLeftStart
 * @returns {Promise} Resolves when settings are saved
 */
async function _updateCoreDrawingConfig() {
  try {
    // Use actual brush values so the drawing preview matches the final result.
    // fillType 2 (pattern) without a texture fails Foundry validation,
    // so fall back to solid (1) in that case.
    let fillType = Number(brush.fillType) ?? 0;
    if (fillType === 2) fillType = 1;

    const config = {
      strokeColor: brush.strokeColor || "#000000",
      strokeWidth: Math.max(1, brush.strokeWidth || 8),
      strokeAlpha: Math.max(0.1, Number(brush.strokeAlpha) || 1),
      fillType: fillType,
      fillColor: brush.fillColor || "#ffffff",
      fillAlpha: Number(brush.fillAlpha) >= 0 ? Number(brush.fillAlpha) : 0.5,
      bezierFactor:
        Number(brush.bezierFactor) >= 0 ? Number(brush.bezierFactor) : 0,
    };

    await game.settings.set("core", "defaultDrawingConfig", config);
  } catch (e) {
    console.warn(
      `${MODULE_ID} | Could not update core defaultDrawingConfig:`,
      e,
    );
  }
}

/**
 * Get presets
 */
export function getPresets() {
  return game.settings.get(MODULE_ID, "presets") || [];
}

/**
 * Save presets
 */
export function savePresets(presets) {
  game.settings.set(MODULE_ID, "presets", presets);
}

/**
 * Get swatches
 */
export function getSwatches() {
  return game.settings.get(MODULE_ID, "swatches") || DEFAULT_SWATCHES;
}

/**
 * Get saved palette position
 */
export function getPalettePosition() {
  return game.settings.get(MODULE_ID, "palettePosition");
}

/**
 * Save palette position
 */
export function savePalettePosition(pos) {
  game.settings.set(MODULE_ID, "palettePosition", pos);
}

/**
 * Get palette instance (for external access)
 */
export function getPalette() {
  return palette;
}

/**
 * Get module ID
 */
export function getModuleId() {
  return MODULE_ID;
}
