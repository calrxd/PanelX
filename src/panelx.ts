import { LitElement, html, css, nothing } from "lit";
import { render } from "lit/html.js";

type HomeAssistant = any;

/* =======================================================================================
 *  Config Types
 * ======================================================================================= */

interface PanelXSection {
  title?: string;
  items: PanelXItem[];
}

type PanelXItem =
  | {
      type: "entity";
      entity: string;
      name?: string;
      icon?: string;
      secondary?: "state" | "last_changed" | "none";
    }
  | {
      type: "card";
      title?: string;
      card: any;
      editor_mode?: "code";
    };

type PanelXPreset = "dark" | "light" | "blue" | "green" | "glass" | "custom";

export interface PanelXConfig {
  type?: string;
  title?: string;
  sections?: PanelXSection[];

  sidebar?: {
    side?: "left" | "right";
    visibility?: "always_visible" | "collapsible";
  };

  toggle?: { show?: boolean; position?: "top" | "middle" | "bottom"; size?: number };

  appearance?: {
    preset?: PanelXPreset;
    width?: number;
    background?: string;
    title_color?: string;
    text_color?: string;
    secondary_text_color?: string;
    accent_color?: string;
    border_color?: string;
    dividers?: boolean;
  };

  /** Advanced: user CSS (overlay only) */
  css?: string;
}

/* =======================================================================================
 *  Defaults + Helpers
 * ======================================================================================= */

const DEFAULTS = {
  sidebar: { side: "right" as const, visibility: "collapsible" as const },
  toggle: { show: true, position: "middle" as const, size: 44 },
  appearance: {
    preset: "dark" as PanelXPreset,
    width: 380,
    background: "",
    title_color: "",
    text_color: "",
    secondary_text_color: "",
    accent_color: "",
    border_color: "",
    dividers: true
  }
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function timeFromISO(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function deepClone<T>(obj: T): T {
  try {
    // @ts-ignore
    if (typeof structuredClone === "function") return structuredClone(obj);
  } catch {}
  return JSON.parse(JSON.stringify(obj));
}

function safeStr(v: any, fallback = "") {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function isValidCssColor(v: string) {
  if (!v) return false;
  const s = new Option().style;
  s.color = "";
  s.color = v;
  return !!s.color;
}

function presetTokens(preset: PanelXPreset) {
  switch (preset) {
    case "light":
      return {
        bg: "rgba(255,255,255,0.96)",
        title: "rgba(0,0,0,0.92)",
        text: "rgba(0,0,0,0.86)",
        sub: "rgba(0,0,0,0.60)",
        border: "rgba(0,0,0,0.10)",
        accent: "var(--accent-color, #03a9f4)"
      };
    case "blue":
      return {
        bg: "rgba(10, 26, 45, 0.90)",
        title: "rgba(255,255,255,0.94)",
        text: "rgba(255,255,255,0.90)",
        sub: "rgba(255,255,255,0.70)",
        border: "rgba(255,255,255,0.12)",
        accent: "#4aa3ff"
      };
    case "green":
      return {
        bg: "rgba(10, 34, 22, 0.88)",
        title: "rgba(255,255,255,0.94)",
        text: "rgba(255,255,255,0.90)",
        sub: "rgba(255,255,255,0.70)",
        border: "rgba(255,255,255,0.12)",
        accent: "#4ddf7a"
      };
    case "glass":
      return {
        bg: "rgba(20,20,20,0.55)",
        title: "rgba(255,255,255,0.92)",
        text: "rgba(255,255,255,0.88)",
        sub: "rgba(255,255,255,0.68)",
        border: "rgba(255,255,255,0.12)",
        accent: "var(--accent-color, #03a9f4)"
      };
    case "custom":
    case "dark":
    default:
      return {
        bg: "rgba(20,20,20,0.92)",
        title: "rgba(255,255,255,0.94)",
        text: "rgba(255,255,255,0.90)",
        sub: "rgba(255,255,255,0.70)",
        border: "rgba(255,255,255,0.12)",
        accent: "var(--accent-color, #03a9f4)"
      };
  }
}

function mergeConfigWithDefaults(cfg: PanelXConfig): PanelXConfig {
  const out: PanelXConfig = deepClone(cfg ?? {});
  out.type = out.type ?? "custom:panelx-card";
  out.title = out.title ?? "PanelX";
  out.sections = out.sections ?? [];
  out.sidebar = { ...DEFAULTS.sidebar, ...(out.sidebar ?? {}) };
  out.toggle = { ...DEFAULTS.toggle, ...(out.toggle ?? {}) };
  out.appearance = { ...DEFAULTS.appearance, ...(out.appearance ?? {}) };
  out.css = out.css ?? "";
  return out;
}

/* =======================================================================================
 *  Collapsible helper (kept for compatibility; editor uses its own accordion)
 * ======================================================================================= */

function Expansion(props: { title: string; secondary?: string; open?: boolean; content: any }) {
  const hasHaPanel = !!customElements.get("ha-expansion-panel");
  if (hasHaPanel) {
    // @ts-ignore
    return html`
      <ha-expansion-panel .header=${props.title} ?expanded=${props.open ?? false}>
        ${props.secondary ? html`<div class="px-panel-sub">${props.secondary}</div>` : nothing}
        <div class="px-exp-content">${props.content}</div>
      </ha-expansion-panel>
    `;
  }

  return html`
    <details class="px-details" ?open=${props.open ?? false}>
      <summary class="px-details-sum">
        <span class="px-details-title">${props.title}</span>
        ${props.secondary ? html`<span class="px-details-sub">${props.secondary}</span>` : nothing}
      </summary>
      <div class="px-exp-content">${props.content}</div>
    </details>
  `;
}

/* =======================================================================================
 *  PanelX Card (overlay + inline preview)
 * ======================================================================================= */

class PanelXCard extends LitElement {
  public hass?: HomeAssistant;
  private _config!: PanelXConfig;

  private _overlayHost?: HTMLDivElement;
  private _toggleEl?: HTMLButtonElement;
  private _expanded = true;

  private _helpersPromise?: Promise<any>;
  private _embeddedCards = new Map<string, HTMLElement>();

  private _editObserver?: MutationObserver;
  private _editPoll?: number;
  private _isEditing = false;

  private _ownerId = `panelx-${Math.random().toString(16).slice(2)}`;

  static getStubConfig(): PanelXConfig {
    return {
      type: "custom:panelx-card",
      title: "PanelX",
      sidebar: { side: "right", visibility: "collapsible" },
      toggle: { show: true, position: "middle", size: 44 },
      appearance: { preset: "dark", width: 380, dividers: true },
      css: "",
      sections: [
        {
          title: "Quick Actions",
          items: [
            { type: "entity", entity: "light.office", secondary: "state" },
            { type: "entity", entity: "switch.kettle", secondary: "last_changed" }
          ]
        }
      ]
    };
  }

  static getConfigElement() {
    return document.createElement("panelx-editor");
  }

  connectedCallback(): void {
    super.connectedCallback();

    this._editObserver = new MutationObserver(() => this._applyEditModeState());
    this._editObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    this._editPoll = window.setInterval(() => this._applyEditModeState(), 500);
    this._applyEditModeState();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._destroyOverlayOwned();

    this._editObserver?.disconnect();
    this._editObserver = undefined;

    if (this._editPoll) {
      clearInterval(this._editPoll);
      this._editPoll = undefined;
    }
  }

  setConfig(config: PanelXConfig) {
    this._config = mergeConfigWithDefaults(config);

    const stored = localStorage.getItem(this._storageKey());
    if (stored === "true" || stored === "false") this._expanded = stored === "true";

    this._applyEditModeState();

    if (!this._isEditing) {
      this._ensureOverlay();
      this._applyOverlayTokens();
      this._applyUserCss();
      this._renderOverlay();
    }

    this.requestUpdate();
  }

  protected updated(): void {
    this._syncEmbeddedCardsHass();

    if (!this._isEditing) {
      this._applyOverlayTokens();
      this._renderOverlay();
    } else {
      this._mountEmbeddedCardsInNode(this.renderRoot as unknown as HTMLElement, "inline:").catch(() => undefined);
    }
  }

  private _storageKey() {
    return `panelx:${location.pathname}:expanded`;
  }

  private _detectEditMode(): boolean {
    try {
      const url = new URL(location.href);
      if (url.searchParams.get("edit") === "1") return true;
    } catch {}

    const body = document.body;
    const bodyEdit =
      body.classList.contains("edit-mode") ||
      body.classList.contains("edit") ||
      body.classList.contains("lovelace-edit-mode");

    const hui = document.querySelector("hui-root") as any;
    const huiEdit = !!hui?.editMode || !!hui?.lovelace?.editMode;

    const winEdit = !!(window as any)?.lovelace?.editMode;

            const hasEditUI = this._isAnyEditDialogOpen();

    return bodyEdit || huiEdit || winEdit || hasEditUI;
  }

    private _isAnyEditDialogOpen(): boolean {
    const selectors = [
      "hui-dialog-edit-card",
      "hui-dialog-edit-dashboard",
      "hui-dialog-edit-view",
      "hui-dialog-edit-lovelace",
      "hui-card-options"
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel) as any;
      if (!el) continue;

      // If the element itself exposes an open/opened flag
      if (el.open === true || el.opened === true) return true;

      // If it uses an 'open' attribute
      if (el.hasAttribute?.("open")) return true;

      // If it contains a dialog inside its shadow root
      const sr = el.shadowRoot as ShadowRoot | null;
      const openDialog = sr?.querySelector?.("ha-dialog[open], mwc-dialog[open]");
      if (openDialog) return true;
    }

    return false;
  }

  private _applyEditModeState() {
    const editingNow = this._detectEditMode();
    if (editingNow === this._isEditing) return;

    this._isEditing = editingNow;

    if (this._isEditing) {
      this._destroyOverlayOwned();
    } else {
      this._ensureOverlay();
      this._applyOverlayTokens();
      this._applyUserCss();
      this._renderOverlay();
    }

    this.requestUpdate();
  }

  private _destroyOverlayOwned() {
    const overlay = document.querySelector<HTMLDivElement>(`#panelx-overlay[data-owner="${this._ownerId}"]`);
    const toggle = document.querySelector<HTMLButtonElement>(`#panelx-toggle[data-owner="${this._ownerId}"]`);

    try {
      overlay?.remove();
      toggle?.remove();
    } catch {}

    if (this._overlayHost?.getAttribute("data-owner") === this._ownerId) this._overlayHost = undefined;
    if (this._toggleEl?.getAttribute("data-owner") === this._ownerId) this._toggleEl = undefined;

    for (const [k, v] of Array.from(this._embeddedCards.entries())) {
      if (k.startsWith("overlay:")) {
        try {
          v.remove();
        } catch {}
        this._embeddedCards.delete(k);
      }
    }
  }

  /* ---------- Tokens ---------- */

  private _computeTokens() {
    const ap = this._config?.appearance ?? DEFAULTS.appearance;
    const preset = ap.preset ?? "dark";
    const base = presetTokens(preset);

    const bg = isValidCssColor(ap.background ?? "") ? (ap.background as string) : base.bg;
    const title = isValidCssColor(ap.title_color ?? "") ? (ap.title_color as string) : base.title;
    const text = isValidCssColor(ap.text_color ?? "") ? (ap.text_color as string) : base.text;
    const sub = isValidCssColor(ap.secondary_text_color ?? "")
      ? (ap.secondary_text_color as string)
      : base.sub;
    const border = isValidCssColor(ap.border_color ?? "") ? (ap.border_color as string) : base.border;
    const accent = isValidCssColor(ap.accent_color ?? "") ? (ap.accent_color as string) : base.accent;

    return { bg, title, text, sub, border, accent };
  }

  private _applyOverlayTokens() {
    if (!this._overlayHost) return;

    const ap = this._config.appearance!;
    const t = this._computeTokens();
    const width = clamp(Number(ap.width ?? DEFAULTS.appearance.width), 260, 680);

    this._overlayHost.style.width = `${width}px`;
    this._overlayHost.style.setProperty("--px-bg", t.bg);
    this._overlayHost.style.setProperty("--px-title", t.title);
    this._overlayHost.style.setProperty("--px-text", t.text);
    this._overlayHost.style.setProperty("--px-sub", t.sub);
    this._overlayHost.style.setProperty("--px-border", t.border);
    this._overlayHost.style.setProperty("--px-accent", t.accent);

    const side = this._config.sidebar?.side ?? DEFAULTS.sidebar.side;
    if (side === "left") {
      this._overlayHost.style.setProperty("--px-left", "12px");
      this._overlayHost.style.setProperty("--px-right", "auto");
    } else {
      this._overlayHost.style.setProperty("--px-right", "12px");
      this._overlayHost.style.setProperty("--px-left", "auto");
    }

    if (this._toggleEl) {
      if (side === "left") {
        this._toggleEl.style.setProperty("--px-toggle-left", "0");
        this._toggleEl.style.setProperty("--px-toggle-right", "auto");
        this._toggleEl.style.borderRadius = "0 999px 999px 0";
      } else {
        this._toggleEl.style.setProperty("--px-toggle-right", "0");
        this._toggleEl.style.setProperty("--px-toggle-left", "auto");
        this._toggleEl.style.borderRadius = "999px 0 0 999px";
      }
    }
  }

  private _inlineVarsStyleAttr() {
    const t = this._computeTokens();
    return `--px-bg:${t.bg};--px-title:${t.title};--px-text:${t.text};--px-sub:${t.sub};--px-border:${t.border};--px-accent:${t.accent};`;
  }

  /* ---------- Render ---------- */

  protected render() {
    if (this._isEditing) {
      return html`
        <ha-card class="inline-card">
          <div class="inline-wrap">
            <div class="inline-head">
              <div class="inline-title">${this._config?.title ?? "PanelX"}</div>
              <div class="inline-sub">Inline preview (overlay disabled while editing).</div>
            </div>
            <div class="inline-preview" style=${this._inlineVarsStyleAttr()}>
              ${this._panelTemplate("inline:", true)}
            </div>
          </div>
        </ha-card>
      `;
    }
    return html`${nothing}`;
  }

  /* ---------- Overlay ---------- */

  private _ensureOverlay() {
    let existing = document.querySelector<HTMLDivElement>("#panelx-overlay");
    let existingToggle = document.querySelector<HTMLButtonElement>("#panelx-toggle");

    if (existing && !existing.getAttribute("data-owner")) {
      try {
        existing.remove();
      } catch {}
      existing = null as any;
    }
    if (existingToggle && !existingToggle.getAttribute("data-owner")) {
      try {
        existingToggle.remove();
      } catch {}
      existingToggle = null as any;
    }

    if (existing && existingToggle && existing.getAttribute("data-owner") === this._ownerId) {
      this._overlayHost = existing;
      this._toggleEl = existingToggle;
      return;
    }

    this._overlayHost = document.createElement("div");
    this._overlayHost.id = "panelx-overlay";
    this._overlayHost.setAttribute("data-owner", this._ownerId);
    document.body.appendChild(this._overlayHost);

    this._toggleEl = document.createElement("button");
    this._toggleEl.id = "panelx-toggle";
    this._toggleEl.setAttribute("data-owner", this._ownerId);
    this._toggleEl.type = "button";
    this._toggleEl.setAttribute("aria-label", "Toggle PanelX");
    this._toggleEl.addEventListener("click", () => this._toggle());
    document.body.appendChild(this._toggleEl);

    this._injectGlobalCss();
  }

  private _toggle() {
    const visibility = this._config.sidebar?.visibility ?? DEFAULTS.sidebar.visibility;
    if (visibility !== "collapsible") return;

    this._expanded = !this._expanded;
    localStorage.setItem(this._storageKey(), String(this._expanded));
    this._renderOverlay();
  }

  private _renderOverlay() {
    if (!this._overlayHost || !document.body.contains(this._overlayHost) || !this._toggleEl || !document.body.contains(this._toggleEl)) {
      this._ensureOverlay();
    }
    if (!this._overlayHost || !this._toggleEl || !this._config) return;
    if (this._isEditing) return;

    const visibility = this._config.sidebar?.visibility ?? DEFAULTS.sidebar.visibility;
    const collapsible = visibility === "collapsible";
    if (!collapsible) this._expanded = true;

    const size = clamp(this._config.toggle?.size ?? DEFAULTS.toggle.size, 32, 64);
    const pos = this._config.toggle?.position ?? DEFAULTS.toggle.position;
    const showToggle = (this._config.toggle?.show ?? DEFAULTS.toggle.show) && collapsible;

    this._toggleEl.style.display = showToggle ? "" : "none";
    this._toggleEl.style.width = `${size}px`;
    this._toggleEl.style.height = `${size}px`;
    this._toggleEl.style.top = "";
    this._toggleEl.style.bottom = "";
    this._toggleEl.style.transform = "";

    if (pos === "top") this._toggleEl.style.top = "96px";
    else if (pos === "bottom") this._toggleEl.style.bottom = "24px";
    else {
      this._toggleEl.style.top = "50%";
      this._toggleEl.style.transform = "translateY(-50%)";
    }

    this._overlayHost.style.display = this._expanded ? "" : "none";
    this._toggleEl.textContent = this._expanded ? "‹" : "›";

    render(this._panelTemplate("overlay:", false), this._overlayHost);
    this._mountEmbeddedCardsInNode(this._overlayHost, "overlay:").catch(() => undefined);
    this._applyUserCss();
  }

  private _panelTemplate(prefix: "overlay:" | "inline:", inlineMode: boolean) {
    const ap = this._config.appearance!;
    const dividers = !!ap.dividers;

    return html`
      <div class="px-shell ${inlineMode ? "px-shell--inline" : ""} ${dividers ? "px-dividers" : ""}">
                ${(() => {
          const t = (this._config.title ?? "").trim();
          const show = t.length > 0;
          return show
            ? html`
                <div class="px-header">
                  <div class="px-header-title">${t}</div>
                </div>
              `
            : nothing;
        })()}

        <div class="px-body" tabindex="0">
          ${(this._config.sections ?? []).map(
            (s, si) => html`
              <section class="px-section">
                ${s.title ? html`<div class="px-section-title">${s.title}</div>` : nothing}
                <div class="px-stack">
                  ${(s.items ?? []).map((item, ii) => this._itemTemplate(item, prefix, si, ii))}
                </div>
              </section>
            `
          )}
        </div>
      </div>
    `;
  }

  private _slotId(prefix: string, sectionIndex: number, itemIndex: number) {
    return `${prefix}s${sectionIndex}-i${itemIndex}`;
  }

  private _itemTemplate(item: PanelXItem, prefix: string, sectionIndex: number, itemIndex: number) {
    if (item.type === "entity") {
      const st = this.hass?.states?.[item.entity];
      const name = item.name ?? st?.attributes?.friendly_name ?? item.entity ?? "entity";
      const icon = item.icon ?? st?.attributes?.icon;

      const secondaryMode = item.secondary ?? "state";
      const secondary =
        secondaryMode === "none"
          ? ""
          : secondaryMode === "last_changed"
            ? timeFromISO(st?.last_changed)
            : safeStr(st?.state, "—");

      const isOn = ["on", "open", "home", "playing"].includes(safeStr(st?.state, "").toLowerCase());

      return html`
        <button
          class="px-row ${isOn ? "is-on" : "is-off"}"
          @click=${() => {
            document.body.dispatchEvent(
              new CustomEvent("hass-more-info", {
                detail: { entityId: item.entity },
                bubbles: true,
                composed: true
              })
            );
          }}
        >
          ${icon
            ? html`<ha-icon class="px-icon" .icon=${icon}></ha-icon>`
            : html`<span class="px-icon-spacer"></span>`}
          <div class="px-main">
            <div class="px-title">${name}</div>
            <div class="px-sub">${secondary || "—"}</div>
          </div>
          <span class="px-chevron">›</span>
        </button>
      `;
    }

    if (item.type === "card") {
      const slotId = this._slotId(prefix, sectionIndex, itemIndex);
      return html`
        ${item.title ? html`<div class="px-card-title">${item.title}</div>` : nothing}
        <div class="px-card-slot" data-slot-id=${slotId}></div>
      `;
    }

    return nothing;
  }

  private async _helpers() {
    if (this._helpersPromise) return this._helpersPromise;
    const loader = (window as any).loadCardHelpers;
    this._helpersPromise =
      typeof loader === "function" ? loader() : Promise.reject(new Error("Home Assistant card helpers unavailable"));
    return this._helpersPromise;
  }

  private _findCardConfigForSlotId(slotId: string): any | null {
    const m = /^(overlay:|inline:)s(\d+)-i(\d+)$/.exec(slotId);
    if (!m) return null;
    const si = Number(m[2]);
    const ii = Number(m[3]);
    const item = this._config.sections?.[si]?.items?.[ii];
    if (item && item.type === "card") return item.card;
    return null;
  }

  private async _mountEmbeddedCardsInNode(rootNode: HTMLElement, keyPrefix: "overlay:" | "inline:") {
    const helpers = await this._helpers().catch(() => null);
    if (!helpers) return;

    const slots = Array.from(rootNode.querySelectorAll<HTMLDivElement>(".px-card-slot[data-slot-id]"));

    for (const slot of slots) {
      const slotId = slot.getAttribute("data-slot-id");
      if (!slotId) continue;
      if (!slotId.startsWith(keyPrefix)) continue;

      const cfg = this._findCardConfigForSlotId(slotId);
      if (!cfg) continue;

      const mapKey = slotId;
      let cardEl = this._embeddedCards.get(mapKey);

      const cfgKey = JSON.stringify(cfg);
      const existingKey = (cardEl as any)?.__panelx_cfg_key;

      if (!cardEl || existingKey !== cfgKey) {
        if (cardEl) cardEl.remove();
        cardEl = helpers.createCardElement(cfg);
        (cardEl as any).__panelx_cfg_key = cfgKey;
        this._embeddedCards.set(mapKey, cardEl);
      }

      if (slot.firstChild !== cardEl) {
        slot.innerHTML = "";
        slot.appendChild(cardEl);
      }

      if (this.hass) (cardEl as any).hass = this.hass;
    }
  }

  private _syncEmbeddedCardsHass() {
    if (!this.hass) return;
    for (const el of this._embeddedCards.values()) (el as any).hass = this.hass;
  }

  private _applyUserCss() {
    const cssText = this._config?.css ?? "";
    const id = `panelx-user-style-${this._ownerId}`;

    let styleEl = document.getElementById(id) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = id;
      styleEl.setAttribute("data-owner", this._ownerId);
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = cssText
      ? `/* PanelX custom CSS (overlay only) */\n#panelx-overlay[data-owner="${this._ownerId}"] ${cssText}\n`
      : "";
  }

  private _injectGlobalCss() {
    let s = document.getElementById("panelx-style") as HTMLStyleElement | null;

    if (!s) {
      s = document.createElement("style");
      s.id = "panelx-style";
      document.head.appendChild(s);
    }

    s.textContent = `
      #panelx-overlay {
        position: fixed;
        right: var(--px-right, 12px);
        left: var(--px-left, auto);
        top: 68px;
        bottom: 12px;
        z-index: 10;
        pointer-events: auto;

        --px-bg: rgba(20,20,20,0.92);
        --px-title: rgba(255,255,255,0.94);
        --px-text: rgba(255,255,255,0.90);
        --px-sub: rgba(255,255,255,0.70);
        --px-border: rgba(255,255,255,0.12);
        --px-accent: var(--accent-color, #03a9f4);
      }

      #panelx-overlay .px-shell { height: 100%; }

      #panelx-toggle {
        position: fixed;
        right: var(--px-toggle-right, 0);
        left: var(--px-toggle-left, auto);
        z-index: 11;
        border: none;
        border-radius: 999px 0 0 999px;
        background: var(--ha-card-background, var(--card-background-color, rgba(20,20,20,0.92)));
        color: var(--primary-text-color, #fff);
        box-shadow: var(--ha-card-box-shadow, 0 10px 24px rgba(0,0,0,0.35));
        cursor: pointer;
        font-size: 22px;
        line-height: 1;
        padding: 0;
        user-select: none;
      }

      #panelx-overlay .px-shell {
        border-radius: 18px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: var(--px-bg);
        color: var(--px-text);
        box-shadow: none;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      #panelx-overlay .px-header {
        padding: 16px 16px 12px;
        border-bottom: 1px solid var(--px-border);
      }

      #panelx-overlay .px-header-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--px-title);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #panelx-overlay .px-body {
        padding: 14px;
        overflow: auto;
      }

      #panelx-overlay .px-section + .px-section {
        margin-top: 18px;
      }

      #panelx-overlay .px-dividers .px-section + .px-section {
        padding-top: 18px;
        border-top: 1px solid var(--px-border);
        margin-top: 18px;
      }

      #panelx-overlay .px-section-title {
        margin: 0 2px 10px;
        font-size: 12px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--px-sub);
        font-weight: 600;
      }

      #panelx-overlay .px-stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      #panelx-overlay .px-row {
        width: 100%;
        border: 1px solid var(--px-border);
        background: rgba(255, 255, 255, 0.04);
        border-radius: 14px;
        padding: 10px 12px;
        display: grid;
        grid-template-columns: 24px 1fr 16px;
        gap: 10px;
        align-items: center;
        text-align: left;
        cursor: pointer;
        color: var(--px-text);
        transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
      }

      #panelx-overlay .px-row:hover {
        transform: translateY(-1px);
        background: rgba(255, 255, 255, 0.06);
        border-color: color-mix(in srgb, var(--px-border) 60%, var(--px-accent));
      }

      #panelx-overlay ha-icon.px-icon {
        width: 20px;
        height: 20px;
        display: block;
      }

      #panelx-overlay .px-icon-spacer {
        width: 20px;
        height: 20px;
        display: block;
      }

      #panelx-overlay .px-main {
        min-width: 0;
      }

      #panelx-overlay .px-title {
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #panelx-overlay .px-sub {
        margin-top: 2px;
        font-size: 12px;
        color: var(--px-sub);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #panelx-overlay .px-chevron {
        opacity: 0.7;
        font-size: 18px;
        justify-self: end;
      }

      #panelx-overlay .px-row.is-on ha-icon.px-icon {
        color: var(--px-accent);
      }

      #panelx-overlay .px-row.is-off ha-icon.px-icon {
        color: color-mix(in srgb, var(--px-text) 65%, transparent);
      }

      #panelx-overlay .px-card-title {
        margin: 6px 2px 10px;
        font-size: 12px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--px-sub);
        font-weight: 600;
      }

      #panelx-overlay .px-card-slot {
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid var(--px-border);
        background: rgba(255, 255, 255, 0.02);
      }

      #panelx-overlay .px-card-slot > * {
        width: 100%;
      }
    `;
  }

  static styles = css`
    .inline-wrap {
      padding: 14px;
      display: grid;
      gap: 10px;
    }
    .inline-head {
      display: grid;
      gap: 4px;
    }
    .inline-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .inline-sub {
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .inline-preview {
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    }

    .px-shell {
      border-radius: 18px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: var(--px-bg);
      color: var(--px-text);
      box-shadow: none;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .px-shell--inline {
      max-height: 520px;
    }

    .px-header {
      padding: 16px 16px 12px;
      border-bottom: 1px solid var(--px-border);
    }
    .px-header-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--px-title);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .px-body {
      padding: 14px;
      overflow: auto;
    }

    .px-section + .px-section {
      margin-top: 18px;
    }
    .px-dividers .px-section + .px-section {
      padding-top: 18px;
      border-top: 1px solid var(--px-border);
      margin-top: 18px;
    }
    .px-section-title {
      margin: 0 2px 10px;
      font-size: 12px;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--px-sub);
      font-weight: 600;
    }

    .px-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .px-row {
      width: 100%;
      border: 1px solid var(--px-border);
      background: rgba(255, 255, 255, 0.04);
      border-radius: 14px;
      padding: 10px 12px;
      display: grid;
      grid-template-columns: 24px 1fr 16px;
      gap: 10px;
      align-items: center;
      text-align: left;
      cursor: pointer;
      color: var(--px-text);
      transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
    }
    .px-row:hover {
      transform: translateY(-1px);
      background: rgba(255, 255, 255, 0.06);
      border-color: color-mix(in srgb, var(--px-border) 60%, var(--px-accent));
    }
    ha-icon.px-icon {
      width: 20px;
      height: 20px;
      display: block;
    }
    .px-icon-spacer {
      width: 20px;
      height: 20px;
      display: block;
    }

    .px-main {
      min-width: 0;
    }
    .px-title {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .px-sub {
      margin-top: 2px;
      font-size: 12px;
      color: var(--px-sub);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .px-chevron {
      opacity: 0.7;
      font-size: 18px;
      justify-self: end;
    }

    .px-row.is-on ha-icon.px-icon {
      color: var(--px-accent);
    }
    .px-row.is-off ha-icon.px-icon {
      color: color-mix(in srgb, var(--px-text) 65%, transparent);
    }

    .px-card-title {
      margin: 6px 2px 10px;
      font-size: 12px;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--px-sub);
      font-weight: 600;
    }
    .px-card-slot {
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid var(--px-border);
      background: rgba(255, 255, 255, 0.02);
    }
    .px-card-slot > * {
      width: 100%;
    }
  `;
}

/* =======================================================================================
 *  PanelX Editor
 * ======================================================================================= */

class PanelXEditor extends LitElement {
  public hass?: HomeAssistant;

  private _config: PanelXConfig = mergeConfigWithDefaults(PanelXCard.getStubConfig());

  private _pendingAddCardSi: number | null = null;

    // ===== Embedded card code-only draft + validation state =====
  private _cardDrafts = new Map<string, string>(); // key = "si:ii"
  private _cardErrors = new Map<string, string>(); // key = "si:ii"

  static properties = {
    hass: {},
    _config: { state: true },
    _activeSection: { state: true },
    _openContent: { state: true },
    _openSidebar: { state: true },
    _openStyle: { state: true },
    _openAdvanced: { state: true },
    _pickerOpen: { state: true },
    _pickerQuery: { state: true }
  };

  private _activeSection = 0;
  private _openContent = false;
  private _openSidebar = false;
  private _openStyle = false;
  private _openAdvanced = false;

  private _dragItem: { si: number; ii: number } | null = null;
  private _dropTarget: { si: number; index: number } | null = null;

  private _clipboardItem: PanelXItem | null = null;
  private _clipboardSection: PanelXSection | null = null;

  private _pickerOpen = false;
  private _pickerQuery = "";
  private _pickerTarget: { si: number; ii: number } | null = null;

  setConfig(config: PanelXConfig) {
    this._config = mergeConfigWithDefaults(config ?? {});
    if (this._activeSection >= (this._config.sections?.length ?? 0)) this._activeSection = 0;
    
    // TEMP: force embedded cards to code-only
    for (const sec of this._config.sections ?? []) {
      for (const item of sec.items ?? []) {
        if ((item as any).type === "card") (item as any).editor_mode = "code";
      }
    }
  }

  private _cardKey(si: number, ii: number) {
    return `${si}:${ii}`;
  }

  private _tryParseJson(raw: string) {
    return JSON.parse(raw);
  }

    private _titleBar() {
      const current = String(this._config.title ?? "PanelX");
      const show = current.trim().length > 0;

    return html`
      <div class="titlebar">
        <div class="titlebar-label">Sidebar Title</div>
        <div class="titlebar-sub">Rename it, or hide it completely.</div>

        <ha-textfield
          class="titlebar-input"
          label="Title"
          .value=${show ? current : ""}
          placeholder="PanelX"
          ?disabled=${!show}
          @input=${(e: any) => this._set(["title"], e.target.value)}
        ></ha-textfield>

        <ha-formfield label="Show title">
          <ha-switch
            .checked=${show}
            @click=${this._stopDialogClose}
            @mousedown=${this._stopDialogClose}
            @change=${(e: any) => {
              const on = Boolean(e.target.checked);
              if (!on) {
                this._set(["title"], "");
              } else {
                const restored = (String(this._config.title ?? "").trim() || "PanelX");
                this._set(["title"], restored);
              }
            }}
          ></ha-switch>
        </ha-formfield>
      </div>
    `;
  }

  private _emit() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true
      })
    );
  }

  private _normalizeCustomCardType(t: string) {
    const type = (t ?? "").trim();
    if (!type) return type;
    // If it already has a namespace (e.g. "custom:...", "hui:...", etc.) leave it alone
    if (type.includes(":")) return type;
    return `custom:${type}`;
  }

  private _getLovelace(): any {
    // 1) If HA injected it (sometimes happens in editors)
    const direct = (this as any).lovelace;
    if (direct) return direct;

    // 2) Common HA locations
    const hui = document.querySelector("hui-root") as any;
    if (hui?.lovelace) return hui.lovelace;

    const home = document.querySelector("home-assistant") as any;
    if (home?.lovelace) return home.lovelace;

    // 3) Fallbacks
    const winAny = window as any;
    if (winAny?.lovelace) return winAny.lovelace;

    return null;
  }


  
  private _splitTwoCols<T>(list: T[]) {
    const mid = Math.ceil(list.length / 2);
    return [list.slice(0, mid), list.slice(mid)];
  }

  private _set(path: (keyof PanelXConfig | string)[], value: any) {
    const next = deepClone(this._config) as any;
    let cur = next;
    for (let i = 0; i < path.length - 1; i++) {
      cur[path[i]] = cur[path[i]] ?? {};
      cur = cur[path[i]];
    }
    cur[path[path.length - 1]] = value;
    this._config = mergeConfigWithDefaults(next);
    this._emit();
  }

  /** Prevent HA dialog scrim from treating dropdown/menu clicks as “outside click”. */
  private _stopDialogClose(e: Event) {
    e.stopPropagation();
  }

  private _sections() {
    return this._config.sections ?? [];
  }

  private _activeSec(): PanelXSection | null {
    return this._sections()[this._activeSection] ?? null;
  }

  private _addSection() {
    const next = deepClone(this._config);
    next.sections = next.sections ?? [];
    next.sections.push({ title: `Section ${next.sections.length + 1}`, items: [] });
    this._config = mergeConfigWithDefaults(next);
    this._activeSection = (next.sections.length ?? 1) - 1;
    this._emit();
  }

    private _addItem(type: "entity" | "card") {
    // Ensure we have at least one section
    if ((this._config.sections?.length ?? 0) === 0) {
      this._addSection();
      // _addSection emits and sets active section. Continue after section exists.
    }

    const next = deepClone(this._config);
    next.sections = next.sections ?? [];
    next.sections[this._activeSection] = next.sections[this._activeSection] ?? { title: "", items: [] };
    next.sections[this._activeSection].items = next.sections[this._activeSection].items ?? [];

    if (type === "entity") {
      next.sections[this._activeSection].items.push({ type: "entity", entity: "", secondary: "state" });
      this._config = mergeConfigWithDefaults(next);
      this._emit();
      return;
    }

    // ✅ Card: open picker immediately, and only add the item after choosing a card
    this._config = mergeConfigWithDefaults(next); // keep config synced (in case section was just created)
    this._pendingAddCardSi = this._activeSection;
    this._pickerTarget = { si: this._activeSection, ii: -1 }; // ii = -1 means "add new"
    this._pickerQuery = "";
    this._pickerOpen = true;
    this.requestUpdate();
  }


  private _removeSection(si: number) {
    const next = deepClone(this._config);
    next.sections = (next.sections ?? []).filter((_, i) => i !== si);
    this._config = mergeConfigWithDefaults(next);
    this._activeSection = Math.max(0, Math.min(this._activeSection, (this._config.sections?.length ?? 1) - 1));
    this._emit();
  }

  private _duplicateSection(si: number) {
    const next = deepClone(this._config);
    const sec = next.sections?.[si];
    if (!sec) return;
    next.sections = next.sections ?? [];
    next.sections.splice(si + 1, 0, deepClone(sec));
    this._config = mergeConfigWithDefaults(next);
    this._activeSection = si + 1;
    this._emit();
  }

  private _setSectionTitle(si: number, title: string) {
    const next = deepClone(this._config);
    next.sections = next.sections ?? [];
    if (!next.sections[si]) return;
    next.sections[si].title = title;
    this._config = mergeConfigWithDefaults(next);
    this._emit();
  }

  private _duplicateItem(si: number, ii: number) {
    const next = deepClone(this._config);
    const item = next.sections?.[si]?.items?.[ii];
    if (!item) return;
    next.sections![si].items.splice(ii + 1, 0, deepClone(item));
    this._config = mergeConfigWithDefaults(next);
    this._emit();
  }

  private _removeItem(si: number, ii: number) {
    const next = deepClone(this._config);
    next.sections![si].items = (next.sections![si].items ?? []).filter((_, i) => i !== ii);
    this._config = mergeConfigWithDefaults(next);
    this._emit();
  }

  private _moveItemCross(fromSi: number, fromIi: number, toSi: number, toIndex: number) {
    const next = deepClone(this._config);
    const fromItems = next.sections?.[fromSi]?.items ?? [];
    const toItems = next.sections?.[toSi]?.items ?? [];

    if (!fromItems[fromIi]) return;
    const [moving] = fromItems.splice(fromIi, 1);

    let insertAt = toIndex;
    if (fromSi === toSi && fromIi < toIndex) insertAt = toIndex - 1;

    insertAt = Math.max(0, Math.min(insertAt, toItems.length));
    toItems.splice(insertAt, 0, moving);

    next.sections![fromSi].items = fromItems;
    next.sections![toSi].items = toItems;

    this._config = mergeConfigWithDefaults(next);
    this._emit();
  }

  private _ghostLabel(): string {
    if (!this._dragItem) return "";
    const item = this._config.sections?.[this._dragItem.si]?.items?.[this._dragItem.ii];
    if (!item) return "";
    if (item.type === "entity") {
      const name =
        item.name || this.hass?.states?.[item.entity]?.attributes?.friendly_name || item.entity || "Entity";
      return `Entity: ${name}`;
    }
    if (item.type === "card") {
      const title = item.title || item.card?.title || item.card?.type || "Card";
      return `Card: ${title}`;
    }
    return "Item";
  }

    private _onItemDragStart(e: DragEvent, si: number, ii: number) {
    this._dragItem = { si, ii };
    this._dropTarget = { si, index: ii };

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `panelx:item:${si}:${ii}`);

      // Create a nicer drag preview (small + stable)
      const ghost = document.createElement("div");
      ghost.style.position = "absolute";
      ghost.style.top = "-1000px";
      ghost.style.left = "-1000px";
      ghost.style.padding = "8px 10px";
      ghost.style.borderRadius = "999px";
      ghost.style.fontSize = "12px";
      ghost.style.fontWeight = "700";
      ghost.style.background = "rgba(0,0,0,0.65)";
      ghost.style.color = "white";
      ghost.style.pointerEvents = "none";
      ghost.style.whiteSpace = "nowrap";
      ghost.textContent = this._ghostLabel() || "Moving item";

      document.body.appendChild(ghost);
      try {
        e.dataTransfer.setDragImage(ghost, 10, 10);
      } catch {}
      setTimeout(() => ghost.remove(), 0);
    }

    this.requestUpdate();
  }

    private _onDragEnd() {
    this._dragItem = null;
    this._dropTarget = null;
    this.requestUpdate();
  }

  private _onListDragOver(e: DragEvent, si: number) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

    const list = e.currentTarget as HTMLElement | null;
    if (!list) return;

    const items = Array.from(list.querySelectorAll<HTMLElement>(".item[data-ii]"));
    const y = e.clientY;

    let index = items.length; // default: drop at end

    for (const el of items) {
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const ii = Number(el.getAttribute("data-ii") ?? "0");
      if (y < mid) {
        index = ii;
        break;
      }
    }

    // Avoid thrashing updates
    const same = this._dropTarget?.si === si && this._dropTarget?.index === index;
    if (!same) {
      this._dropTarget = { si, index };
      this.requestUpdate();
    }
  }

  private _onListDrop(e: DragEvent, si: number) {
    e.preventDefault();

    const from = this._dragItem;
    const to = this._dropTarget;

    this._dragItem = null;
    this._dropTarget = null;

    if (!from || !to) {
      this.requestUpdate();
      return;
    }

    this._moveItemCross(from.si, from.ii, to.si, to.index);
    this.requestUpdate();
  }

  private _onListLeave(e: DragEvent) {
    // Only clear if leaving the whole list (not moving between children)
    const list = e.currentTarget as HTMLElement;
    const related = (e as any).relatedTarget as Node | null;
    if (related && list.contains(related)) return;

    this._dropTarget = null;
    this.requestUpdate();
  }

  private _setEntity(si: number, ii: number, entity: string) {
    const next = deepClone(this._config);
    const item = next.sections?.[si]?.items?.[ii];
    if (item && item.type === "entity") item.entity = entity;
    this._config = mergeConfigWithDefaults(next);
    this._emit();
  }

  private _setEntitySecondary(si: number, ii: number, secondary: any) {
    const next = deepClone(this._config);
    const item = next.sections?.[si]?.items?.[ii];
    if (item && item.type === "entity") item.secondary = secondary;
    this._config = mergeConfigWithDefaults(next);
    this._emit();
  }

  private _setEntityField(si: number, ii: number, field: "name" | "icon", value: string) {
    const next = deepClone(this._config);
    const item: any = next.sections?.[si]?.items?.[ii];
    if (item && item.type === "entity") item[field] = value;
    this._config = mergeConfigWithDefaults(next);
    this._emit();
  }

  private _setCardField(si: number, ii: number, field: "title" | "editor_mode", value: any) {
    const next = deepClone(this._config);
    const item: any = next.sections?.[si]?.items?.[ii];
    if (item && item.type === "card") item[field] = value;
    this._config = mergeConfigWithDefaults(next);
    this._emit();
  }

  private _setCardConfig(si: number, ii: number, cardCfg: any) {
    const next = deepClone(this._config);
    const item: any = next.sections?.[si]?.items?.[ii];
    if (item && item.type === "card") item.card = cardCfg;
    this._config = mergeConfigWithDefaults(next);
    this._emit();
  }

  // ===== Clipboard + picker helpers =====

  private _copySection(si: number) {
    const sec = this._config.sections?.[si];
    if (!sec) return;
    this._clipboardSection = deepClone(sec);
    this.requestUpdate();
  }

  private _pasteSectionAfter(si: number) {
    if (!this._clipboardSection) return;
    const next = deepClone(this._config);
    next.sections = next.sections ?? [];
    next.sections.splice(si + 1, 0, deepClone(this._clipboardSection));
    this._config = mergeConfigWithDefaults(next);
    this._activeSection = si + 1;
    this._emit();
  }

  private _copyItem(si: number, ii: number) {
    const item = this._config.sections?.[si]?.items?.[ii];
    if (!item) return;
    this._clipboardItem = deepClone(item);
    this.requestUpdate();
  }

  private _pasteItemAfter(si: number, ii: number) {
    if (!this._clipboardItem) return;
    const next = deepClone(this._config);
    next.sections = next.sections ?? [];
    next.sections[si] = next.sections[si] ?? { title: "", items: [] };
    next.sections[si].items = next.sections[si].items ?? [];
    next.sections[si].items.splice(ii + 1, 0, deepClone(this._clipboardItem));
    this._config = mergeConfigWithDefaults(next);
    this._emit();
  }

  private _builtinCardTemplates(): Array<{ type: string; name: string; icon: string; template: any }> {
    return [
      { type: "entities", name: "Entities", icon: "mdi:format-list-bulleted", template: { type: "entities", entities: [] } },
      { type: "glance", name: "Glance", icon: "mdi:view-grid-outline", template: { type: "glance", entities: [] } },
      { type: "button", name: "Button", icon: "mdi:gesture-tap-button", template: { type: "button", entity: "" } },
      { type: "markdown", name: "Markdown", icon: "mdi:language-markdown-outline", template: { type: "markdown", content: "Edit me" } },
      { type: "gauge", name: "Gauge", icon: "mdi:gauge", template: { type: "gauge", entity: "" } },
      { type: "thermostat", name: "Thermostat", icon: "mdi:thermostat", template: { type: "thermostat", entity: "" } },
      { type: "media-control", name: "Media control", icon: "mdi:play-circle-outline", template: { type: "media-control", entity: "" } },
      { type: "history-graph", name: "History graph", icon: "mdi:chart-line", template: { type: "history-graph", entities: [] } },
      { type: "iframe", name: "iFrame", icon: "mdi:web", template: { type: "iframe", url: "https://example.com" } },
      { type: "map", name: "Map", icon: "mdi:map", template: { type: "map", entities: [] } },
      { type: "calendar", name: "Calendar", icon: "mdi:calendar", template: { type: "calendar", entities: [] } },
      { type: "weather-forecast", name: "Weather forecast", icon: "mdi:weather-partly-cloudy", template: { type: "weather-forecast", entity: "" } }
    ];
  }

  private _customCardsList(): Array<{ type: string; name: string; description?: string }> {
    const cc = (window as any).customCards;
    if (!Array.isArray(cc)) return [];

    return cc
      .map((c: any) => {
        const rawType = typeof c.type === "string" ? c.type : "";
        const yamlType = this._normalizeCustomCardType(rawType);

        return {
          type: yamlType,
          name: c.name ?? rawType ?? yamlType,
          description: c.description ?? ""
        };
      })
      .filter((c: any) => typeof c.type === "string" && c.type.length > 0);
  }


  private _openPicker(si: number, ii: number) {
    this._pickerTarget = { si, ii };
    this._pickerQuery = "";
    this._pickerOpen = true;
    this.requestUpdate();
  }

    private _closePicker() {
    this._pickerOpen = false;
    this._pickerTarget = null;
    this._pendingAddCardSi = null;
    this.requestUpdate();
  }

    private _applyPickedCard(cardCfg: any) {
    const t = this._pickerTarget;
    if (!t) return;

    // ✅ If ii === -1, we're adding a new card item
    if (t.ii === -1) {
      const targetSi = this._pendingAddCardSi ?? t.si;

      const next = deepClone(this._config);
      next.sections = next.sections ?? [];
      next.sections[targetSi] = next.sections[targetSi] ?? { title: "", items: [] };
      next.sections[targetSi].items = next.sections[targetSi].items ?? [];

      next.sections[targetSi].items.push({
        type: "card",
        title: "",
        editor_mode: "code",
        card: deepClone(cardCfg)
      });

      this._config = mergeConfigWithDefaults(next);
      this._emit();
      this._closePicker();
      return;
    }

    // Otherwise: editing an existing card item
    this._setCardConfig(t.si, t.ii, deepClone(cardCfg));
    this._closePicker();
  }


  /* ---------- Accordion (styled section headers like your screenshot) ---------- */

  private _expander(opts: {
    title: string;
    icon: string;
    secondary?: string;
    open: boolean;
    onToggle: (open: boolean) => void;
    content: any;
  }) {
    return html`
      <details
        class="px-acc"
        ?open=${opts.open}
        @toggle=${(e: Event) => {
          const el = e.currentTarget as HTMLDetailsElement;
          opts.onToggle(el.open);
          this.requestUpdate();
        }}
      >
        <summary class="px-acc-sum" @click=${this._stopDialogClose} @mousedown=${this._stopDialogClose}>
          <div class="px-acc-left">
            <ha-icon class="px-acc-ic" .icon=${opts.icon}></ha-icon>
            <div class="px-acc-text">
              <div class="px-acc-title">${opts.title}</div>
              ${opts.secondary ? html`<div class="px-acc-sub">${opts.secondary}</div>` : nothing}
            </div>
          </div>

          <ha-icon class="px-acc-chev" icon="mdi:chevron-down"></ha-icon>
        </summary>

        <div class="px-acc-body">${opts.content}</div>
      </details>
    `;
  }

  /* ---------- Styling UI ---------- */

  private _presetButtons(): Array<{ preset: PanelXPreset; label: string }> {
    return [
      { preset: "dark", label: "Dark" },
      { preset: "light", label: "Light" },
      { preset: "blue", label: "Blue" },
      { preset: "green", label: "Green" },
      { preset: "glass", label: "Glass" },
      { preset: "custom", label: "Custom" }
    ];
  }

  private _applyPreset(preset: PanelXPreset) {
    this._set(["appearance", "preset"], preset);
  }

  private _presetPreviewStyle(preset: PanelXPreset) {
    const t = presetTokens(preset);
    return `--sw-bg:${t.bg}; --sw-border:${t.border}; --sw-accent:${t.accent}; --sw-text:${t.text}; --sw-sub:${t.sub};`;
  }

  /* =======================================================================================
   *  Render
   * ======================================================================================= */

  render() {
    const sections = this._sections();
    const sec = this._activeSec();
    const si = this._activeSection;

    return html`
      <div class="editor-root">
        <div class="secbar">
          <div class="sec-tabs" role="tablist" aria-label="PanelX sections">
            ${sections.map((s, i) => this._sectionTabButton(s, i))}
          </div>
          <button class="sec-plus" title="Add section" @click=${() => this._addSection()}>
            <ha-icon icon="mdi:plus"></ha-icon>
          </button>
        </div>

        ${this._titleBar()}

        ${this._expander({
          title: "Content",
          icon: "mdi:cube-outline",
          secondary: "Add sections, entities and cards",
          open: this._openContent,
          onToggle: (v) => (this._openContent = v),
          content: this._contentPanel(si, sec, sections.length === 0)
        })}

        ${this._expander({
          title: "Sidebar Config",
          icon: "mdi:page-layout-sidebar-right",
          secondary: "Configuration options for your sidebar",
          open: this._openSidebar,
          onToggle: (v) => (this._openSidebar = v),
          content: this._sidebarPanel()
        })}

        ${this._expander({
          title: "Styling & Layout",
          icon: "mdi:palette-outline",
          secondary: "Styling, presets and width",
          open: this._openStyle,
          onToggle: (v) => (this._openStyle = v),
          content: this._stylePanel()
        })}

        ${this._expander({
          title: "Advanced",
          icon: "mdi:code-tags",
          secondary: "Custom CSS (overlay only)",
          open: this._openAdvanced,
          onToggle: (v) => (this._openAdvanced = v),
          content: this._advancedPanel()
        })}

        ${this._pickerOpen ? this._cardPickerModal() : nothing}
      </div>
    `;
  }

  private _sectionTabButton(s: PanelXSection, i: number) {
    const active = i === this._activeSection;
    const title = s.title?.trim() ? s.title!.trim() : `Section ${i + 1}`;
    return html`
      <button
        class="sec-tab ${active ? "active" : ""}"
        role="tab"
        aria-selected=${active ? "true" : "false"}
        @click=${() => {
          this._activeSection = i;
          this.requestUpdate();
        }}
        title=${title}
      >
        ${i + 1}
      </button>
    `;
  }

  private _contentPanel(si: number, sec: PanelXSection | null, noSections: boolean) {
    if (noSections || !sec) {
      return html`
        <div class="panel">
          <div class="empty">
            <div class="empty-title">No sections yet</div>
            <div class="empty-sub">Add a section, then add entities or embedded cards.</div>
            <div class="row">
              <button class="btn" @click=${() => this._addSection()}>
                <ha-icon class="btn-ic" icon="mdi:plus"></ha-icon>
                Add section
              </button>
            </div>
          </div>
        </div>
      `;
    }

    const items = sec.items ?? [];

    return html`
      <div class="panel">
        <div class="panel-top">
          <div class="panel-title">Section ${si + 1}</div>

          <div class="toolbar">
            <button class="btn" @click=${() => this._addItem("entity")} title="Add entity">
              <ha-icon class="btn-ic" icon="mdi:plus"></ha-icon>
              Entity
            </button>

            <button class="btn" @click=${() => this._addItem("card")} title="Add embedded card">
              <ha-icon class="btn-ic" icon="mdi:plus-box-outline"></ha-icon>
              Card
            </button>

            <div class="toolbar-spacer"></div>

            <button class="iconbtn" title="Copy section" @click=${() => this._copySection(si)}>
              <ha-icon icon="mdi:content-copy"></ha-icon>
            </button>

            <button
              class="iconbtn"
              title="Paste section"
              ?disabled=${!this._clipboardSection}
              @click=${() => this._pasteSectionAfter(si)}
            >
              <ha-icon icon="mdi:content-paste"></ha-icon>
            </button>

            <!-- ✅ Added icon to duplicate section button (already had one, keeping consistent) -->
            <button class="iconbtn" title="Duplicate section" @click=${() => this._duplicateSection(si)}>
              <ha-icon icon="mdi:content-duplicate"></ha-icon>
            </button>

            <button class="iconbtn danger" title="Delete section" @click=${() => this._removeSection(si)}>
              <ha-icon icon="mdi:delete-outline"></ha-icon>
            </button>
          </div>
        </div>

        <ha-textfield
          label="Section title"
          .value=${sec.title ?? ""}
          @input=${(e: any) => this._setSectionTitle(si, e.target.value)}
        ></ha-textfield>

        ${items.length === 0
          ? html`
              <div class="empty-small">
                <div class="empty-small-title">No items</div>
                <div class="empty-small-sub">Add an entity or embedded card.</div>
              </div>
            `
          : html`${this._renderItemsWithZones(si, items)}`}
      </div>
    `;
  }

   private _renderItemsWithZones(si: number, items: PanelXItem[]) {
    const markerIndex = this._dropTarget?.si === si ? this._dropTarget.index : null;

    return html`
      <div
        class="dnd-list"
        @dragover=${(e: DragEvent) => this._onListDragOver(e, si)}
        @drop=${(e: DragEvent) => this._onListDrop(e, si)}
        @dragleave=${(e: DragEvent) => this._onListLeave(e)}
      >
        ${items.map((it, index) => {
          const showMarker = markerIndex === index;

          return html`
            ${showMarker ? html`<div class="drop-marker"></div>` : nothing}

            <div class="item" data-ii=${index}>
              <div class="item-top">
                <div class="item-left">
                  <div
                    class="drag"
                    draggable="true"
                    @dragstart=${(e: DragEvent) => this._onItemDragStart(e, si, index)}
                    @dragend=${() => this._onDragEnd()}
                    title="Drag"
                  >
                    ⋮⋮
                  </div>
                  <div class="tag">${it.type === "entity" ? "Entity" : "Card"}</div>
                </div>

                <div class="item-right">
                  <button class="iconbtn" title="Copy item" @click=${() => this._copyItem(si, index)}>
                    <ha-icon icon="mdi:content-copy"></ha-icon>
                  </button>

                  <button
                    class="iconbtn"
                    title="Paste item"
                    ?disabled=${!this._clipboardItem}
                    @click=${() => this._pasteItemAfter(si, index)}
                  >
                    <ha-icon icon="mdi:content-paste"></ha-icon>
                  </button>

                  <button class="iconbtn" title="Duplicate item" @click=${() => this._duplicateItem(si, index)}>
                    <ha-icon icon="mdi:content-duplicate"></ha-icon>
                  </button>

                  <button class="iconbtn danger" title="Delete item" @click=${() => this._removeItem(si, index)}>
                    <ha-icon icon="mdi:delete-outline"></ha-icon>
                  </button>
                </div>
              </div>

              <div class="item-body">
                ${it.type === "entity" ? this._entityEditor(si, index, it) : nothing}
                ${it.type === "card" ? this._embeddedCardEditor(si, index, it) : nothing}
              </div>
            </div>
          `;
        })}

        ${markerIndex === items.length ? html`<div class="drop-marker"></div>` : nothing}
      </div>
    `;
  }

  private _entityEditor(si: number, ii: number, it: Extract<PanelXItem, { type: "entity" }>) {
    return html`
      <ha-entity-picker
        .hass=${this.hass}
        label="Entity"
        .value=${it.entity ?? ""}
        @value-changed=${(e: any) => this._setEntity(si, ii, e.detail.value)}
      ></ha-entity-picker>

      <div class="two">
        <ha-textfield
          label="Name (optional)"
          .value=${it.name ?? ""}
          @input=${(e: any) => this._setEntityField(si, ii, "name", e.target.value)}
        ></ha-textfield>

        <ha-textfield
          label="Icon (optional, e.g. mdi:lightbulb)"
          .value=${it.icon ?? ""}
          @input=${(e: any) => this._setEntityField(si, ii, "icon", e.target.value)}
        ></ha-textfield>
      </div>

      <ha-select
        label="Secondary info"
        .value=${it.secondary ?? "state"}
        fixedMenuPosition
        @mousedown=${this._stopDialogClose}
        @click=${this._stopDialogClose}
        @value-changed=${(e: any) => {
          e.stopPropagation();
          this._setEntitySecondary(si, ii, e.detail.value);
        }}
      >
        <mwc-list-item value="state">State</mwc-list-item>
        <mwc-list-item value="last_changed">Last changed</mwc-list-item>
        <mwc-list-item value="none">None</mwc-list-item>
      </ha-select>
    `;
  }

      private _embeddedCardEditor(si: number, ii: number, it: Extract<PanelXItem, { type: "card" }>) {
    const cardCfg = it.card ?? { type: "markdown", content: "" };
    const key = this._cardKey(si, ii);

    const fallback = JSON.stringify(cardCfg, null, 2);
    const draft = this._cardDrafts.get(key) ?? fallback;
    const err = this._cardErrors.get(key) ?? "";

    const validateNow = () => {
      const raw = this._cardDrafts.get(key) ?? draft;
      try {
        this._tryParseJson(raw);
        this._cardErrors.delete(key);

        // Optional: small positive feedback using HA toast if available
        document.body.dispatchEvent(
          new CustomEvent("hass-notification", {
            detail: { message: "JSON is valid ✅" },
            bubbles: true,
            composed: true
          })
        );
      } catch (e: any) {
        const msg = (e?.message ?? "Invalid JSON").toString();
        this._cardErrors.set(key, msg);
      }
      this.requestUpdate();
    };

    return html`
      <ha-textfield
        label="Card title (optional)"
        .value=${it.title ?? ""}
        @input=${(e: any) => this._setCardField(si, ii, "title", e.target.value)}
      ></ha-textfield>

      <div class="row">
        <button class="btn" @click=${() => this._openPicker(si, ii)} title="Change card type">
          <ha-icon class="btn-ic" icon="mdi:swap-horizontal"></ha-icon>
          Change card
        </button>

        <button class="btn btn--small" @click=${validateNow} title="Validate JSON">
          <ha-icon class="btn-ic" icon="mdi:check-circle-outline"></ha-icon>
          Validate JSON
        </button>
      </div>

      <div class="hint">
        <b>Edit JSON (required for now)</b> — visual editing will return in a future update.
      </div>

      ${err
        ? html`<div class="json-error">
            <ha-icon class="json-error-ic" icon="mdi:alert-circle-outline"></ha-icon>
            <div class="json-error-text"><b>Invalid JSON:</b> ${err}</div>
          </div>`
        : nothing}

      <ha-code-editor
        mode="yaml"
        .value=${draft}
        @value-changed=${(e: any) => {
          const raw = e?.detail?.value ?? "";
          this._cardDrafts.set(key, raw);

          try {
            const parsed = this._tryParseJson(raw);
            this._cardErrors.delete(key);
            this._setCardConfig(si, ii, parsed);
          } catch (err: any) {
            // Don't spam errors while typing — only show if Validate is pressed OR if it was already in error state
            if (this._cardErrors.has(key)) {
              this._cardErrors.set(key, (err?.message ?? "Invalid JSON").toString());
            }
          }

          this.requestUpdate();
        }}
      ></ha-code-editor>
    `;
  }

    private _haCardVisualEditor(si: number, ii: number, cardCfg: any) {
    const Tag = "hui-card-element-editor";
    if (!customElements.get(Tag)) {
      return html`<div class="hint">Built-in HA card editor not available here. Use Code mode.</div>`;
    }

    const refId = `editor-${si}-${ii}`;
    const cfgKey = JSON.stringify(cardCfg ?? {});

    queueMicrotask(() => {
      const root = this.renderRoot?.querySelector(`#${refId}`) as HTMLDivElement | null;
      if (!root) return;

      let editorEl = root.querySelector(Tag) as any;

      if (!editorEl) {
        editorEl = document.createElement(Tag) as any;
        root.appendChild(editorEl);

        editorEl.addEventListener("config-changed", (ev: any) => {
          const newCfg = ev?.detail?.config;
          if (newCfg) this._setCardConfig(si, ii, newCfg);
        });
      }

      editorEl.hass = this.hass;

      const ll = this._getLovelace();
      if (ll) editorEl.lovelace = ll;

      // ✅ IMPORTANT: don't spam setConfig every render (it resets the editor UI)
      const existingKey = editorEl.__panelx_cfg_key;
      if (existingKey !== cfgKey) {
        editorEl.__panelx_cfg_key = cfgKey;
        try {
          editorEl.setConfig(cardCfg ?? { type: "markdown", content: "" });
        } catch {}
      }
    });

    return html`<div id=${refId} class="ha-editor-host"></div>`;
  }


    private _cardPickerModal() {
    const query = this._pickerQuery.trim().toLowerCase();

    const builtins = this._builtinCardTemplates().filter((c) =>
      (c.name + " " + c.type).toLowerCase().includes(query)
    );

    const customs = this._customCardsList()
      .filter((c) => (c.name + " " + c.type + " " + (c.description ?? "")).toLowerCase().includes(query))
      .slice(0, 80);

    const [builtinsA, builtinsB] = this._splitTwoCols(builtins);
    const [customsA, customsB] = this._splitTwoCols(customs);

    return html`
      <div class="modal-backdrop" @click=${() => this._closePicker()}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-head">
            <div class="modal-title">Choose a card</div>
            <button class="iconbtn" title="Close" @click=${() => this._closePicker()}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>

          <ha-textfield
            label="Search cards"
            .value=${this._pickerQuery}
            @input=${(e: any) => {
              this._pickerQuery = e.target.value;
              this.requestUpdate();
            }}
          ></ha-textfield>

          <!-- Row 1: Native Home Assistant Cards (2 columns) -->
          <div class="pick-row">
            <div class="pick-row-title">Native Home Assistant Cards</div>
            <div class="pick-two">
              <div class="pick-col">
                <div class="pick-list">
                  ${builtinsA.map(
                    (c) => html`
                      <button class="pick-item" @click=${() => this._applyPickedCard(c.template)}>
                        <div class="pick-ic">
                          <ha-icon .icon=${c.icon}></ha-icon>
                        </div>
                        <div class="pick-meta">
                          <div class="pick-name">${c.name}</div>
                          <div class="pick-type">${c.type}</div>
                        </div>
                        <div class="pick-add">
                          <ha-icon icon="mdi:plus"></ha-icon>
                        </div>
                      </button>
                    `
                  )}
                  ${builtinsA.length === 0 ? html`<div class="hint">No native cards found.</div>` : nothing}
                </div>
              </div>

              <div class="pick-col">
                <div class="pick-list">
                  ${builtinsB.map(
                    (c) => html`
                      <button class="pick-item" @click=${() => this._applyPickedCard(c.template)}>
                        <div class="pick-ic">
                          <ha-icon .icon=${c.icon}></ha-icon>
                        </div>
                        <div class="pick-meta">
                          <div class="pick-name">${c.name}</div>
                          <div class="pick-type">${c.type}</div>
                        </div>
                        <div class="pick-add">
                          <ha-icon icon="mdi:plus"></ha-icon>
                        </div>
                      </button>
                    `
                  )}
                </div>
              </div>
            </div>
          </div>

          <!-- Row 2: Custom & 3rd Party Cards (2 columns) -->
          <div class="pick-row">
            <div class="pick-row-title">Custom &amp; 3rd Party Cards</div>

            ${customs.length
              ? html`
                  <div class="pick-two">
                    <div class="pick-col">
                      <div class="pick-list">
                        ${customsA.map(
                          (c) => html`
                            <button
                              class="pick-item"
                              @click=${() => this._applyPickedCard({ type: c.type })}
                              title=${c.description ?? ""}
                            >
                              <div class="pick-ic">
                                <ha-icon icon="mdi:puzzle-outline"></ha-icon>
                              </div>
                              <div class="pick-meta">
                                <div class="pick-name">${c.name}</div>
                                <div class="pick-type">${c.type}</div>
                              </div>
                              <div class="pick-add">
                                <ha-icon icon="mdi:plus"></ha-icon>
                              </div>
                            </button>
                          `
                        )}
                      </div>
                    </div>

                    <div class="pick-col">
                      <div class="pick-list">
                        ${customsB.map(
                          (c) => html`
                            <button
                              class="pick-item"
                              @click=${() => this._applyPickedCard({ type: c.type })}
                              title=${c.description ?? ""}
                            >
                              <div class="pick-ic">
                                <ha-icon icon="mdi:puzzle-outline"></ha-icon>
                              </div>
                              <div class="pick-meta">
                                <div class="pick-name">${c.name}</div>
                                <div class="pick-type">${c.type}</div>
                              </div>
                              <div class="pick-add">
                                <ha-icon icon="mdi:plus"></ha-icon>
                              </div>
                            </button>
                          `
                        )}
                      </div>
                    </div>
                  </div>

                  <div class="hint" style="margin-top:10px;">
                    Tip: selecting a custom card sets <code>{ "type": "custom:..." }</code>. Configure it below in Visual
                    or Code mode.
                  </div>
                `
              : html`<div class="hint">No custom cards found.</div>`}
          </div>
        </div>
      </div>
    `;
  }

   private _sidebarPanel() {
    const ap = this._config.appearance ?? DEFAULTS.appearance;
    const dividersChecked = Boolean(ap.dividers ?? DEFAULTS.appearance.dividers);

    const side = this._config.sidebar?.side ?? DEFAULTS.sidebar.side;
    const vis = this._config.sidebar?.visibility ?? DEFAULTS.sidebar.visibility;

    return html`
      <div class="panel">
        <!-- Section Dividers -->
        <div class="field">
          <div class="field-label">Section Dividers</div>
          <ha-formfield label="">
            <ha-switch
              .checked=${dividersChecked}
              @click=${this._stopDialogClose}
              @mousedown=${this._stopDialogClose}
              @change=${(e: any) => this._set(["appearance", "dividers"], Boolean(e.target.checked))}
            ></ha-switch>
          </ha-formfield>
        </div>

        <!-- Sidebar Location -->
        <div class="field">
          <div class="field-label">Sidebar Location</div>
          <div class="seg">
            <button
              class="segbtn ${side === "left" ? "on" : ""}"
              @click=${() => this._set(["sidebar", "side"], "left")}
            >
              Left
            </button>
            <button
              class="segbtn ${side === "right" ? "on" : ""}"
              @click=${() => this._set(["sidebar", "side"], "right")}
            >
              Right
            </button>
          </div>
        </div>

        <!-- Visibility -->
        <div class="field">
          <div class="field-label">Visibility</div>
          <div class="seg">
            <button
              class="segbtn ${vis === "collapsible" ? "on" : ""}"
              @click=${() => this._set(["sidebar", "visibility"], "collapsible")}
            >
              Collapsible
            </button>
            <button
              class="segbtn ${vis === "always_visible" ? "on" : ""}"
              @click=${() => this._set(["sidebar", "visibility"], "always_visible")}
            >
              Always visible
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private _stylePanel() {
    const ap = this._config.appearance ?? DEFAULTS.appearance;
    const preset = (ap.preset ?? "dark") as PanelXPreset;
    const isCustom = preset === "custom";

    return html`
      <div class="panel">
        <div class="panel-title-row">
          <div class="panel-title">Presets</div>
          <div class="panel-sub">Choose a template or Custom</div>
        </div>

        <div class="presetgrid">
          ${this._presetButtons().map((p) => {
            const on = preset === p.preset;
            return html`
              <button class="presetbtn ${on ? "on" : ""}" @click=${() => this._applyPreset(p.preset)} title=${p.label}>
                <div class="swatch" style=${this._presetPreviewStyle(p.preset)}>
                  <div class="sw-top"></div>
                  <div class="sw-row"></div>
                  <div class="sw-accent"></div>
                </div>
                <div class="presetlbl">${p.label}</div>
              </button>
            `;
          })}
        </div>

        <div class="two">
          <ha-textfield
            label="Sidebar width"
            type="number"
            .value=${String(ap.width ?? DEFAULTS.appearance.width)}
            @input=${(e: any) => this._set(["appearance", "width"], Number(e.target.value))}
          ></ha-textfield>

          <div class="hint">Overlay panel width in pixels.</div>
        </div>

        ${isCustom
          ? html`
              <div class="panel-title-row" style="margin-top: 6px;">
                <div class="panel-title">Custom colors</div>
                <div class="panel-sub">Only shown when preset is Custom</div>
              </div>

              <div class="two">
                <ha-textfield
                  label="Background"
                  .value=${ap.background ?? ""}
                  placeholder="rgba(20,20,20,0.92)"
                  @input=${(e: any) => this._set(["appearance", "background"], e.target.value)}
                ></ha-textfield>

                <ha-textfield
                  label="Border"
                  .value=${ap.border_color ?? ""}
                  placeholder="rgba(255,255,255,0.12)"
                  @input=${(e: any) => this._set(["appearance", "border_color"], e.target.value)}
                ></ha-textfield>
              </div>

              <div class="two">
                <ha-textfield
                  label="Title color"
                  .value=${ap.title_color ?? ""}
                  placeholder="rgba(255,255,255,0.94)"
                  @input=${(e: any) => this._set(["appearance", "title_color"], e.target.value)}
                ></ha-textfield>

                <ha-textfield
                  label="Text color"
                  .value=${ap.text_color ?? ""}
                  placeholder="rgba(255,255,255,0.90)"
                  @input=${(e: any) => this._set(["appearance", "text_color"], e.target.value)}
                ></ha-textfield>
              </div>

              <div class="two">
                <ha-textfield
                  label="Secondary text"
                  .value=${ap.secondary_text_color ?? ""}
                  placeholder="rgba(255,255,255,0.70)"
                  @input=${(e: any) => this._set(["appearance", "secondary_text_color"], e.target.value)}
                ></ha-textfield>

                <ha-textfield
                  label="Accent"
                  .value=${ap.accent_color ?? ""}
                  placeholder="#03a9f4"
                  @input=${(e: any) => this._set(["appearance", "accent_color"], e.target.value)}
                ></ha-textfield>
              </div>
            `
          : html`
              <div class="hint">
                Custom color fields are hidden because you selected a preset. Choose <b>Custom</b> to edit colors.
              </div>
            `}
      </div>
    `;
  }

  private _advancedPanel() {
    return html`
      <div class="panel">
        <div class="hint">Custom CSS is scoped to the overlay only (not inline preview).</div>
        <ha-code-editor
          mode="css"
          .value=${this._config.css ?? ""}
          @value-changed=${(e: any) => this._set(["css"], e.detail.value)}
        ></ha-code-editor>
      </div>
    `;
  }

  static styles = css`
    .editor-root {
      display: grid;
      gap: 10px;
      font-size: 14px;
    }

    .secbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      padding: 0 0 8px;
    }

    .sec-tabs {
      display: flex;
      gap: 18px;
      align-items: center;
      flex-wrap: wrap;
      padding-left: 6px;
    }

    .sec-tab {
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 2px;
      color: var(--secondary-text-color);
      border-bottom: 2px solid transparent;
      transition: color 120ms ease, border-color 120ms ease;
    }

    .sec-tab:hover {
      color: var(--primary-text-color);
    }

    .sec-tab.active {
      color: var(--primary-text-color);
      border-bottom-color: var(--accent-color);
      font-weight: 600;
    }

    .sec-plus {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: rgba(127, 127, 127, 0.06);
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: background 120ms ease, transform 120ms ease, border-color 120ms ease;
    }

    .sec-plus:hover {
      background: rgba(127, 127, 127, 0.1);
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--divider-color, rgba(0, 0, 0, 0.12)) 60%, var(--accent-color));
    }

        /* Accordion headers styled like HA list rows (your screenshot) */
    .px-acc {
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      border-radius: 16px;
      overflow: hidden;
      background: rgba(127, 127, 127, 0.04);
    }

    .px-acc + .px-acc {
      margin-top: 10px;
    }

    .px-acc-sum {
      list-style: none;
      cursor: pointer;
      user-select: none;

      /* ✅ keep your spacing */
      padding: 14px 14px;

      /* ✅ keep your original layout intent, plus perfect centering */
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;

      background: rgba(127, 127, 127, 0.06);
      transition: background 120ms ease, transform 120ms ease;
    }

    .px-acc-sum::-webkit-details-marker {
      display: none;
    }

    .px-acc:hover .px-acc-sum {
      background: rgba(127, 127, 127, 0.1);
      transform: translateY(-1px);
    }

    .px-acc-left {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    /* ✅ Icon alignment fix without breaking spacing */
    .px-acc-ic {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 20px;
      opacity: 0.9;
    }

    .px-acc-text {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      min-width: 0;
    }

    .px-acc-title {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.2;
      color: var(--primary-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .px-acc-sub {
      font-size: 12px;
      font-weight: 500;
      color: var(--secondary-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .px-acc-chev {
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 22px;

      opacity: 0.85;
      transition: transform 160ms ease;
    }

    .px-acc[open] .px-acc-chev {
      transform: rotate(180deg);
    }

    .px-acc-body {
      padding: 12px 14px;
      display: grid;
      gap: 12px;
      background: var(--card-background-color, var(--ha-card-background, transparent));
      border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    }

    .panel {
      display: grid;
      gap: 12px;
    }

    .panel-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .panel-title {
      font-size: 14px;
      font-weight: 600;
    }

    .panel-title-row {
      display: grid;
      gap: 2px;
    }

    .panel-sub {
      font-size: 12px;
      color: var(--secondary-text-color);
      font-weight: 500;
    }

    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .titlebar {
      display: grid;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      border-radius: 16px;
      background: rgba(127, 127, 127, 0.04);
    }

    .titlebar-label {
      font-size: 13px;
      font-weight: 700;
      color: var(--primary-text-color);
    }

    .titlebar-input {
      width: 100%;
    }

     .titlebar-sub {
      font-size: 12px;
      font-weight: 500;
      color: var(--secondary-text-color);
      margin-top: -6px;
    }

    @media (max-width: 700px) {
      .titlebar {
        flex-direction: column;
        align-items: stretch;
      }
      .titlebar-right {
        justify-items: stretch;
        min-width: 0;
      }
    }

    .btn--small {
      height: 38px;
      padding: 0 12px;
      font-weight: 600;
      opacity: 0.95;
    }

        .field {
      display: grid;
      gap: 8px;
    }

    .field-label {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
      margin-left: 2px;
    }

    .seg {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .segbtn {
      height: 40px;
      border-radius: 14px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: rgba(127, 127, 127, 0.06);
      cursor: pointer;
      font-weight: 700;
      color: var(--primary-text-color);
      transition: background 120ms ease, transform 120ms ease, border-color 120ms ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      user-select: none;
    }

    .segbtn:hover {
      background: rgba(127, 127, 127, 0.1);
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--divider-color, rgba(0, 0, 0, 0.12)) 60%, var(--accent-color));
    }

    .segbtn.on {
      border-color: rgba(3, 169, 244, 0.55);
      background: rgba(3, 169, 244, 0.12);
    }

    /* Contextual action buttons (Change card / Validate JSON) */
    .btn:hover {
      background: rgba(127, 127, 127, 0.12);
      border-color: color-mix(
        in srgb,
        var(--divider-color, rgba(0, 0, 0, 0.12)) 55%,
        var(--accent-color)
      );
    }

    .btn:hover .btn-ic {
      opacity: 1;
      transform: scale(1.05);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .btn-ic {
      transition: transform 120ms ease, opacity 120ms ease;
      opacity: 0.9;
    }


    .json-error {
      display: grid;
      grid-template-columns: 18px 1fr;
      gap: 8px;
      align-items: start;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(244, 67, 54, 0.35);
      background: rgba(244, 67, 54, 0.10);
      color: var(--primary-text-color);
    }

    .json-error-ic {
      width: 18px;
      height: 18px;
      opacity: 0.95;
      margin-top: 1px;
    }

    .json-error-text {
      font-size: 12px;
      font-weight: 600;
      color: var(--primary-text-color);
      word-break: break-word;
    }

    .btn {
  height: 38px;
  border-radius: 12px;
  border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
  background: rgba(127, 127, 127, 0.06);
  padding: 0 12px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  cursor: pointer;
  font-weight: 600;
  line-height: 1;

  transition: background 120ms ease, transform 120ms ease, border-color 120ms ease;
  color: var(--primary-text-color);
}

.btn-ic {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
}

    .iconbtn {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: rgba(127, 127, 127, 0.06);
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: background 120ms ease, transform 120ms ease, border-color 120ms ease, opacity 120ms ease;
    }

    .iconbtn:hover {
      background: rgba(127, 127, 127, 0.1);
      transform: translateY(-1px);
    }

    .iconbtn.danger:hover {
      background: rgba(244, 67, 54, 0.12);
      border-color: rgba(244, 67, 54, 0.35);
    }

    .iconbtn[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none !important;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .toolbar-spacer {
      width: 1px;
      height: 22px;
      background: var(--divider-color, rgba(0, 0, 0, 0.12));
      margin: 0 4px;
    }

    .empty {
      border: 1px dashed var(--divider-color, rgba(0, 0, 0, 0.25));
      border-radius: 14px;
      padding: 18px;
      display: grid;
      gap: 10px;
      background: rgba(127, 127, 127, 0.06);
    }

    .empty-title {
      font-weight: 600;
      font-size: 14px;
    }

    .empty-sub {
      font-size: 12px;
      color: var(--secondary-text-color);
      font-weight: 500;
    }

    .empty-small {
      border: 1px dashed var(--divider-color, rgba(0, 0, 0, 0.25));
      border-radius: 12px;
      padding: 14px;
      background: rgba(127, 127, 127, 0.05);
      display: grid;
      gap: 6px;
    }

    .empty-small-title {
      font-weight: 600;
      font-size: 13px;
    }

    .empty-small-sub {
      font-size: 12px;
      color: var(--secondary-text-color);
      font-weight: 500;
    }

    .item {
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      border-radius: 14px;
      background: rgba(127, 127, 127, 0.05);
      padding: 12px;
      display: grid;
      gap: 10px;
      transition: background 120ms ease, transform 120ms ease;
    }

    .item:hover {
      background: rgba(127, 127, 127, 0.08);
      transform: translateY(-1px);
    }

    .item-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .item-left {
      display: inline-flex;
      gap: 10px;
      align-items: center;
    }

    .item-right {
      display: inline-flex;
      gap: 8px;
      align-items: center;
    }

    .drag {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: rgba(127, 127, 127, 0.1);
      display: grid;
      place-items: center;
      cursor: grab;
      user-select: none;
      color: var(--secondary-text-color);
      transition: transform 120ms ease, background 120ms ease;
      font-weight: 600;
    }

    .drag:hover {
      transform: translateY(-1px);
      background: rgba(127, 127, 127, 0.14);
    }

    .tag {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(3, 169, 244, 0.1);
      border: 1px solid rgba(3, 169, 244, 0.18);
    }

    .item-body {
      display: grid;
      gap: 10px;
    }

    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    @media (max-width: 700px) {
      .two {
        grid-template-columns: 1fr;
      }
    }

    .drop-zone {
      height: 14px;
      border-radius: 10px;
      position: relative;
      margin: 6px 0;
    }

    .drop-zone.active {
      height: 34px;
    }

    .drop-zone.active::after {
      content: "";
      position: absolute;
      left: 8px;
      right: 8px;
      top: 50%;
      height: 3px;
      transform: translateY(-50%);
      background: var(--accent-color);
      border-radius: 999px;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color) 28%, transparent);
    }

    .drop-ghost {
      position: absolute;
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      max-width: calc(100% - 16px);
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: var(--card-background-color, var(--ha-card-background, #fff));
      color: var(--primary-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .modechips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }

    .chip {
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.15));
      background: rgba(127, 127, 127, 0.06);
      border-radius: 999px;
      padding: 8px 12px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      display: inline-flex;
      gap: 8px;
      align-items: center;
      color: var(--primary-text-color);
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
    }

    .chip:hover {
      transform: translateY(-1px);
      background: rgba(127, 127, 127, 0.1);
    }

    .chip.active {
      border-color: rgba(3, 169, 244, 0.6);
      background: rgba(3, 169, 244, 0.12);
    }

    .chip-ic {
      width: 16px;
      height: 16px;
      opacity: 0.9;
    }

    .ha-editor-host {
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      border-radius: 14px;
      overflow: hidden;
      padding: 10px;
      background: rgba(127, 127, 127, 0.05);
    }

    .codewrap {
      display: grid;
      gap: 8px;
    }

    .codehint {
      font-size: 12px;
      color: var(--secondary-text-color);
      font-weight: 500;
    }

    .hint {
      font-size: 12px;
      color: var(--secondary-text-color);
      font-weight: 500;
    }

    ha-code-editor {
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    }

    .presetgrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    @media (max-width: 700px) {
      .presetgrid {
        grid-template-columns: 1fr;
      }
    }

    .presetbtn {
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: rgba(127, 127, 127, 0.06);
      border-radius: 14px;
      padding: 10px;
      cursor: pointer;
      display: grid;
      grid-template-columns: 46px 1fr;
      gap: 10px;
      align-items: center;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
      color: var(--primary-text-color);
      text-align: left;
    }

    .presetbtn:hover {
      transform: translateY(-1px);
      background: rgba(127, 127, 127, 0.1);
    }

    .presetbtn.on {
      border-color: rgba(3, 169, 244, 0.55);
      background: rgba(3, 169, 244, 0.12);
    }

    .presetlbl {
      font-weight: 600;
      font-size: 13px;
    }

    .swatch {
      width: 46px;
      height: 34px;
      border-radius: 10px;
      border: 1px solid var(--sw-border);
      background: var(--sw-bg);
      overflow: hidden;
      position: relative;
    }

    .sw-top {
      height: 10px;
      background: color-mix(in srgb, var(--sw-bg) 70%, rgba(255, 255, 255, 0.08));
      border-bottom: 1px solid var(--sw-border);
    }

    .sw-row {
      height: 12px;
      margin: 6px 6px 0;
      border-radius: 6px;
      background: color-mix(in srgb, var(--sw-text) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--sw-border) 70%, transparent);
    }

    .sw-accent {
      position: absolute;
      left: 6px;
      bottom: 6px;
      width: 18px;
      height: 4px;
      border-radius: 999px;
      background: var(--sw-accent);
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
      display: grid;
      place-items: center;
      z-index: 9999;
    }

    .modal {
      width: min(920px, calc(100vw - 24px));
      max-height: min(80vh, 720px);
      overflow: auto;
      border-radius: 16px;
      background: var(--card-background-color, var(--ha-card-background, #fff));
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
      padding: 14px;
      display: grid;
      gap: 12px;
    }

    .modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .modal-title {
      font-size: 14px;
      font-weight: 700;
    }

    .modal-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    @media (max-width: 850px) {
      .modal-grid {
        grid-template-columns: 1fr;
      }
    }

    .modal-section {
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      border-radius: 14px;
      padding: 12px;
      background: rgba(127, 127, 127, 0.04);
      display: grid;
      gap: 10px;
    }

    .modal-sec-title {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }

    .pick-list {
      display: grid;
      gap: 8px;
    }

    .pick-item {
      width: 100%;
      border-radius: 14px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: rgba(127, 127, 127, 0.06);
      padding: 10px;
      display: grid;
      grid-template-columns: 34px 1fr;
      gap: 10px;
      text-align: left;
      cursor: pointer;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
    }

    .pick-item:hover {
      transform: translateY(-1px);
      background: rgba(127, 127, 127, 0.1);
      border-color: color-mix(in srgb, var(--divider-color, rgba(0, 0, 0, 0.12)) 60%, var(--accent-color));
    }

    .pick-ic {
      width: 34px;
      height: 34px;
      border-radius: 12px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: rgba(255, 255, 255, 0.02);
      display: grid;
      place-items: center;
    }

    .pick-meta {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .pick-row {
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      border-radius: 14px;
      padding: 12px;
      background: rgba(127, 127, 127, 0.04);
      display: grid;
      gap: 10px;
    }

    .pick-row + .pick-row {
      margin-top: 12px;
    }

    .pick-row-title {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }

    .pick-two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      align-items: start;
    }

    @media (max-width: 850px) {
      .pick-two {
        grid-template-columns: 1fr;
      }
    }

    .pick-col {
      display: grid;
      gap: 8px;
      align-content: start;
    }

    .pick-item {
      grid-template-columns: 34px 1fr 28px;
      align-items: center;
    }

    .pick-add {
      width: 26px;
      height: 26px;
      border-radius: 10px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: rgba(127, 127, 127, 0.06);
      display: grid;
      place-items: center;
      opacity: 0.85;
    }

    .pick-name {
      font-size: 13px;
      font-weight: 600;
    }

    .pick-type {
      font-size: 12px;
      color: var(--secondary-text-color);
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Clean, dialog-safe radio groups */
    .px-radio-group {
      display: grid;
      gap: 4px;
      padding: 0;
      border: 0;
      background: transparent;
      align-content: start;
    }

    .px-radio-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--secondary-text-color);
      opacity: 0.95;
      margin-left: 2px;
    }

    .px-radio-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    .dnd-list {
      display: grid;
      gap: 10px;
    }

    .drop-marker {
      height: 4px;
      border-radius: 999px;
      background: var(--accent-color);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 25%, transparent);
      margin: 2px 6px;
    }

    .px-radio-row ha-formfield {
      margin: 0;
      white-space: nowrap;
    }
  `;
}

/* =======================================================================================
 *  Register
 * ======================================================================================= */

if (!customElements.get("panelx-card")) customElements.define("panelx-card", PanelXCard);
if (!customElements.get("panelx-editor")) customElements.define("panelx-editor", PanelXEditor);

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: "panelx-card",
  name: "PanelX",
  description: "A right-side sidebar panel with sections, entities, embedded cards, presets & styling.",
  preview: true
});
