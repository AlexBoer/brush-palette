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
  text: "",
  fontFamily: "",
  fontSize: 48,
  textColor: "#ffffff",
  textAlpha: 1,
};

// Stroke style dash patterns (for advanced-drawing-tools compatibility)
const STROKE_DASH_PATTERNS = {
  solid: null,
  dotted: [4, 8],
  dashed: [18, 3],
};

// Swatch color themes
const SWATCH_THEMES = {
  default: [
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
  ],
  pastel: [
    "#ffb3ba",
    "#ffd1b3",
    "#ffffb3",
    "#b3ffb3",
    "#b3ffff",
    "#b3d9ff",
    "#d9b3ff",
    "#ffb3ff",
    "#ffc9c9",
    "#c9ffc9",
    "#c9c9ff",
    "#ffffff",
  ],
  muted: [
    "#5c4a4a",
    "#7a6040",
    "#6a7a40",
    "#406a7a",
    "#4a406a",
    "#7a4060",
    "#8d8d8d",
    "#c4a882",
    "#a3b899",
    "#8fa8c8",
    "#c8a0a0",
    "#b0a0c8",
  ],
  neon: [
    "#ff0040",
    "#ff8c00",
    "#fff700",
    "#00ff41",
    "#00ffff",
    "#0080ff",
    "#8000ff",
    "#ff00ff",
    "#ff6600",
    "#00ff80",
    "#ff0099",
    "#ffffff",
  ],
  monochrome: [
    "#000000",
    "#1a1a1a",
    "#333333",
    "#4d4d4d",
    "#666666",
    "#808080",
    "#999999",
    "#b3b3b3",
    "#cccccc",
    "#e6e6e6",
    "#f2f2f2",
    "#ffffff",
  ],
  warm: [
    "#3d0000",
    "#7a0000",
    "#c00000",
    "#e84040",
    "#e87020",
    "#e8a020",
    "#e8c020",
    "#c8b400",
    "#a07830",
    "#805030",
    "#603020",
    "#ffffff",
  ],
  cool: [
    "#001a3d",
    "#003366",
    "#0055a0",
    "#0080d0",
    "#20a8e8",
    "#50c8f0",
    "#80e0f8",
    "#a0f0ff",
    "#70d0c0",
    "#40b090",
    "#206870",
    "#ffffff",
  ],
};

// Default swatches (used for "custom" theme)
const DEFAULT_SWATCHES = SWATCH_THEMES.default;

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

// The drawing currently being edited via the palette (null = none)
let _selectedDrawing = null;

// Brush state saved just before a drawing was selected
let _preSelectionBrush = null;

// The core client setting key that stores default drawing data.
// V13: "defaultDrawingConfig"  |  V14+: "drawingPalette"
const _coreDrawingSettingKey = () =>
  game.release?.generation >= 14 ? "drawingPalette" : "defaultDrawingConfig";

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

  game.settings.register(MODULE_ID, "swatchTheme", {
    name: "BRUSH_PALETTE.SwatchTheme",
    hint: "BRUSH_PALETTE.SwatchThemeHint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      default: "BRUSH_PALETTE.ThemeDefault",
      pastel: "BRUSH_PALETTE.ThemePastel",
      muted: "BRUSH_PALETTE.ThemeMuted",
      neon: "BRUSH_PALETTE.ThemeNeon",
      monochrome: "BRUSH_PALETTE.ThemeMonochrome",
      warm: "BRUSH_PALETTE.ThemeWarm",
      cool: "BRUSH_PALETTE.ThemeCool",
      custom: "BRUSH_PALETTE.ThemeCustom",
    },
    default: "default",
    onChange: () => {
      if (palette?.rendered) palette.render();
    },
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

  // Apply ADT dash/dot flags to new drawings - core fields are set via the
  // Foundry drawing config setting and applied natively by DrawingsLayer.
  Hooks.on("preCreateDrawing", (document, data, options, userId) => {
    // Only act when a built-in drawing tool is active.
    // This prevents overwriting styles set by other modules (e.g. Fate Aspect Tracker)
    // that create drawings programmatically.
    if (!_isBuiltInDrawingToolActive()) return;

    // Apply stroke style (dashed lines) via advanced-drawing-tools flags
    if (game.modules.get("advanced-drawing-tools")?.active) {
      const dashPattern = STROKE_DASH_PATTERNS[brush.strokeStyle] || null;
      if (dashPattern) {
        document.updateSource({
          flags: {
            "advanced-drawing-tools": {
              lineStyle: { dash: dashPattern },
            },
          },
        });
      }
    }
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

  // Fix dash/dot preview: Foundry's defaultDrawingConfig may not propagate
  // flags to the preview drawing, so advanced-drawing-tools never sees them
  // during the live preview phase.  We wrap _onDragLeftStart to inject the
  // dash-pattern flags directly into the preview drawing's document source
  // right after Foundry creates it.
  if (game.modules.get("advanced-drawing-tools")?.active) {
    libWrapper.register(
      MODULE_ID,
      "foundry.canvas.layers.DrawingsLayer.prototype._onDragLeftStart",
      function (wrapped, event) {
        const result = wrapped(event);
        const preview = event.interactionData?.preview;
        if (preview?.document) {
          const dashPattern = STROKE_DASH_PATTERNS[brush.strokeStyle] || null;
          preview.document.updateSource({
            flags: {
              "advanced-drawing-tools": {
                lineStyle: { dash: dashPattern },
              },
            },
          });
          // Force a shape re-render so ADT picks up the flags
          preview.renderFlags?.set?.({ refreshShape: true });
        }
        return result;
      },
      "WRAPPER",
    );
  }
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
  brush.text = brush.text ?? "";
  brush.fontFamily = brush.fontFamily ?? "";
  brush.fontSize = Math.max(8, Number(brush.fontSize) || 48);
  brush.textColor = brush.textColor || "#ffffff";
  brush.textAlpha = Number(brush.textAlpha) >= 0 ? Number(brush.textAlpha) : 1;
}

/**
 * Close the palette when the user leaves the drawings layer.
 */
Hooks.on("renderSceneControls", () => {
  if (ui.controls?.control?.name !== "drawings" && palette?.rendered) {
    _hidePalette();
  }
});

/**
 * Add a toggle button to the drawings toolbar to open/close the palette.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  const drawings = controls.drawings;
  if (!drawings) return;
  drawings.tools["brush-palette-toggle"] = {
    name: "brush-palette-toggle",
    title: "BRUSH_PALETTE.TogglePalette",
    icon: "fas fa-palette",
    toggle: true,
    active: false,
    order: 100,
    onChange: (_event, active) => {
      if (active) _showPalette(false);
      else _hidePalette(false);
    },
  };
});

/**
 * Clean up on canvas teardown
 */
Hooks.on("canvasTearDown", () => {
  _hidePalette();
});

/**
 * When a drawing is controlled (selected) or released, sync the palette.
 * - Single drawing selected → show its properties in the palette.
 * - Drawing deselected (or multiple selected) → restore the pre-selection brush.
 */
Hooks.on("controlDrawing", (_drawing, _controlled) => {
  const nowControlled = canvas.drawings?.controlled ?? [];

  if (nowControlled.length === 1) {
    const single = nowControlled[0];
    // Backup the brush the first time we enter selection mode
    if (!_selectedDrawing) {
      _preSelectionBrush = { ...brush };
    }
    _selectedDrawing = single;
    _loadDrawingIntoBrush(single);
  } else {
    // Nothing selected (or multi-select) — restore original brush
    if (_preSelectionBrush) {
      Object.assign(brush, _preSelectionBrush);
      _preSelectionBrush = null;
    }
    _selectedDrawing = null;
  }

  if (palette?.rendered) palette.render();
});

/**
 * Built-in Foundry drawing creation tools.
 * Used to limit brush-palette overrides to only user-initiated drawings.
 */
const DRAWING_CREATION_TOOLS = new Set([
  "freehand",
  "polygon",
  "rect",
  "ellipse",
  "text",
]);

/**
 * Check if the user is actively using a built-in drawing creation tool.
 * Returns false when another module (e.g. Fate Aspect Tracker) creates
 * drawings programmatically, so we don't overwrite their styles.
 */
function _isBuiltInDrawingToolActive() {
  return (
    ui.controls?.control?.name === "drawings" &&
    DRAWING_CREATION_TOOLS.has(game.activeTool)
  );
}

/**
 * Show the palette window.
 * @param {boolean} [syncToggle=true]  Update the toolbar toggle state.
 */
function _showPalette(syncToggle = true) {
  if (!palette) {
    palette = new BrushPalette();
  }
  palette.render(true);
  if (syncToggle) _setToggleActive(true);
}

/**
 * Hide the palette window.
 * @param {boolean} [syncToggle=true]  Update the toolbar toggle state.
 */
function _hidePalette(syncToggle = true) {
  if (palette?.rendered) {
    palette.close();
  }
  if (syncToggle) _setToggleActive(false);
}

/**
 * Sync the toolbar toggle button active state.
 * @param {boolean} active
 */
function _setToggleActive(active) {
  const toggle =
    ui.controls?.controls?.drawings?.tools?.["brush-palette-toggle"];
  if (toggle && toggle.active !== active) {
    toggle.active = active;
    ui.controls?.render();
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
    brush.text = brush.text ?? "";
    brush.fontFamily = brush.fontFamily ?? "";
    brush.fontSize = Math.max(
      8,
      Number(brush.fontSize) || DEFAULT_BRUSH.fontSize,
    );
    brush.textColor = brush.textColor || DEFAULT_BRUSH.textColor;
    brush.textAlpha = Math.max(
      0,
      Number(brush.textAlpha) ?? DEFAULT_BRUSH.textAlpha,
    );
  }
}

/**
 * Save current brush settings (or apply to selected drawing if one is active).
 */
export function saveBrushSettings() {
  if (_selectedDrawing) {
    // Apply changes directly to the selected drawing; don't overwrite the
    // saved brush defaults while we're in "drawing edit" mode.
    _applyBrushToSelectedDrawing();
    return;
  }

  game.settings.set(MODULE_ID, "lastBrush", { ...brush });

  // Also update Foundry's core drawing config so new drawings pick up our settings.
  // The key changed in V14+ (defaultDrawingConfig → drawingPalette).
  _updateCoreDrawingConfig();
}

/**
 * Update Foundry's core drawing config with current brush settings.
 * V13: "core.defaultDrawingConfig"  |  V14+: "core.drawingPalette"
 * Both versions register this as a proper client setting.
 */
function _updateCoreDrawingConfig() {
  try {
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
      text: brush.text || "",
      fontFamily: brush.fontFamily || "",
      fontSize: Math.max(8, Number(brush.fontSize) || 48),
      textColor: brush.textColor || "#ffffff",
      textAlpha: Number(brush.textAlpha) >= 0 ? Number(brush.textAlpha) : 1,
    };

    game.settings.set("core", _coreDrawingSettingKey(), config);
  } catch (e) {
    console.warn(`${MODULE_ID} | Could not update core drawing config:`, e);
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
 * Get swatches — returns the active theme's colors, or custom saved swatches.
 */
export function getSwatches() {
  const theme = game.settings.get(MODULE_ID, "swatchTheme") ?? "default";
  if (theme === "custom") {
    return game.settings.get(MODULE_ID, "swatches") || DEFAULT_SWATCHES;
  }
  return SWATCH_THEMES[theme] ?? SWATCH_THEMES.default;
}

/**
 * Update a single swatch color in the custom palette.
 * Switches the theme to "custom" if not already.
 */
export async function saveSwatchColor(index, color) {
  // If not on custom theme, copy current theme's swatches into custom first
  const theme = game.settings.get(MODULE_ID, "swatchTheme") ?? "default";
  let swatches;
  if (theme !== "custom") {
    swatches = [...(SWATCH_THEMES[theme] ?? SWATCH_THEMES.default)];
    await game.settings.set(MODULE_ID, "swatchTheme", "custom");
  } else {
    swatches = [
      ...(game.settings.get(MODULE_ID, "swatches") || DEFAULT_SWATCHES),
    ];
  }
  swatches[index] = color;
  await game.settings.set(MODULE_ID, "swatches", swatches);
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

/**
 * Get the currently selected (controlled) drawing being edited, or null.
 */
export function getSelectedDrawing() {
  return _selectedDrawing;
}

/**
 * Coerce a value that may be a Foundry Color object, a number, or a string
 * into a lowercase CSS hex string ("#rrggbb"), falling back to `fallback`.
 */
function _toHexString(value, fallback) {
  if (!value && value !== 0) return fallback;
  // Foundry Color objects have a .toString() that yields "#rrggbb"
  const s = String(value);
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  // Numeric color (e.g. 0xff0000)
  if (typeof value === "number") {
    return `#${value.toString(16).padStart(6, "0")}`;
  }
  return fallback;
}

/**
 * Load a drawing's stored properties into the shared brush object.
 */
function _loadDrawingIntoBrush(drawing) {
  const doc = drawing.document;
  brush.strokeColor = _toHexString(doc.strokeColor, DEFAULT_BRUSH.strokeColor);
  brush.strokeWidth = doc.strokeWidth ?? DEFAULT_BRUSH.strokeWidth;
  brush.strokeAlpha = doc.strokeAlpha ?? DEFAULT_BRUSH.strokeAlpha;
  brush.fillType = doc.fillType ?? DEFAULT_BRUSH.fillType;
  brush.fillColor = _toHexString(doc.fillColor, DEFAULT_BRUSH.fillColor);
  brush.fillAlpha = doc.fillAlpha ?? DEFAULT_BRUSH.fillAlpha;
  brush.bezierFactor = doc.bezierFactor ?? DEFAULT_BRUSH.bezierFactor;
  brush.text = doc.text ?? DEFAULT_BRUSH.text;
  brush.fontFamily = doc.fontFamily || DEFAULT_BRUSH.fontFamily;
  brush.fontSize = doc.fontSize ?? DEFAULT_BRUSH.fontSize;
  brush.textColor = _toHexString(doc.textColor, DEFAULT_BRUSH.textColor);
  brush.textAlpha = doc.textAlpha ?? DEFAULT_BRUSH.textAlpha;

  // Map ADT dash-pattern flags back to a stroke style name
  if (game.modules.get("advanced-drawing-tools")?.active) {
    const adtDash = doc.flags?.["advanced-drawing-tools"]?.lineStyle?.dash;
    if (!adtDash || adtDash.length === 0) {
      brush.strokeStyle = "solid";
    } else if (
      adtDash[0] === STROKE_DASH_PATTERNS.dotted[0] &&
      adtDash[1] === STROKE_DASH_PATTERNS.dotted[1]
    ) {
      brush.strokeStyle = "dotted";
    } else if (
      adtDash[0] === STROKE_DASH_PATTERNS.dashed[0] &&
      adtDash[1] === STROKE_DASH_PATTERNS.dashed[1]
    ) {
      brush.strokeStyle = "dashed";
    } else {
      brush.strokeStyle = "solid";
    }
  }
}

/**
 * Apply the current brush settings to the selected drawing document.
 */
function _applyBrushToSelectedDrawing() {
  if (!_selectedDrawing?.document) return;

  const updates = {
    strokeColor: brush.strokeColor,
    strokeWidth: brush.strokeWidth,
    strokeAlpha: brush.strokeAlpha,
    fillType: brush.fillType,
    fillColor: brush.fillColor,
    fillAlpha: brush.fillAlpha,
    bezierFactor: brush.bezierFactor,
    text: brush.text,
    fontFamily: brush.fontFamily,
    fontSize: brush.fontSize,
    textColor: brush.textColor,
    textAlpha: brush.textAlpha,
  };

  if (game.modules.get("advanced-drawing-tools")?.active) {
    const dashPattern = STROKE_DASH_PATTERNS[brush.strokeStyle] || null;
    updates["flags.advanced-drawing-tools.lineStyle.dash"] = dashPattern;
  }

  _selectedDrawing.document
    .update(updates)
    .catch((err) =>
      console.warn(`${MODULE_ID} | Failed to update drawing:`, err),
    );
}

/**
 * Reset brush to defaults
 */
export function resetBrush() {
  Object.assign(brush, DEFAULT_BRUSH);
  saveBrushSettings();
}
