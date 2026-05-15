import * as THREE from "three";

// ---------------------------------------------------------------------------
// COLMAP binary file readers — minimal, only what the data-label overlay
// needs (camera per-image extrinsics + filename).
//
// Format reference: colmap/scripts/python/read_write_model.py
//
//   images.bin
//   ┌─ uint64  num_reg_images
//   │  for each image:
//   │     uint32  image_id
//   │     double  qw, qx, qy, qz        (rotation, world → camera)
//   │     double  tx, ty, tz            (translation, world → camera)
//   │     uint32  camera_id
//   │     char[]  name (null-terminated)
//   │     uint64  num_points2d
//   │     for each point2d:
//   │        double x, y
//   │        int64  point3d_id
//
// Camera position in WORLD space = -R(q)^T · t  ≡  conjugate(q) · (-t)
// ---------------------------------------------------------------------------

class BinReader {
  constructor(buffer) {
    this.dv = new DataView(buffer);
    this.byteLength = buffer.byteLength;
    this.p = 0;
  }
  u32() { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
  u64() { const v = this.dv.getBigUint64(this.p, true); this.p += 8; return Number(v); }
  i64() { const v = this.dv.getBigInt64(this.p, true); this.p += 8; return Number(v); }
  f64() { const v = this.dv.getFloat64(this.p, true); this.p += 8; return v; }
  // Skip n bytes (used to fast-forward over points-2d blocks)
  skip(n) { this.p += n; }
  // Null-terminated UTF-8 string
  str0() {
    let s = "";
    while (this.p < this.byteLength) {
      const c = this.dv.getUint8(this.p++);
      if (c === 0) return s;
      s += String.fromCharCode(c);
    }
    return s;
  }
}

/**
 * Load and parse `images.bin` (COLMAP binary format).
 *
 * @param {string} url
 * @returns {Promise<Array<{
 *   imageId: number,
 *   q: [number, number, number, number],   // qw, qx, qy, qz
 *   t: [number, number, number],
 *   cameraId: number,
 *   name: string,
 * }>>}
 */
export async function loadColmapImages(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`COLMAP: ${res.status} fetching ${url}`);
  const buf = await res.arrayBuffer();
  const r = new BinReader(buf);

  const n = r.u64();
  const out = [];
  for (let i = 0; i < n; i++) {
    const imageId  = r.u32();
    const qw       = r.f64(), qx = r.f64(), qy = r.f64(), qz = r.f64();
    const tx       = r.f64(), ty = r.f64(), tz = r.f64();
    const cameraId = r.u32();
    const name     = r.str0();
    const np2d     = r.u64();
    r.skip(np2d * (8 + 8 + 8));   // 2×double + 1×int64 per 2D point
    out.push({ imageId, q: [qw, qx, qy, qz], t: [tx, ty, tz], cameraId, name });
  }
  return out;
}

/**
 * Convert a COLMAP image record to the camera's world-space position.
 *
 * World→camera transform is x_cam = R(q) · x_world + t.
 * Camera center in world = -R(q)^T · t = conjugate(q) · (-t).
 *
 * @param {{q:[number,number,number,number], t:[number,number,number]}} image
 * @returns {THREE.Vector3} world-space camera position
 */
export function colmapCameraPosition(image) {
  const [qw, qx, qy, qz] = image.q;
  const [tx, ty, tz]     = image.t;
  // THREE.Quaternion is (x, y, z, w)
  const qConj = new THREE.Quaternion(-qx, -qy, -qz, qw);     // q⁻¹  for unit q
  return new THREE.Vector3(-tx, -ty, -tz).applyQuaternion(qConj);
}
