// ---------------------------------------------------------------------------
// SceneLayers — manages the list of splat layers in the scene and renders a
// SuperSplat-style panel with per-layer visibility toggle + delete.
//
// V1 contract:
//   - First layer added = primary. Effects / voxelizer / quadizer / annotations
//     bind to its mesh and never move. Primary cannot be removed.
//   - Drag-drop and "+ Add" append secondary layers. They render alongside the
//     primary, can be toggled visible/hidden, and removed.
//   - All layers live in the same Three scene; nothing here owns the scene
//     graph beyond attach / detach on add / remove.
// ---------------------------------------------------------------------------

function shortId() {
  return Math.random().toString(36).slice(2, 8);
}

function compactInt(n) {
  if (!Number.isFinite(n)) return "";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

function fileLabel(name) {
  if (!name) return "Untitled";
  return name.replace(/\.(splat|ply|spz|ksplat)$/i, "");
}

export class SceneLayers {
  constructor({ scene, mountEl = document.body, panelEl = null } = {}) {
    this.scene  = scene;
    this.layers = [];

    // onAddRequest fires when the user clicks "+ Add" — the host wires this
    // to its existing file-picker / replaceSplatMesh path.
    this.onAddRequest = null;

    if (panelEl) {
      this.el = panelEl;
      this._wirePanel();
    } else {
      this._buildPanel(mountEl);
    }
    this._render();
  }

  add({ mesh, name, isPrimary = null }) {
    if (!mesh) return null;
    if (isPrimary === null) isPrimary = this.layers.length === 0;
    const layer = {
      id:        shortId(),
      name:      fileLabel(name),
      mesh,
      visible:   true,
      isPrimary: !!isPrimary,
    };
    if (isPrimary) this.layers.forEach(l => (l.isPrimary = false));
    this.layers.push(layer);
    mesh.visible = true;
    if (mesh.parent !== this.scene) this.scene.add(mesh);
    this._render();
    return layer;
  }

  remove(id) {
    const idx = this.layers.findIndex(l => l.id === id);
    if (idx < 0) return false;
    const layer = this.layers[idx];
    if (layer.isPrimary) return false;        // primary is immutable in v1
    if (layer.mesh?.parent) layer.mesh.parent.remove(layer.mesh);
    if (typeof layer.mesh?.dispose === "function") {
      try { layer.mesh.dispose(); } catch {}
    }
    this.layers.splice(idx, 1);
    this._render();
    return true;
  }

  setVisible(id, on) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer) return;
    layer.visible = !!on;
    if (layer.mesh) layer.mesh.visible = layer.visible;
    this._render();
  }

  // Replace the primary layer's mesh in-place (used by the existing
  // replaceSplatMesh hot-swap path). Keeps the layer id stable.
  replacePrimaryMesh(mesh, name) {
    const primary = this.layers.find(l => l.isPrimary);
    if (!primary) return this.add({ mesh, name, isPrimary: true });
    if (primary.mesh?.parent) primary.mesh.parent.remove(primary.mesh);
    if (typeof primary.mesh?.dispose === "function") {
      try { primary.mesh.dispose(); } catch {}
    }
    primary.mesh    = mesh;
    primary.name    = fileLabel(name);
    primary.visible = true;
    mesh.visible    = true;
    if (mesh.parent !== this.scene) this.scene.add(mesh);
    this._render();
    return primary;
  }

  getPrimary() { return this.layers.find(l => l.isPrimary) || null; }

  // ---- Panel ---------------------------------------------------------------

  _buildPanel(mountEl) {
    this.el = document.createElement("aside");
    this.el.id = "scene-panel";
    this.el.innerHTML = `
      <header>
        <div class="title">Scene</div>
        <button class="add-splat" title="Add a splat layer (or drag a file onto the scene)">+ Add</button>
      </header>
      <ul class="layer-list"></ul>
      <div class="hint">
        Drag .splat / .ply / .spz onto the scene to add a layer.
      </div>
    `;
    mountEl.appendChild(this.el);
    this._wirePanel();
  }

  _wirePanel() {
    this.listEl = this.el.querySelector(".layer-list");
    this.addBtn = this.el.querySelector(".add-splat");
    if (this.addBtn) {
      this.addBtn.addEventListener("click", () => this.onAddRequest?.());
    }
  }

  _render() {
    if (!this.listEl) return;
    if (this.layers.length === 0) {
      this.listEl.innerHTML = `<li class="empty">No splats loaded</li>`;
      return;
    }
    this.listEl.innerHTML = this.layers.map(l => {
      const splatCount = l.mesh?.packedSplats?.numSplats;
      const countTxt   = Number.isFinite(splatCount) ? compactInt(splatCount) : "";
      return `
        <li class="layer ${l.visible ? "" : "hidden-layer"} ${l.isPrimary ? "primary" : ""}" data-id="${l.id}">
          <button class="eye" data-act="toggle" title="${l.visible ? "Hide" : "Show"} layer">${l.visible ? "●" : "○"}</button>
          <span class="name" title="${l.name}">${l.name}</span>
          <span class="count" title="${splatCount?.toLocaleString?.("en-US") || ""}">${countTxt}</span>
          ${l.isPrimary ? `<span class="badge">PRI</span>` : `<button class="del" data-act="del" title="Remove layer">×</button>`}
        </li>
      `;
    }).join("");

    // Wire row buttons (delegated would be cleaner, but the list is small).
    this.listEl.querySelectorAll("[data-act]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id  = e.target.closest("[data-id]")?.dataset.id;
        const act = e.target.dataset.act;
        if (!id) return;
        if (act === "toggle") {
          const layer = this.layers.find(l => l.id === id);
          if (layer) this.setVisible(id, !layer.visible);
        } else if (act === "del") {
          this.remove(id);
        }
      });
    });
  }
}
