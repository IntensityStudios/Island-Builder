// Saving, loading, JSON export/import and compact share links.
//
// Share link format:  #i=<flag><base64url>
//   flag 'z' = deflate-compressed (CompressionStream), 'r' = raw bytes (fallback)
//   bytes = [u32 metaLength][meta JSON utf8][int16 height deltas (x10)][u8 paint]
import { VERTS, GRID } from './terrain.js';
import { PROP_ORDER } from './props.js';

const SAVE_KEY = 'islandBuilder.save.v1';
const AUTO_KEY = 'islandBuilder.autosave.v1';

/** Plain, human-readable JSON object for export/save. */
export function toJSONObject(state) {
  return {
    app: 'island-builder',
    version: 1,
    grid: GRID,
    settings: { ...state.settings },
    heights: Array.from(state.heights, (h) => Math.round(h * 100) / 100),
    paint: Array.from(state.paint),
    props: state.props.map(({ type, x, z, rot, scale, seed }) => ({ type, x: +x.toFixed(2), z: +z.toFixed(2), rot: +rot.toFixed(3), scale: +scale.toFixed(2), seed })),
  };
}

/** Validate & convert a JSON object back into state. Throws on bad input. */
export function fromJSONObject(obj) {
  if (!obj || obj.app !== 'island-builder' || !Array.isArray(obj.heights) || obj.heights.length !== VERTS) {
    throw new Error('Not an Island Builder file (or a different grid size).');
  }
  return {
    settings: { ...obj.settings },
    heights: Float32Array.from(obj.heights, Number),
    paint: Array.isArray(obj.paint) && obj.paint.length === VERTS ? Uint8Array.from(obj.paint) : new Uint8Array(VERTS),
    props: (obj.props || []).filter((p) => PROP_ORDER.includes(p.type)).map((p) => ({ type: p.type, x: +p.x || 0, z: +p.z || 0, rot: +p.rot || 0, scale: +p.scale || 1, seed: p.seed ?? 0 })),
  };
}

// ---- localStorage ---------------------------------------------------------
function put(key, state) {
  try { localStorage.setItem(key, JSON.stringify(toJSONObject(state))); return true; } catch { return false; }
}
function get(key) {
  try { const s = localStorage.getItem(key); return s ? fromJSONObject(JSON.parse(s)) : null; } catch { return null; }
}
export const saveSlot = (state) => put(SAVE_KEY, state);
export const loadSlot = () => get(SAVE_KEY);
export const autoSave = (state) => put(AUTO_KEY, state);
export const loadAutoSave = () => get(AUTO_KEY);

// ---- File export / import -------------------------------------------------
export function exportFile(state, name = 'my-island.json') {
  const blob = new Blob([JSON.stringify(toJSONObject(state))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importFile(file) {
  return fromJSONObject(JSON.parse(await file.text()));
}

// ---- Binary packing for share links ---------------------------------------
function pack(state) {
  const s = state.settings;
  const meta = {
    v: 1,
    s: [+(s.waterLevel ?? 0).toFixed(1), +(s.time ?? 12).toFixed(2), s.autoTime ? 1 : 0, s.weather || 'clear', s.villagers ?? 4, s.critters ?? 6],
    p: state.props.map((p) => [PROP_ORDER.indexOf(p.type), Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.rot * 100), Math.round(p.scale * 100), p.seed ?? 0]),
  };
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const buf = new ArrayBuffer(4 + metaBytes.length + VERTS * 2 + VERTS);
  const dv = new DataView(buf);
  dv.setUint32(0, metaBytes.length, true);
  new Uint8Array(buf, 4, metaBytes.length).set(metaBytes);
  let off = 4 + metaBytes.length, prev = 0;
  for (let k = 0; k < VERTS; k++) {
    const q = Math.round(state.heights[k] * 10);
    dv.setInt16(off, q - prev, true); // deltas compress much better
    prev = q; off += 2;
  }
  new Uint8Array(buf, off, VERTS).set(state.paint);
  return new Uint8Array(buf);
}
function unpack(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const metaLen = dv.getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + metaLen)));
  const heights = new Float32Array(VERTS);
  let off = 4 + metaLen, prev = 0;
  for (let k = 0; k < VERTS; k++) { prev += dv.getInt16(off, true); heights[k] = prev / 10; off += 2; }
  const paint = Uint8Array.from(bytes.subarray(off, off + VERTS));
  const [waterLevel, time, autoTime, weather, villagers, critters] = meta.s;
  return {
    settings: { waterLevel, time, autoTime: !!autoTime, weather, villagers, critters },
    heights, paint,
    props: meta.p.filter((a) => PROP_ORDER[a[0]]).map((a) => ({ type: PROP_ORDER[a[0]], x: a[1] / 10, z: a[2] / 10, rot: a[3] / 100, scale: a[4] / 100, seed: a[5] })),
  };
}

// ---- base64url ------------------------------------------------------------
function toB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** State -> compact string for the URL hash. */
export async function encodeShare(state) {
  const raw = pack(state);
  if (typeof CompressionStream !== 'undefined') {
    try { return 'z' + toB64url(await pipe(raw, new CompressionStream('deflate'))); } catch { /* fall through */ }
  }
  return 'r' + toB64url(raw);
}

/** String from the URL hash -> state. Throws on bad data. */
export async function decodeShare(code) {
  const flag = code[0], bytes = fromB64url(code.slice(1));
  if (flag === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed links.');
    return unpack(await pipe(bytes, new DecompressionStream('deflate')));
  }
  if (flag === 'r') return unpack(bytes);
  throw new Error('Unknown share link format.');
}

/** Full share URL for the current page. */
export async function shareUrl(state) {
  const base = location.href.split('#')[0];
  return `${base}#i=${await encodeShare(state)}`;
}
