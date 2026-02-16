/**
 * BrushPalette - ApplicationV2 window for quick brush settings
 */

import {
  brush,
  saveBrushSettings,
  getPresets,
  savePresets,
  getSwatches,
  getPalettePosition,
  savePalettePosition,
} from "./module.mjs";

const MODULE_ID = "brush-palette";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BrushPalette extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "brush-palette",
    classes: ["brush-palette-app"],
    tag: "div",
    window: {
      title: "BRUSH_PALETTE.Title",
      icon: "fas fa-palette",
      resizable: false,
      minimizable: true,
    },
    position: {
      width: 280,
      height: "auto",
    },
    actions: {
      toggleSection: BrushPalette.#toggleSection,
      pickStrokeColor: BrushPalette.#pickStrokeColor,
      pickFillColor: BrushPalette.#pickFillColor,
      loadPreset: BrushPalette.#loadPreset,
      deletePreset: BrushPalette.#deletePreset,
      savePreset: BrushPalette.#savePreset,
    },
  };

  static PARTS = {
    palette: {
      template: `modules/${MODULE_ID}/templates/palette.hbs`,
    },
  };

  // Track expanded state for sections
  _sectionState = {
    stroke: true,
    fill: true,
    presets: false,
  };

  /**
   * Prepare data for the template
   */
  async _prepareContext(options) {
    const swatches = getSwatches().map((hex) => ({
      hex,
      strokeActive: hex.toLowerCase() === brush.strokeColor?.toLowerCase(),
      fillActive: hex.toLowerCase() === brush.fillColor?.toLowerCase(),
    }));

    const presets = getPresets();

    return {
      strokeColor: brush.strokeColor,
      strokeWidth: brush.strokeWidth,
      strokeAlpha: brush.strokeAlpha,
      strokeAlphaPct: Math.round(brush.strokeAlpha * 100),
      strokeStyle: brush.strokeStyle || "solid",
      strokeStyleSolid: (brush.strokeStyle || "solid") === "solid",
      strokeStyleDotted: brush.strokeStyle === "dotted",
      strokeStyleDashed: brush.strokeStyle === "dashed",
      fillEnabled: brush.fillType === 1,
      fillColor: brush.fillColor,
      fillAlpha: brush.fillAlpha,
      fillAlphaPct: Math.round(brush.fillAlpha * 100),
      bezierFactor: brush.bezierFactor,
      bezierFactorPct: Math.round(brush.bezierFactor * 200), // 0-0.5 mapped to 0-100%
      swatches,
      presets,
      strokeExpanded: this._sectionState.stroke,
      fillExpanded: this._sectionState.fill,
      presetsExpanded: this._sectionState.presets,
    };
  }

  /**
   * Check if a position is within the current viewport
   */
  #isPositionInViewport(pos) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 50; // Minimum visible area
    return (
      pos.left >= -margin &&
      pos.top >= -margin &&
      pos.left < vw - margin &&
      pos.top < vh - margin
    );
  }

  /**
   * Save position when window is moved
   */
  _onPosition(pos) {
    super._onPosition(pos);
    savePalettePosition({ left: pos.left, top: pos.top });
  }

  /**
   * Set up event listeners after render
   */
  _onRender(context, options) {
    super._onRender(context, options);

    // Restore saved position if available and within viewport
    const savedPos = getPalettePosition();
    if (savedPos && this.#isPositionInViewport(savedPos)) {
      this.setPosition({ left: savedPos.left, top: savedPos.top });
    }

    const html = this.element;

    // Live update handlers for inputs
    html.addEventListener("input", this.#onInputChange.bind(this));
    html.addEventListener("change", this.#onInputChange.bind(this));
  }

  /**
   * Handle input changes
   */
  #onInputChange(event) {
    const input = event.target;
    const name = input.name;
    let value = input.value;

    switch (name) {
      case "strokeColor":
        brush.strokeColor = value;
        this.#updateColorText("strokeColorText", value);
        this.#updateSwatchActive(value);
        break;
      case "strokeColorText":
        if (/^#[0-9a-f]{6}$/i.test(value)) {
          brush.strokeColor = value;
          this.element.querySelector('input[name="strokeColor"]').value = value;
          this.#updateSwatchActive(value);
        }
        break;
      case "strokeWidth":
        brush.strokeWidth = Math.max(1, parseInt(value, 10) || 1);
        this.#updateRangeValue(input, `${brush.strokeWidth}px`);
        break;
      case "strokeAlpha":
        brush.strokeAlpha = Math.max(0.05, parseFloat(value) || 0.05);
        this.#updateRangeValue(
          input,
          `${Math.round(brush.strokeAlpha * 100)}%`,
        );
        break;
      case "strokeStyle":
        brush.strokeStyle = value;
        break;
      case "fillEnabled":
        brush.fillType = input.checked ? 1 : 0;
        saveBrushSettings();
        // Re-render to show/hide fill controls
        this.render();
        return; // Don't save again below
      case "fillColor":
        brush.fillColor = value;
        this.#updateColorText("fillColorText", value);
        this.#updateFillSwatchActive(value);
        break;
      case "fillColorText":
        if (/^#[0-9a-f]{6}$/i.test(value)) {
          brush.fillColor = value;
          this.element.querySelector('input[name="fillColor"]').value = value;
          this.#updateFillSwatchActive(value);
        }
        break;
      case "fillAlpha":
        brush.fillAlpha = Math.max(0, parseFloat(value) || 0);
        this.#updateRangeValue(input, `${Math.round(brush.fillAlpha * 100)}%`);
        break;
      case "bezierFactor":
        brush.bezierFactor = Math.max(0, parseFloat(value) || 0);
        this.#updateRangeValue(
          input,
          `${Math.round(brush.bezierFactor * 200)}%`,
        );
        break;
    }

    // Save on every change
    saveBrushSettings();
  }

  /**
   * Update the text display next to a color picker
   */
  #updateColorText(inputName, value) {
    const input = this.element.querySelector(`input[name="${inputName}"]`);
    if (input) input.value = value;
  }

  /**
   * Update the range value display
   */
  #updateRangeValue(rangeInput, text) {
    const span = rangeInput.parentElement?.querySelector(".range-value");
    if (span) span.textContent = text;
  }

  /**
   * Update which swatch is active for stroke
   */
  #updateSwatchActive(color) {
    const swatches = this.element.querySelectorAll(
      '[data-section="stroke"] .swatch',
    );
    swatches.forEach((swatch) => {
      const swatchColor = swatch.dataset.color;
      swatch.classList.toggle(
        "active",
        swatchColor?.toLowerCase() === color?.toLowerCase(),
      );
    });
  }

  /**
   * Update which swatch is active for fill
   */
  #updateFillSwatchActive(color) {
    const swatches = this.element.querySelectorAll(
      '[data-section="fill"] .swatch',
    );
    swatches.forEach((swatch) => {
      const swatchColor = swatch.dataset.color;
      swatch.classList.toggle(
        "active",
        swatchColor?.toLowerCase() === color?.toLowerCase(),
      );
    });
  }

  /**
   * Action: Toggle section expand/collapse
   */
  static #toggleSection(event, target) {
    const section = target.dataset.section;
    if (!section) return;

    this._sectionState[section] = !this._sectionState[section];

    const container = this.element.querySelector(
      `.collapsible[data-section="${section}"]`,
    );
    if (container) {
      container.classList.toggle("expanded", this._sectionState[section]);
    }
  }

  /**
   * Action: Pick stroke color from swatch
   */
  static #pickStrokeColor(event, target) {
    const color = target.dataset.color;
    if (!color) return;

    brush.strokeColor = color;
    saveBrushSettings();

    // Update UI
    const colorInput = this.element.querySelector('input[name="strokeColor"]');
    const textInput = this.element.querySelector(
      'input[name="strokeColorText"]',
    );
    if (colorInput) colorInput.value = color;
    if (textInput) textInput.value = color;

    // Update swatch active state
    const swatches = this.element.querySelectorAll(
      '[data-section="stroke"] .swatch',
    );
    swatches.forEach((swatch) => {
      swatch.classList.toggle(
        "active",
        swatch.dataset.color?.toLowerCase() === color.toLowerCase(),
      );
    });

    // Update legend preview
    const preview = this.element.querySelector(
      '[data-section="stroke"] .section-preview',
    );
    if (preview) preview.style.backgroundColor = color;
  }

  /**
   * Action: Pick fill color from swatch
   */
  static #pickFillColor(event, target) {
    const color = target.dataset.color;
    if (!color) return;

    brush.fillColor = color;
    saveBrushSettings();

    // Update UI
    const colorInput = this.element.querySelector('input[name="fillColor"]');
    const textInput = this.element.querySelector('input[name="fillColorText"]');
    if (colorInput) colorInput.value = color;
    if (textInput) textInput.value = color;

    // Update swatch active state
    const swatches = this.element.querySelectorAll(
      '[data-section="fill"] .swatch',
    );
    swatches.forEach((swatch) => {
      swatch.classList.toggle(
        "active",
        swatch.dataset.color?.toLowerCase() === color.toLowerCase(),
      );
    });

    // Update legend preview
    const preview = this.element.querySelector(
      '[data-section="fill"] .section-preview',
    );
    if (preview) preview.style.backgroundColor = color;
  }

  /**
   * Action: Load a preset
   */
  static #loadPreset(event, target) {
    const index = parseInt(target.dataset.index, 10);
    const presets = getPresets();
    const preset = presets[index];
    if (!preset) return;

    // Apply preset to brush
    brush.strokeColor = preset.strokeColor ?? brush.strokeColor;
    brush.strokeWidth = preset.strokeWidth ?? brush.strokeWidth;
    brush.strokeAlpha = preset.strokeAlpha ?? brush.strokeAlpha;
    brush.fillType = preset.fillType ?? brush.fillType;
    brush.fillColor = preset.fillColor ?? brush.fillColor;
    brush.fillAlpha = preset.fillAlpha ?? brush.fillAlpha;
    brush.bezierFactor = preset.bezierFactor ?? brush.bezierFactor;
    brush.strokeStyle = preset.strokeStyle ?? brush.strokeStyle;

    saveBrushSettings();

    // Re-render to update all UI
    this.render();
  }

  /**
   * Action: Delete a preset
   */
  static #deletePreset(event, target) {
    const index = parseInt(target.dataset.index, 10);
    const presets = getPresets();
    presets.splice(index, 1);
    savePresets(presets);
    this.render();
  }

  /**
   * Action: Save current brush as a preset
   */
  static #savePreset(event, target) {
    const nameInput = this.element.querySelector('input[name="presetName"]');
    const name = nameInput?.value?.trim();
    if (!name) {
      ui.notifications.warn("Please enter a preset name");
      return;
    }

    const preset = {
      name,
      strokeColor: brush.strokeColor,
      strokeWidth: brush.strokeWidth,
      strokeAlpha: brush.strokeAlpha,
      strokeStyle: brush.strokeStyle,
      fillType: brush.fillType,
      fillColor: brush.fillColor,
      fillAlpha: brush.fillAlpha,
      bezierFactor: brush.bezierFactor,
    };

    const presets = getPresets();
    presets.push(preset);
    savePresets(presets);

    // Clear input and re-render
    if (nameInput) nameInput.value = "";
    this.render();
  }
}
