// ---------------------------------------------------------------------------
// PosterToggle — segmented control STUDIO ⇆ POSTER. Sits in the top-right
// corner of the viewport (next to the existing onboarding-pointers + tech-
// breakdown drawer trigger). Drives the top-level mode state via the
// onChange callback the parent (main.js) wires up.
//
// Routing:
//   URL hash → ?mode=poster or ?mode=studio (preserved on load + on change)
//   localStorage → "splatgarden:mode:v1"   (sticky preference if no hash)
//
// The toggle itself is dumb — it shows the current mode and fires onChange
// when the user clicks the other segment. The mode setter lives in main.js.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "splatgarden:mode:v1";

/**
 * Read the initial mode from URL hash → localStorage → default ("studio").
 * URL hash format: #mode=poster (or #mode=studio).
 */
export function readInitialMode() {
  // Hash wins — supports deep-linking and shareable URLs.
  const m = window.location.hash.match(/mode=(studio|poster)/);
  if (m) return m[1];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "studio" || stored === "poster") return stored;
  } catch { /* localStorage disabled — ignore */ }
  return "studio";
}

/** Persist the mode to both URL hash + localStorage. */
function persistMode(mode) {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  // Update hash without triggering a hashchange event loop. Replace
  // any existing mode= fragment; preserve other hash fragments (e.g.
  // the deep-link viewpoint hash #v=...).
  const cur = window.location.hash.replace(/^#/, "");
  const parts = cur.split("&").filter(p => p && !p.startsWith("mode="));
  parts.push(`mode=${mode}`);
  const next = "#" + parts.join("&");
  if (window.location.hash !== next) {
    history.replaceState(null, "", window.location.pathname + window.location.search + next);
  }
}

export class PosterToggle {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.mountEl
   * @param {"studio"|"poster"} opts.initialMode
   * @param {(mode: "studio"|"poster") => void} opts.onChange
   */
  constructor({ mountEl, initialMode = "studio", onChange }) {
    this.mode = initialMode;
    this.onChange = onChange;

    this.el = document.createElement("div");
    this.el.id = "poster-toggle";
    this.el.setAttribute("role", "tablist");
    this.el.setAttribute("aria-label", "Display mode");
    this.el.innerHTML = `
      <button class="pt-seg" data-mode="studio" type="button" role="tab"
              aria-selected="${initialMode === "studio"}">
        <span class="pt-dot"></span>STUDIO
      </button>
      <button class="pt-seg" data-mode="poster" type="button" role="tab"
              aria-selected="${initialMode === "poster"}">
        <span class="pt-dot"></span>POSTER
      </button>
    `;
    mountEl.appendChild(this.el);

    this.el.addEventListener("click", (e) => {
      const btn = e.target?.closest?.(".pt-seg");
      if (!btn) return;
      const next = btn.dataset.mode;
      if (next !== "studio" && next !== "poster") return;
      if (next === this.mode) return;
      this.setMode(next);
    });

    // Hash navigation (back / forward) updates the toggle too.
    window.addEventListener("hashchange", () => {
      const fromHash = readInitialMode();
      if (fromHash !== this.mode) this.setMode(fromHash, /*skipPersist*/ true);
    });

    // Push initial mode into storage so refreshes land in the same place.
    persistMode(initialMode);
  }

  /** Programmatic + UI mode change. Fires onChange + persists. */
  setMode(mode, skipPersist = false) {
    if (mode !== "studio" && mode !== "poster") return;
    this.mode = mode;
    this.el.querySelectorAll(".pt-seg").forEach(b => {
      const isActive = b.dataset.mode === mode;
      b.setAttribute("aria-selected", isActive);
      b.classList.toggle("active", isActive);
    });
    if (!skipPersist) persistMode(mode);
    if (this.onChange) this.onChange(mode);
  }
}
