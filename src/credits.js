// ---------------------------------------------------------------------------
// Credits — centered floating panel listing team members and the software
// stack used in the showcase. Toggled by the "Credits" checkbox under the
// Tech Spec folder in lil-gui. Each team member row carries a small
// external-link icon — wire the URL via TEAM[i].url when known, leave
// "#" as a placeholder and the icon stays dim / non-clickable.
// ---------------------------------------------------------------------------

const TEAM = [
  { name: "Danci Shen",               role: "Team Member", url: "#" },
  { name: "Itim Kongsakulvatanasook", role: "Team Member", url: "#" },
  { name: "Xinyi Liang",              role: "Team Member", url: "#" },
  { name: "Yichen Shi",               role: "Team Member", url: "#" },
  { name: "Yiqi Zheng",               role: "Team Member", url: "#" },
  { name: "Yiyi Long",                role: "Team Member", url: "#" },
  { name: "Ben Jones",                role: "Team Member", url: "#" },
];

// Software — commercial / production DCC tools the team authored in.
// Unreal Engine and Houdini are the hero entries (top of the section,
// highlighted via .cr-chip-featured).
const SOFTWARE_FEATURED = ["Unreal Engine", "Houdini"];
const SOFTWARE_OTHER    = [
  "SpeedTree", "Postshot", "Perforce", "Lichtfeld Studio",
];

// Tech Stack — the research / runtime / interop methods that ride
// underneath the visible scene. HP AI Studio and OpenUSD are the
// featured story beats.
const TECH_FEATURED = ["HP AI Studio", "OpenUSD"];
const TECH_OTHER    = [
  // Reconstruction
  "COLMAP",
  // AI stylization
  "PyTorch", "CUDA", "IP-Adapter", "ControlNet", "AdaIN",
  // Render runtime
  "@sparkjsdev/spark", "Three.js", "WebGL 2", "Vite",
  // Interaction
  "MediaPipe HandLandmarker",
  // USD primitives
  "UsdGeomPointInstancer",
];

const LINK_ICON_SVG = `
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M9 2h5v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 2L7.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

export class Credits {
  constructor({ mountEl = document.body } = {}) {
    this.open = false;

    this.el = document.createElement("aside");
    this.el.id = "credits";
    this.el.innerHTML = `
      <header class="cr-head">
        <span class="cr-title">CREDITS</span>
        <button class="cr-close" data-act="close" title="Close">&times;</button>
      </header>
      <div class="cr-body">
        <section class="cr-sec">
          <div class="cr-sec-title">Team</div>
          <ul class="cr-list">
            ${TEAM.map(p => {
              const linked = p.url && p.url !== "#";
              const aOpen  = linked
                ? `<a class="cr-link" href="${p.url}" target="_blank" rel="noopener noreferrer" title="Open ${p.name}'s site">`
                : `<span class="cr-link cr-link-empty" title="No link yet">`;
              const aClose = linked ? `</a>` : `</span>`;
              return `
                <li class="cr-row">
                  <span class="cr-name">${p.name}</span>
                  <span class="cr-role">${p.role}</span>
                  ${aOpen}${LINK_ICON_SVG}${aClose}
                </li>`;
            }).join("")}
          </ul>
        </section>
        <section class="cr-sec">
          <div class="cr-sec-title">Software</div>
          <div class="cr-chips">
            ${SOFTWARE_FEATURED.map(s => `<span class="cr-chip cr-chip-featured">${s}</span>`).join("")}
            ${SOFTWARE_OTHER   .map(s => `<span class="cr-chip">${s}</span>`).join("")}
          </div>
        </section>
        <section class="cr-sec">
          <div class="cr-sec-title">Tech Stack</div>
          <div class="cr-chips">
            ${TECH_FEATURED.map(s => `<span class="cr-chip cr-chip-featured">${s}</span>`).join("")}
            ${TECH_OTHER   .map(s => `<span class="cr-chip">${s}</span>`).join("")}
          </div>
        </section>
      </div>
    `;
    mountEl.appendChild(this.el);

    this.el.querySelector('[data-act="close"]').addEventListener("click", () => this.close());

    window.addEventListener("keydown", (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (e.key === "Escape" && this.open) { e.preventDefault(); this.close(); }
    });
  }

  show()    { this.open = true;  this.el.classList.add("show"); this.onOpenChange?.(true); }
  close()   { this.open = false; this.el.classList.remove("show"); this.onOpenChange?.(false); }
  toggle()  { this.open ? this.close() : this.show(); }
  setOpen(v){ v ? this.show() : this.close(); }
}
