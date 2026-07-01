'use client';

// OUROO R3D — a real first-person 3D realm rendered into a 2D canvas with a software raycaster
// (Wolfenstein/Doom-style): DDA wall casting + per-pixel floor/ceiling casting (so lava actually
// glows on the ground ahead of you) + billboard sprites for crystals and the exit gate. It reads a
// grid Level3D (see lib/raycast/levels) and is summoned by a portal whose destination is `r3d:<id>`.
//
// Movement is full free-look: forward/back, turn left/right, strafe, run — driven by the same fixed
// 60Hz accumulator the rest of the game uses, so physics never doubles on high-refresh screens.
// Hazards are real: lava drains HP, pits drop you to your death; both respawn you at the spawn tile.

import React, { useEffect, useRef, useState } from 'react';
import {
  type Level3D, type Mood, type Npc3D, paletteOf, lightingOf, skyOf, moodOf, cellAt, isWall, getLevel, heightAt, hasHeightMap, MONSTER_CHAR, TUNNEL_CHAR,
  STAIR_UP, STAIR_DOWN, CHEST_CHAR, floorsOf, findSpawnFloor, AIR, isAir, STOREY_LEVELS, getRealmRemote,
} from '@/lib/raycast/levels';
import { resolveAppearance } from '@/lib/catalog';
import { drawPerson } from '@/lib/person';
import { drawSkinShape, skinById, isCreatureId, parseCreature } from '@/lib/skins';
import { drawIconSpec } from '@/lib/icons';

const STEP = 1000 / 60;            // fixed sim tick
const RES_H = 240;                 // internal vertical resolution (RES_W tracks aspect for square pixels)
const MOVE = 0.055;                // tiles per tick (walk) — a touch snappier
const RUN = 0.11;                  // tiles per tick (run)
const TURN = 0.045;                // radians per tick (keyboard/stick turn)
const RADIUS = 0.3;                // player collision radius (tiles) — Minecraft-ish: a block is ~1.7x your width
const LAVA_DPS = 0.55;             // HP drained per tick standing in lava
const MAX_HP = 100;
const STEP_UNIT = 0.32;            // world height of one floor level (wall = 1.0 tall)
const EYE_BASE = 1.55;             // eye height — MINECRAFT PROPORTION. A block/storey is ~0.96 tall, so 1.55
                                   // ≈ 1.6x a block: you are ~1.8 blocks tall and TOWER over a single block
                                   // (see clean over it, it sits low in view). Stack 2 blocks for a real wall.
                                   // Consequence (same as Minecraft): rooms must be 2 blocks tall to stand in.
// FOV / zoom. The camera focal length is RES_H, giving a narrow ~53° lens that makes every block look
// huge and right in your face. FOV widens the lens: apparent size of EVERYTHING (walls, blocks, floor
// cells) scales by 1/FOV, so 1.7 ≈ "half the size". The raycaster is fisheye-corrected (walls use
// perpendicular distance), so a wide lens just reveals more world — it doesn't bend the walls. This is
// FOV = 1.0 is the original lens (no change). Widening it (>1) zooms out but at wide angles fisheyes the
// view, so it is NOT the way to shrink blocks — kept at 1.0. Block size is set by the world geometry below.
const FOV = 1.0;
const CEIL_GAP = 2.2;             // ceiling/wall height above the floor — ~2 blocks, so a single-floor room is
                                 // 2 levels tall by default and the tall player can't see over its walls
const JUMP_V = 0.18;              // stacked realms: jump launch velocity (apex clears one storey → hop onto blocks)
const GRAV = 0.012;              // stacked realms: gravity pull per tick

// ── Procedural block textures ───────────────────────────────────────────────────────────────────
// Everything here stays GENERATED — no image assets. Each texture is a small tileable BRIGHTNESS pattern
// (multipliers ~0.5–1.15) that gets tinted by the palette colour at draw time, so atmospheres still
// recolour every surface. Each is mip-chained (repeatedly averaged down) so distant surfaces sample a
// blurred level and DON'T shimmer/alias. This is the "real textures" win while keeping the procedural soul.
type Tex = { mips: Float32Array[]; sizes: number[] };
const TX = 16;
const thash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 1442695051)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const buildTex = (fn: (x: number, y: number) => number): Tex => {
  const base = new Float32Array(TX * TX);
  for (let y = 0; y < TX; y++) for (let x = 0; x < TX; x++) base[y * TX + x] = fn(x, y);
  const mips = [base], sizes = [TX];
  let cur = base, sz = TX;
  while (sz > 1) {
    const n = sz >> 1, nx = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
      nx[y * n + x] = (cur[2 * y * sz + 2 * x] + cur[2 * y * sz + 2 * x + 1] + cur[(2 * y + 1) * sz + 2 * x] + cur[(2 * y + 1) * sz + 2 * x + 1]) / 4;
    mips.push(nx); sizes.push(n); cur = nx; sz = n;
  }
  return { mips, sizes };
};
const sampleTex = (t: Tex, u: number, v: number, lod: number): number => {
  const l = lod < 0 ? 0 : lod > t.mips.length - 1 ? t.mips.length - 1 : lod | 0;
  const sz = t.sizes[l];
  const x = (((u % 1) + 1) % 1) * sz | 0, y = (((v % 1) + 1) % 1) * sz | 0;
  return t.mips[l][y * sz + x];
};
const TEXES = {
  stone: buildTex((x, y) => 0.84 + thash(x, y, 1) * 0.22 - (thash(x >> 2, y >> 2, 7) > 0.86 ? 0.28 : 0)),
  brick: buildTex((x, y) => { const row = (y / 5) | 0, off = (row & 1) ? 3 : 0, bx = (x + off) % 6; return (y % 5 === 4 || bx === 5) ? 0.55 : 0.88 + thash(((x + off) / 6) | 0, row, 3) * 0.22; }),
  cobble: buildTex((x, y) => { const cx = (x + (((y / 4) | 0) & 1) * 2) % 4, cy = y % 4; return (cx === 3 || cy === 3) ? 0.5 : 0.8 + thash(x >> 2, y >> 2, 5) * 0.3; }),
  moss: buildTex((x, y) => { const s = 0.82 + thash(x, y, 2) * 0.22; return thash(x >> 1, y >> 1, 9) > 0.62 ? s * 0.8 : s; }),
  sand: buildTex((x, y) => 0.9 + thash(x, y, 4) * 0.14 + Math.sin(y * 1.3) * 0.03),
  grass: buildTex((x, y) => 0.74 + thash(x, y, 6) * 0.34 - (thash(x, y >> 1, 8) > 0.72 ? 0.16 : 0)),
  dirt: buildTex((x, y) => 0.8 + thash(x, y, 11) * 0.22 - (thash(x >> 2, y >> 1, 12) > 0.82 ? 0.18 : 0)),
  pave: buildTex((x, y) => ((x & 7) === 0 || (y & 7) === 0) ? 0.6 : 0.92 + thash(x >> 3, y >> 3, 13) * 0.12),
};
const WALL_TEX: Record<string, Tex> = { '#': TEXES.stone, '1': TEXES.brick, '2': TEXES.cobble, '3': TEXES.moss, '4': TEXES.sand };
const wallTexOf = (c: string) => WALL_TEX[c] ?? TEXES.stone;
const lodOf = (d: number) => (d < 1 ? 0 : Math.log2(d) * 0.9);   // farther = higher mip = no shimmer

type Sprite = { x: number; y: number; kind: 'crystal' | 'exit' | 'chest' | 'tree' | 'bush' | 'flower' | 'rock' | 'lamp'; key?: string };

// ── Animated molten lava (DOOM-style animated flat). Layered, domain-warped flow → dark crust veins,
// glowing molten cells and hot yellow-white cores that churn over time. Cheap enough for per-pixel
// floor casting. Returns [r,g,b] (emissive — not fogged/lit by the caller).
const LAVA_PIX = 7;   // molten "pixels" per world tile — solid colour blocks, no gradient/contours
// stable per-cell hash → 0..1 (used for discrete block variance)
const cellRand = (gx: number, gy: number): number => {
  let h = (gx * 374761393 + gy * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return (h >>> 0) / 4294967296;
};
const moltenLava = (fx: number, fy: number, t: number): [number, number, number] => {
  const gx = Math.floor(fx * LAVA_PIX), gy = Math.floor(fy * LAVA_PIX);   // quantise to texel cells
  const qx = gx / LAVA_PIX, qy = gy / LAVA_PIX;
  const wx = qx + 0.4 * Math.sin(qy * 2.3 + t * 0.05) + 0.15 * Math.sin(qy * 6.1 - t * 0.09);   // turbulent warp
  const wy = qy + 0.4 * Math.sin(qx * 2.1 - t * 0.04) + 0.15 * Math.sin(qx * 5.7 + t * 0.07);
  let n = Math.sin(wx * 3.1 + t * 0.06) * Math.sin(wy * 2.7 - t * 0.05) + 0.55 * Math.sin((wx + wy) * 5.6 + t * 0.11);
  n = Math.round((n * 0.5 + 0.5) * 5) / 5;            // → 6 DISCRETE molten levels → distinct solid blocks
  const heat = Math.max(0, Math.min(1, (n - 0.24) * 1.7));
  let r = 34 + heat * 221, g = 5 + heat * heat * 150, b = 3 + heat * 16;   // crust-red → molten-orange
  const core = Math.max(0, n - 0.8) * 5;                                    // hot yellow-white peaks
  r = Math.min(255, r + core * 30); g = Math.min(255, g + core * 150); b = Math.min(140, b + core * 90);
  const v = 0.9 + ((cellRand(gx, gy) * 4) | 0) * 0.05;   // per-cell brightness step (texture, no contour)
  return [r * v, g * v, b * v];
};
// Pixelated water — distinct solid rippling blocks (no seams/contours), matches the voxel look.
const pixelWater = (fx: number, fy: number, t: number): [number, number, number] => {
  const gx = Math.floor(fx * LAVA_PIX), gy = Math.floor(fy * LAVA_PIX);
  const qx = gx / LAVA_PIX, qy = gy / LAVA_PIX;
  let n = 0.5 + 0.5 * Math.sin(qx * 4.2 + t * 0.09) * Math.sin(qy * 3.4 - t * 0.06) + 0.2 * Math.sin((qx + qy) * 7 + t * 0.13);
  n = Math.round(n * 4) / 4;                          // discrete water levels
  const r = 16 + n * 26, g = 66 + n * 74, b = 148 + n * 78;
  const v = 0.92 + ((cellRand(gx, gy) * 3) | 0) * 0.05;
  return [r * v, g * v, b * v];
};

// ── Portal energy field, in cell-local space (fx,fy are world coords; we take the fractional cell
// position). A rotating spiral + concentric rings that fade to nothing at the tile edge → a swirling
// gateway instead of a flat pad. Returns [r,g,b,alpha] (alpha 0 = show floor beneath).
const portalFloor = (fx: number, fy: number, t: number, locked = false): [number, number, number, number] => {
  const cx = fx - Math.floor(fx) - 0.5, cy = fy - Math.floor(fy) - 0.5;
  const rad = Math.hypot(cx, cy);
  if (rad > 0.48) return [0, 0, 0, 0];                         // outside the ring → floor shows through
  const ang = Math.atan2(cy, cx);
  const spiral = 0.5 + 0.5 * Math.sin(ang * 3 + rad * 22 - t * (locked ? 0.05 : 0.16));   // 3-arm swirl (sluggish when locked)
  const rings = 0.5 + 0.5 * Math.sin(rad * 30 - t * (locked ? 0.06 : 0.22));
  const edge = Math.min(1, (0.48 - rad) * 6);                  // soft outer falloff
  const core = Math.max(0, 1 - rad * 3.2);                     // bright hot centre
  const e = (0.35 + 0.65 * spiral * rings) * edge;
  return locked
    ? [200 * e + 150 * core, 60 * e + 40 * core, 30 * e + 20 * core, edge]      // locked → smouldering red
    : [30 * e + 120 * core, 200 * e + 180 * core, 250 * e + 120 * core, edge];  // open  → teal-white vortex
};

// ── Voxel props (Minecraft look) ─────────────────────────────────────────────────────────────────
// Draw props as clusters of shaded, depth-tested axis-aligned CUBES instead of camera-facing
// billboards, so you can walk around them and see faces. `BoxEnv` bundles the per-frame camera +
// buffers so the same rasterizer serves both the flat and stacked render paths.
type PC = { sx: number; sy: number; cy: number };
type BoxEnv = {
  px: number; py: number; invDet: number; sin: number; cos: number; planeX: number; planeY: number;
  W: number; H: number; F: number; horizon: number; eye: number; fog: [number, number, number];
  data: Uint8ClampedArray; depth: Float32Array;
};
// project a world point (wx,wy,wz) → screen x/y + camera depth
const projPt = (e: BoxEnv, wx: number, wy: number, wz: number): PC => {
  const rx = wx - e.px, ry = wy - e.py;
  const cy = e.invDet * (-e.planeY * rx + e.planeX * ry);
  const cx = e.invDet * (e.sin * rx - e.cos * ry);
  return { sx: (e.W / 2) * (1 + cx / cy), sy: e.horizon + ((e.eye - wz) * e.F) / cy, cy };
};
// fill a screen triangle, depth-testing per pixel (interpolated 1/cy) and texturing via affine u,v
const fillTri = (e: BoxEnv, p0: PC, p1: PC, p2: PC, u0: number, v0: number, u1: number, v1: number, u2: number, v2: number, rr: number, gg: number, bb: number) => {
  const minX = Math.max(0, Math.floor(Math.min(p0.sx, p1.sx, p2.sx)));
  const maxX = Math.min(e.W - 1, Math.ceil(Math.max(p0.sx, p1.sx, p2.sx)));
  const minY = Math.max(0, Math.floor(Math.min(p0.sy, p1.sy, p2.sy)));
  const maxY = Math.min(e.H - 1, Math.ceil(Math.max(p0.sy, p1.sy, p2.sy)));
  if (minX > maxX || minY > maxY) return;
  const i0 = 1 / p0.cy, i1 = 1 / p1.cy, i2 = 1 / p2.cy;
  for (let y = minY; y <= maxY; y++) {
    const fy = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const fx = x + 0.5;
      const e0 = (p1.sx - p0.sx) * (fy - p0.sy) - (p1.sy - p0.sy) * (fx - p0.sx);
      const e1 = (p2.sx - p1.sx) * (fy - p1.sy) - (p2.sy - p1.sy) * (fx - p1.sx);
      const e2 = (p0.sx - p2.sx) * (fy - p2.sy) - (p0.sy - p2.sy) * (fx - p2.sx);
      if (!((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0))) continue;
      const sum = e0 + e1 + e2; if (sum === 0) continue;
      const wa = e1 / sum, wb = e2 / sum, wc = e0 / sum;
      const cy = 1 / (wa * i0 + wb * i1 + wc * i2);
      const idx = y * e.W + x;
      if (cy >= e.depth[idx]) continue;
      // per-texel solid colour block: one of a few discrete brightness steps + a warm/cool tint per
      // cell (real colour variation), NO edge mortar/contours — distinct pixel cubes, not fabric.
      const cu = Math.floor(wa * u0 + wb * u1 + wc * u2), cv = Math.floor(wa * v0 + wb * v1 + wc * v2);
      let hh = (cu * 374761393 + cv * 668265263) | 0; hh = (hh ^ (hh >> 13)) * 1274126177; hh = hh >>> 0;
      const m = 0.84 + (hh & 3) * 0.07;                 // 4 distinct brightness blocks
      const tnt = (((hh >>> 5) & 7) - 3.5) * 2.6;       // per-cell warm/cool tint → colour complexity
      const o = idx * 4;
      e.data[o] = rr * m + tnt; e.data[o + 1] = gg * m + tnt * 0.35; e.data[o + 2] = bb * m - tnt; e.data[o + 3] = 255;
      e.depth[idx] = cy;
    }
  }
};
// draw one axis-aligned cuboid: top + the ≤2 camera-facing side faces, Minecraft-shaded (top brightest),
// fogged by mean depth, dimmed by `light` (lantern). Colour (r,g,bl) is the base albedo.
const TEXD = 6;   // texel-cells per world unit (chunky pixel size)
const drawBox3D = (e: BoxEnv, wx: number, wy: number, w: number, dep: number, z0: number, z1: number, r: number, g: number, bl: number, light: number, glow = false) => {
  const x0 = wx - w / 2, x1 = wx + w / 2, y0 = wy - dep / 2, y1 = wy + dep / 2, hgt = z1 - z0;
  const P = (X: number, Y: number, Z: number) => projPt(e, X, Y, Z);
  const c000 = P(x0, y0, z0), c100 = P(x1, y0, z0), c010 = P(x0, y1, z0), c110 = P(x1, y1, z0);
  const c001 = P(x0, y0, z1), c101 = P(x1, y0, z1), c011 = P(x0, y1, z1), c111 = P(x1, y1, z1);
  // nu,nv = texel-cell counts across the face's two world dimensions (≥1)
  const quad = (a: PC, b: PC, c: PC, d: PC, shade: number, nu: number, nv: number) => {
    if (!(a.cy > 0.06 && b.cy > 0.06 && c.cy > 0.06 && d.cy > 0.06)) return;
    let ft = 1 - 1 / (1 + ((a.cy + b.cy + c.cy + d.cy) / 4) ** 2 * 0.012); ft = (ft < 0 ? 0 : ft > 1 ? 1 : ft) * (glow ? 0.25 : 0.6);
    const sl = shade * light;
    const rr = r * sl + (e.fog[0] - r * sl) * ft, gg = g * sl + (e.fog[1] - g * sl) * ft, bb = bl * sl + (e.fog[2] - bl * sl) * ft;
    fillTri(e, a, b, c, 0, 0, nu, 0, nu, nv, rr, gg, bb); fillTri(e, a, c, d, 0, 0, nu, nv, 0, nv, rr, gg, bb);
  };
  const cw = Math.max(1, w * TEXD), cd = Math.max(1, dep * TEXD), ch = Math.max(1, hgt * TEXD);
  quad(c001, c101, c111, c011, 1.0, cw, cd);                        // top face — brightest
  if (e.px > x1) quad(c100, c110, c111, c101, 0.6, cd, ch);         // east  face
  else if (e.px < x0) quad(c000, c010, c011, c001, 0.6, cd, ch);    // west  face
  if (e.py > y1) quad(c010, c110, c111, c011, 0.82, cw, ch);        // south face
  else if (e.py < y0) quad(c000, c100, c101, c001, 0.82, cw, ch);   // north face
};
// The exit DOOR's energy panel: a swirling pixel-gradient oval, quantised into blocks. u,v in 0..1
// across the door opening; returns null outside the oval (frame/room shows through).
const PORTAL_PIX = 9;
const portalPanelPix = (u: number, v: number, t: number, locked: boolean): [number, number, number] | null => {
  const cu = (Math.floor(u * PORTAL_PIX) + 0.5) / PORTAL_PIX - 0.5, cv = (Math.floor(v * PORTAL_PIX) + 0.5) / PORTAL_PIX - 0.5;
  const rad = Math.hypot(cu, cv * 1.25);
  if (rad > 0.5) return null;
  const ang = Math.atan2(cv, cu);
  const spiral = 0.5 + 0.5 * Math.sin(ang * 3 + rad * 20 - t * (locked ? 0.05 : 0.2));
  const rings = 0.5 + 0.5 * Math.sin(rad * 22 - t * (locked ? 0.04 : 0.16));
  const core = Math.max(0, 1 - rad * 3), e = 0.32 + 0.68 * spiral * rings;
  return locked ? [200 * e + 150 * core, 60 * e + 40 * core, 30 * e + 20 * core] : [30 * e + 120 * core, 200 * e + 170 * core, 250 * e + 120 * core];
};
// Fill an oriented quad (a→b→c→d) with the swirling portal panel, depth-tested, uv (0,0)(1,0)(1,1)(0,1).
const fillPortalQuad = (e: BoxEnv, a: PC, b: PC, c: PC, d: PC, locked: boolean, t: number) => {
  const tri = (p0: PC, u0: number, v0: number, p1: PC, u1: number, v1: number, p2: PC, u2: number, v2: number) => {
    if (!(p0.cy > 0.06 && p1.cy > 0.06 && p2.cy > 0.06)) return;
    const minX = Math.max(0, Math.floor(Math.min(p0.sx, p1.sx, p2.sx))), maxX = Math.min(e.W - 1, Math.ceil(Math.max(p0.sx, p1.sx, p2.sx)));
    const minY = Math.max(0, Math.floor(Math.min(p0.sy, p1.sy, p2.sy))), maxY = Math.min(e.H - 1, Math.ceil(Math.max(p0.sy, p1.sy, p2.sy)));
    if (minX > maxX || minY > maxY) return;
    const i0 = 1 / p0.cy, i1 = 1 / p1.cy, i2 = 1 / p2.cy;
    for (let y = minY; y <= maxY; y++) {
      const fy = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const fx = x + 0.5;
        const g0 = (p1.sx - p0.sx) * (fy - p0.sy) - (p1.sy - p0.sy) * (fx - p0.sx);
        const g1 = (p2.sx - p1.sx) * (fy - p1.sy) - (p2.sy - p1.sy) * (fx - p1.sx);
        const g2 = (p0.sx - p2.sx) * (fy - p2.sy) - (p0.sy - p2.sy) * (fx - p2.sx);
        if (!((g0 >= 0 && g1 >= 0 && g2 >= 0) || (g0 <= 0 && g1 <= 0 && g2 <= 0))) continue;
        const sum = g0 + g1 + g2; if (sum === 0) continue;
        const wa = g1 / sum, wb = g2 / sum, wc = g0 / sum, cy = 1 / (wa * i0 + wb * i1 + wc * i2);
        const idx = y * e.W + x; if (cy >= e.depth[idx]) continue;
        const col = portalPanelPix(wa * u0 + wb * u1 + wc * u2, wa * v0 + wb * v1 + wc * v2, t, locked);
        if (!col) continue;
        const o = idx * 4; e.data[o] = col[0]; e.data[o + 1] = col[1]; e.data[o + 2] = col[2]; e.data[o + 3] = 255; e.depth[idx] = cy;
      }
    }
  };
  tri(a, 0, 0, b, 1, 0, c, 1, 1); tri(a, 0, 0, c, 1, 1, d, 0, 1);
};
// A prop = a list of cuboids relative to its tile centre. dx,dy = horizontal offset (tiles); w,dep =
// footprint; z0,z1 = height range above the tile floor (world-Z); rgb = albedo; glow>0 = self-lit.
type PropBox = { dx: number; dy: number; w: number; dep: number; z0: number; z1: number; r: number; g: number; b: number; glow?: number };
const TREE_BOXES: PropBox[] = [
  { dx: 0, dy: 0, w: 0.2, dep: 0.2, z0: 0, z1: 0.98, r: 96, g: 60, b: 32 },        // trunk
  { dx: 0, dy: 0, w: 0.78, dep: 0.78, z0: 0.82, z1: 1.5, r: 40, g: 118, b: 48 },   // main canopy cube
  { dx: 0.16, dy: 0.12, w: 0.4, dep: 0.4, z0: 1.28, z1: 1.72, r: 46, g: 132, b: 54 },  // upper lump
  { dx: -0.14, dy: -0.1, w: 0.34, dep: 0.34, z0: 1.2, z1: 1.5, r: 34, g: 104, b: 42 }, // side lump
];
const chestBoxes = (open: boolean): PropBox[] => open
  ? [
      { dx: 0, dy: 0, w: 0.64, dep: 0.46, z0: 0, z1: 0.44, r: 120, g: 74, b: 34 },       // body
      { dx: 0, dy: -0.18, w: 0.66, dep: 0.12, z0: 0.44, z1: 0.82, r: 96, g: 58, b: 28 }, // lid flung back
      { dx: 0, dy: 0.02, w: 0.5, dep: 0.34, z0: 0.36, z1: 0.5, r: 255, g: 216, b: 120, glow: 1 }, // treasure glow
    ]
  : [
      { dx: 0, dy: 0, w: 0.64, dep: 0.46, z0: 0, z1: 0.42, r: 120, g: 74, b: 34 },        // body
      { dx: 0, dy: 0, w: 0.68, dep: 0.5, z0: 0.42, z1: 0.6, r: 100, g: 60, b: 28 },       // closed lid
      { dx: 0, dy: -0.24, w: 0.12, dep: 0.06, z0: 0.36, z1: 0.5, r: 240, g: 196, b: 80, glow: 0.9 }, // lock
    ];
const ROCK_BOXES: PropBox[] = [
  { dx: 0, dy: 0, w: 0.64, dep: 0.58, z0: 0, z1: 0.34, r: 120, g: 124, b: 132 },
  { dx: 0.08, dy: -0.06, w: 0.42, dep: 0.4, z0: 0.3, z1: 0.58, r: 134, g: 138, b: 146 },
  { dx: -0.13, dy: 0.1, w: 0.26, dep: 0.24, z0: 0.28, z1: 0.46, r: 106, g: 110, b: 118 },
];
const BUSH_BOXES: PropBox[] = [
  { dx: 0, dy: 0, w: 0.62, dep: 0.58, z0: 0, z1: 0.42, r: 36, g: 104, b: 46 },
  { dx: 0.1, dy: 0.09, w: 0.4, dep: 0.4, z0: 0.36, z1: 0.62, r: 44, g: 122, b: 54 },
  { dx: -0.12, dy: -0.09, w: 0.34, dep: 0.32, z0: 0.34, z1: 0.54, r: 30, g: 92, b: 40 },
];
const LAMP_BOXES: PropBox[] = [
  { dx: 0, dy: 0, w: 0.12, dep: 0.12, z0: 0, z1: 0.92, r: 54, g: 52, b: 62 },              // post
  { dx: 0, dy: 0, w: 0.3, dep: 0.3, z0: 0.9, z1: 1.2, r: 255, g: 224, b: 130, glow: 1 },   // glowing orb
];
const FLOWER_HUES = [[235, 80, 90], [235, 150, 60], [210, 90, 220], [90, 150, 240], [240, 240, 250]];
const flowerBoxes = (hue: number): PropBox[] => {
  const P = FLOWER_HUES[hue];
  return [
    { dx: 0, dy: 0, w: 0.07, dep: 0.07, z0: 0, z1: 0.34, r: 40, g: 112, b: 52 },            // stem
    { dx: 0, dy: 0, w: 0.26, dep: 0.26, z0: 0.32, z1: 0.5, r: P[0], g: P[1], b: P[2] },     // bloom petals
    { dx: 0, dy: 0, w: 0.1, dep: 0.1, z0: 0.42, z1: 0.54, r: 250, g: 220, b: 70, glow: 0.7 }, // golden centre
  ];
};

export const RaycastCanvas: React.FC<{
  levelId?: string;
  level?: Level3D;                 // pass a live (unsaved) level to test-play from the designer
  stageScale?: number;
  isMobileStage?: boolean;
  onExit?: () => void;            // back to the flat room
  onReward?: (n: number) => void; // crystals grabbed → economy hook (optional)
}> = ({ levelId, level: levelProp, isMobileStage = false, onExit, onReward }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Resolve the realm. A live designer level wins; otherwise load by id — builtin/local-cache first
  // (instant, synchronous), then the SHARED store. That last step is the fix for "works for me, not my
  // mate": a realm an admin built lives in the DB, so a portal to it now loads on any account/device.
  const [level, setLevelState] = useState<Level3D | null>(() => levelProp ?? (levelId ? getLevel(levelId) : null));
  const [loadingRealm, setLoadingRealm] = useState(false);
  useEffect(() => {
    if (levelProp) { setLevelState(levelProp); return; }
    if (!levelId) { setLevelState(null); return; }
    const local = getLevel(levelId);
    if (local) { setLevelState(local); setLoadingRealm(false); return; }   // builtin or already cached
    setLevelState(null); setLoadingRealm(true);
    let cancelled = false;
    getRealmRemote(levelId).then(r => { if (!cancelled) { setLevelState(r); setLoadingRealm(false); } }).catch(() => { if (!cancelled) setLoadingRealm(false); });
    return () => { cancelled = true; };
  }, [levelId, levelProp]);

  // HUD mirror (kept tiny — only what the React overlay needs)
  const [hud, setHud] = useState({ hp: MAX_HP, crystals: 0, total: 0, dead: false, exited: false, breath: 100, submerged: false, chests: 0, chestTotal: 0 });
  const [toast, setToast] = useState<{ msg: string; kind: 'good' | 'bad' } | null>(null);
  const onExitRef = useRef(onExit); useEffect(() => { onExitRef.current = onExit; });
  const onRewardRef = useRef(onReward); useEffect(() => { onRewardRef.current = onReward; });
  const attackFnRef = useRef<(() => void) | null>(null);   // mobile FIRE button → the in-effect attack
  const jumpRef = useRef(false);                           // mobile JUMP button → held this tick
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false); useEffect(() => { mutedRef.current = muted; }, [muted]);
  const ambToggleRef = useRef<((m: boolean) => void) | null>(null);   // ♪ button → start/stop ambience

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !level) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    if (!ctx) return;

    const floors = floorsOf(level);       // storey stack (one entry for a single-grid realm)
    const pal = paletteOf(level);
    const lighting = lightingOf(level);   // lantern darkness (horror) or null for a flatly-lit world
    const skyDef = skyOf(level);          // sky gradient + weather, or null for a solid ceiling
    const sky: [[number, number, number], [number, number, number]] | null = skyDef ? [skyDef.top, skyDef.horizon] : null;
    const skyFx = skyDef?.fx;
    const mood: Mood = moodOf(level);     // ambience: spooky / tense / chill
    const canFight = !!level.combat;      // false = run-and-hide world (no weapon)
    const sp0 = findSpawnFloor(floors);   // the one spawn 'S' lives on exactly one storey
    const spawnFloor = sp0.fi;
    const spawn = { x: sp0.x, y: sp0.y };

    // Crystals are a whole-realm goal; remember grabbed ones by floor+tile so they stay gone across storeys.
    const totalCrystals = floors.reduce((n, f) => n + f.rows.reduce((m, r) => m + (r.match(/C/g)?.length ?? 0), 0), 0);
    const grabbed = new Set<string>();    // "fi:x:y" keys of crystals already collected

    // Chests are a room-clear condition: open every one to UNLOCK the exit. Tracked by floor+tile like
    // crystals so they stay open across storeys. If a realm has no chests, the exit is unlocked as before.
    const totalChests = floors.reduce((n, f) => n + f.rows.reduce((m, r) => m + (r.match(/H/g)?.length ?? 0), 0), 0);
    const opened = new Set<string>();     // "fi:x:y" keys of chests already opened
    const exitLocked = () => totalChests > 0 && opened.size < totalChests;

    // Lava bubbling: molten voxel cubes that pop up out of lava tiles and fall back (a live particle pool).
    let lavaCells: { x: number; y: number; z: number }[] = [];   // centres + surface height of every 'L' tile
    const bubbles: { x: number; y: number; z: number; vz: number; gz: number; sz: number }[] = [];
    let grassCells: { x: number; y: number; z: number }[] = [];   // 'g' tiles → sprout little voxel grass tufts

    type Enemy = { x: number; y: number; hx: number; hy: number; chasing: boolean; wx: number; wy: number; wt: number; hit: number; hp: number; flash: number; k?: number };

    // ── Active storey (mutable — swapped when you take the stairs) ───────────────────────────────
    let fi = spawnFloor;
    let rows = floors[fi].rows;
    let fHeights: string[] | undefined = floors[fi].heights;
    let heightMap = false, maxLvl = 0, CEIL_Z = 0;     // terrain within the current floor
    let sprites: Sprite[] = [];                        // crystals / exit / trees on this floor
    let tunnels: { x: number; y: number }[] = [];      // 'O' warp pads on this floor
    let npcs: Npc3D[] = [];                             // friendly billboards on this floor
    let enemies: Enemy[] = [];                          // stalkers spawned from this floor's 'M' cells
    const floorLvl = (x: number, y: number) => heightAt({ heights: fHeights }, x, y);

    // (Re)build everything that depends on which storey you're standing on.
    const loadFloor = (index: number) => {
      fi = Math.max(0, Math.min(floors.length - 1, index));
      const fl = floors[fi];
      rows = fl.rows;
      fHeights = fl.heights;
      // Always use the height-aware renderer for single-floor realms (not just ones with raised terrain),
      // so the tall-player view is CONSISTENT everywhere — a plain flat room looks the same as a built one.
      heightMap = true;
      maxLvl = 0;
      for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) maxLvl = Math.max(maxLvl, floorLvl(x, y));
      CEIL_Z = maxLvl * STEP_UNIT + CEIL_GAP;          // flat ceiling above the tallest platform on this floor
      sprites = []; tunnels = []; enemies = []; lavaCells = []; grassCells = [];
      for (let y = 0; y < rows.length; y++)
        for (let x = 0; x < rows[y].length; x++) {
          const c = rows[y][x];
          if (c === 'L') lavaCells.push({ x: x + 0.5, y: y + 0.5, z: floorLvl(x, y) * STEP_UNIT });
          else if (c === 'g') grassCells.push({ x: x + 0.5, y: y + 0.5, z: floorLvl(x, y) * STEP_UNIT });
          if (c === 'C') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'crystal', key: `${fi}:${x}:${y}` });
          else if (c === CHEST_CHAR) sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'chest', key: `${fi}:${x}:${y}` });
          else if (c === 'E') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'exit' });
          else if (c === 'T') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'tree' });
          else if (c === 'b') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'bush' });
          else if (c === 'f') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'flower' });
          else if (c === 'r') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'rock' });
          else if (c === 'l') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'lamp' });
          else if (c === TUNNEL_CHAR) tunnels.push({ x: x + 0.5, y: y + 0.5 });
          else if (c === MONSTER_CHAR) enemies.push({ x: x + 0.5, y: y + 0.5, hx: x + 0.5, hy: y + 0.5, chasing: false, wx: x + 0.5, wy: y + 0.5, wt: 0, hit: 0, hp: 3, flash: 0 });
        }
      npcs = fl.npcs ?? [];
    };
    loadFloor(spawnFloor);

    // ── Stacked voxel world (2+ floors) ─────────────────────────────────────────────────────────
    // When a realm has multiple floors we stop swapping a single active grid and instead treat the
    // whole stack as ONE 3D world: every layer sits STOREY_H above the one below, walls are solid
    // blocks a storey tall (stand on their roof), '.'/etc are thin walkable slabs (their underside is
    // the ceiling for the layer below), and ' ' (air) is empty — you see and fall straight through it.
    // That's what lets you walk UNDER an overhang and look DOWN a shaft to the floor below.
    const stacked = floors.length > 1;
    const STOREY_H = STOREY_LEVELS * STEP_UNIT;       // world height of one storey (≈ one wall tall)
    const nLayers = floors.length;
    const grids = floors.map(f => f.rows);
    const baseZ = (k: number) => k * STOREY_H;        // floor height of layer k
    const cellL = (k: number, x: number, y: number) => (k < 0 || k >= nLayers) ? '#' : cellAt(grids[k], x, y);
    // Per-cell terrain height ALSO applies inside a stacked realm: the Raise/Lower tool lifts a walkable
    // slab within its storey (capped so it never pokes into the floor above). This is what lets raised
    // terrain and storeys coexist instead of being one-or-the-other.
    const hLvl = (k: number, x: number, y: number) => { const ch = floors[k]?.heights?.[y]?.[x]; return ch && ch >= '0' && ch <= '9' ? ch.charCodeAt(0) - 48 : 0; };
    const slabZ = (k: number, x: number, y: number) => baseZ(k) + Math.min(hLvl(k, x, y) * STEP_UNIT, STOREY_H - 0.05);
    const isSolidProp = (ch: string) => ch === 'T' || ch === 'r' || ch === 'l';
    const bodyBlocks = (ch: string) => isWall(ch) || isSolidProp(ch);      // fills its whole storey → blocks your body
    const STEP_UP = STEP_UNIT + 0.02;                 // you auto-step up a ledge this tall; taller needs a jump
    // every standable surface in a column: wall roofs (base+STOREY_H) and thin slab tops (base + raise).
    const standTops = (x: number, y: number): number[] => {
      const t: number[] = [];
      for (let k = 0; k < nLayers; k++) { const c = cellL(k, x, y); if (isWall(c)) t.push(baseZ(k) + STOREY_H); else if (!isAir(c)) t.push(slabZ(k, x, y)); }
      return t;
    };
    // movement collision that allows STEPPING: walls/props always block the body; raised terrain only
    // blocks the part that's more than one step above your feet, so 1-level terrain forms walkable ramps.
    const solidFor = (x: number, y: number, feet: number): boolean => {
      const zLo = feet + 0.3, zHi = feet + 1.6;   // Minecraft-tall body (~1.8 blocks) — 2-block walls block you
      for (let k = 0; k < nLayers; k++) {
        const c = cellL(k, x, y);
        if (bodyBlocks(c)) { const b = baseZ(k); if (zHi > b && zLo < b + STOREY_H) return true; }                       // walls/props: solid full storey
        else if (!isAir(c)) { const b = baseZ(k), top = slabZ(k, x, y); if (top > feet + STEP_UP && zHi > b && zLo < top) return true; }   // raised terrain: a SOLID hill you can't step straight up
      }
      return false;
    };
    // lowest block underside above `head` (head-bonk while jumping); +∞ = open sky above.
    const ceilAbove = (x: number, y: number, head: number): number => {
      let lo = Infinity; for (let k = 0; k < nLayers; k++) { const c = cellL(k, x, y); if (!bodyBlocks(c)) continue; const b = baseZ(k); if (b >= head - 0.001 && b < lo) lo = b; } return lo;
    };
    // which layer's surface you're standing on (for hazard/pickup/exit effects under your feet).
    // floor() not round() so raised terrain (a slab lifted within its storey) still reads as its own layer.
    const layerAt = (z: number) => Math.max(0, Math.min(nLayers - 1, Math.floor(z / STOREY_H + 0.001)));

    // Pull crystals/exit/props, stalkers and NPCs from EVERY layer — they all render at once (you see
    // the crystal on the floor above through a hole), each tagged with its layer k for its height.
    type LSprite = Sprite & { k: number };
    const allSprites: LSprite[] = [];
    const allNpcs: (Npc3D & { k: number })[] = [];
    if (stacked) {
      const all: Enemy[] = [];
      lavaCells = []; grassCells = [];
      for (let k = 0; k < nLayers; k++) {
        const g = grids[k];
        for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
          const c = g[y][x];
          if (c === 'L') lavaCells.push({ x: x + 0.5, y: y + 0.5, z: baseZ(k) });
          else if (c === 'g') grassCells.push({ x: x + 0.5, y: y + 0.5, z: baseZ(k) });
          if (c === 'C') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'crystal', key: `${k}:${x}:${y}`, k });
          else if (c === CHEST_CHAR) allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'chest', key: `${k}:${x}:${y}`, k });
          else if (c === 'E') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'exit', k });
          else if (c === 'T') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'tree', k });
          else if (c === 'b') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'bush', k });
          else if (c === 'f') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'flower', k });
          else if (c === 'r') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'rock', k });
          else if (c === 'l') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'lamp', k });
          else if (c === MONSTER_CHAR) all.push({ x: x + 0.5, y: y + 0.5, hx: x + 0.5, hy: y + 0.5, chasing: false, wx: x + 0.5, wy: y + 0.5, wt: 0, hit: 0, hp: 3, flash: 0, k });
        }
        for (const n of (floors[k].npcs ?? [])) allNpcs.push({ ...n, k });
      }
      enemies = all;       // stalker AI / attacks / minimap iterate this (each enemy carries its layer)
    }

    // Friendly/hazard NPC billboard buffer + appearance renderer (shared across floors).
    const npcBuf = document.createElement('canvas'); npcBuf.width = 96; npcBuf.height = 128;
    const npcCtx = npcBuf.getContext('2d') as CanvasRenderingContext2D;
    const renderAppearance = (a: string, af: number) => {
      npcCtx.clearRect(0, 0, npcBuf.width, npcBuf.height);
      npcCtx.save();
      npcCtx.translate(npcBuf.width / 2, npcBuf.height * 0.56);   // origin ~ mid-body; feet land near the bottom
      const app = resolveAppearance(a);
      if (app.kind === 'person') drawPerson(npcCtx, app.person, 64, 86, af);
      else if (app.kind === 'icon' && app.spec) drawIconSpec(npcCtx, app.spec, 72, af);
      else if (isCreatureId(a)) { const cr = parseCreature(a); drawSkinShape(npcCtx, cr.shape, cr.color, 60, 78, af, cr.accent); }
      else { const sk = skinById(app.kind === 'skin' ? app.id : 'diamond-gold'); drawSkinShape(npcCtx, sk.shape, sk.color, 60, 78, af); }
      npcCtx.restore();
    };

    // ── Player state ──────────────────────────────────────────────────────────────────────────
    let px = spawn.x, py = spawn.y;
    let dir = ((level.spawnDir ?? 0) * Math.PI) / 180;
    let pz = stacked ? baseZ(spawnFloor) : floorLvl(Math.floor(px), Math.floor(py)) * STEP_UNIT;   // feet height (stacked) / eased standing height (flat)
    let viewZ = pz;                                                  // eye height eased toward pz (smooth steps)
    let pitch = 0;                                                   // look up/down (screen px)
    let jz = 0, vz = 0, grounded = true;                            // jump: hop height, velocity, on-ground
    let groundZ = pz;                                               // height of the surface you last stood on (for fall damage)
    let atkCd = 0, atkAnim = 0;                                      // weapon cooldown + swing animation
    let breath = 100, submerged = false;                            // swimming: air left, are you under water
    let hp = MAX_HP;
    let panic = 0;             // rises each time a stalker strikes you → the screech gets more unhinged, decays slowly
    let respawn = 0;            // >0 = dead, counting down a fade before respawn
    let exited = false;
    let tick = 0;
    let bob = 0;               // view bob phase
    let shake = 0;             // damage shake
    let tpLock = false;        // true while standing on the tunnel you just arrived at (no instant re-warp)

    // ── Offscreen framebuffer (low-res, blitted up for the chunky retro look) ───────────────────
    const buf = document.createElement('canvas');
    const bctx = buf.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    let RES_W = 0, img: ImageData, data: Uint8ClampedArray, depth: Float32Array;
    const setupBuffer = (aspect: number) => {
      RES_W = Math.max(120, Math.min(640, Math.round(RES_H * aspect)));
      buf.width = RES_W; buf.height = RES_H;
      img = bctx.createImageData(RES_W, RES_H);
      data = img.data;
      depth = new Float32Array(RES_W * RES_H);   // per-pixel depth → sprites occlude correctly behind steps
    };

    // Size the visible canvas to its box; recompute internal width from the aspect ratio.
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      canvas.width = w; canvas.height = h;
      ctx.imageSmoothingEnabled = false;
      setupBuffer(w / h);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    // ── Audio (tiny, optional) ──────────────────────────────────────────────────────────────────
    // Everything routes through one master gain (~0.5) so overall loudness matches the flat world's SFX bus.
    let actx: AudioContext | null = null;
    let masterOut: GainNode | null = null;
    const ensureAudio = (): GainNode => {
      if (!actx) {
        actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        masterOut = actx.createGain(); masterOut.gain.value = 0.5; masterOut.connect(actx.destination);
      }
      return masterOut!;
    };
    const beep = (freq: number, dur: number, type: OscillatorType = 'square', gain = 0.05) => {
      try {
        const dest = ensureAudio();
        const o = actx!.createOscillator(), g = actx!.createGain();
        o.type = type; o.frequency.value = freq; g.gain.value = gain;
        o.connect(g); g.connect(dest);
        const t = actx!.currentTime; o.start(t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.stop(t + dur);
      } catch { /* audio blocked */ }
    };
    // Chest opening — a wooden latch/creak then a warm rising loot chime (reward, not horror).
    const chestOpen = () => {
      if (mutedRef.current) return;
      try {
        const dest = ensureAudio(); const t = actx!.currentTime;
        const len = Math.floor(actx!.sampleRate * 0.12);   // latch: short filtered noise knock
        const buf = actx!.createBuffer(1, len, actx!.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const ns = actx!.createBufferSource(); ns.buffer = buf;
        const bp = actx!.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 2;
        const ng = actx!.createGain(); ng.gain.setValueAtTime(0.16, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        ns.connect(bp); bp.connect(ng); ng.connect(dest); ns.start(t);
        [523, 659, 784, 1047].forEach(f => beep(f, 0.24, 'triangle', 0.045));   // warm loot chord (Cmaj7)
      } catch { /* audio blocked */ }
    };
    // Denied — a dull low buzz when you touch a locked exit (chests still to open).
    const denied = () => { beep(130, 0.14, 'square', 0.05); beep(98, 0.18, 'square', 0.04); };
    // Gate open — a bright rising fanfare when the last chest is opened and the exit unlocks.
    const gateFanfare = () => { if (mutedRef.current) return; [523, 659, 784, 1047, 1319].forEach(f => beep(f, 0.5, 'triangle', 0.05)); beep(262, 0.6, 'sine', 0.05); };
    // Reusable soft-clip fuzz curve → the electric, gritty, distorted edge. Higher amount = nastier.
    const shaper = (amount: number) => {
      const n = 1024, curve = new Float32Array(n), k = amount;
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
      const ws = actx!.createWaveShaper(); ws.curve = curve; ws.oversample = '4x'; return ws;
    };
    // ── Screech — a RING-MODULATED, COMB-RESONANT, HARD-CLIPPED demon scream. NO pitch swoosh (that
    // reads as a magic zap). Carrier×modulator at an inharmonic ratio makes clangorous metallic
    // sidebands (the demon-voice trick); a short feedback comb adds ringing metallic resonance;
    // extreme waveshaping fries the whole thing; a sub rumble + hissing air make it physical terror.
    const screech = (intensity = 1, dur = 0.75) => {
      if (mutedRef.current) return;
      const I = Math.min(2.4, intensity * (1 + panic * 0.9));   // more hits → more unhinged
      try {
        const dest = ensureAudio(); const t = actx!.currentTime;
        // shared output envelope — brutal near-instant attack, ugly decay
        const out = actx!.createGain();
        out.gain.setValueAtTime(0.0001, t);
        out.gain.linearRampToValueAtTime(0.4 * Math.min(2, I), t + 0.006);
        out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        out.connect(dest);
        // RING MOD — carrier saw × square modulator (inharmonic ratio) = harsh clangorous metal.
        // Pitches DRIFT DOWN slightly = dread; never sweep up (that was the swoosh).
        const carrier = actx!.createOscillator(); carrier.type = 'sawtooth';
        carrier.frequency.setValueAtTime(232 + I * 80, t); carrier.frequency.linearRampToValueAtTime(150 + I * 46, t + dur);
        const modu = actx!.createOscillator(); modu.type = 'square';
        modu.frequency.setValueAtTime(87 + I * 33, t); modu.frequency.linearRampToValueAtTime(61 + I * 19, t + dur);
        const ring = actx!.createGain(); ring.gain.value = 0;   // base 0 → pure multiply (ring mod)
        modu.connect(ring.gain); carrier.connect(ring);
        // HARD FUZZ — extreme clip, basically a square-off. Cranked → nastier, brighter grit.
        const fz = shaper(280 + I * 160); ring.connect(fz);
        // COMB — short feedback delay → ringing metallic resonance. Higher feedback = more it screams.
        const comb = actx!.createDelay(0.05); comb.delayTime.value = 0.0055 + I * 0.0012;
        const fb = actx!.createGain(); fb.gain.value = 0.93; fz.connect(comb); comb.connect(fb); fb.connect(comb);
        // sum dry+comb through a screaming formant bandpass, then a highpass to keep it nasty
        const bpf = actx!.createBiquadFilter(); bpf.type = 'bandpass'; bpf.Q.value = 1.8; bpf.frequency.value = 1450 + I * 550;
        fz.connect(bpf); comb.connect(bpf);
        const hp = actx!.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 260;
        bpf.connect(hp); hp.connect(out);
        // SUB rumble — a distorted low sine so the scream has a menacing body under it
        const sub = actx!.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(52, t); sub.frequency.exponentialRampToValueAtTime(33, t + dur);
        const subfz = shaper(6);
        const sg = actx!.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.26, t + 0.02); sg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        sub.connect(subfz); subfz.connect(sg); sg.connect(dest);
        // HISSING AIR — screaming noise through a sharp resonant bandpass (steady, no big sweep)
        const len = Math.floor(actx!.sampleRate * dur);
        const buf = actx!.createBuffer(1, len, actx!.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const ns = actx!.createBufferSource(); ns.buffer = buf;
        const nbp = actx!.createBiquadFilter(); nbp.type = 'bandpass'; nbp.Q.value = 7 + I * 8; nbp.frequency.value = 2600 + I * 800;
        const ng = actx!.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.13 * Math.min(2, I), t + 0.02); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.85);
        ns.connect(nbp); nbp.connect(ng); ng.connect(dest);
        carrier.start(t); modu.start(t); sub.start(t); ns.start(t);
        carrier.stop(t + dur); modu.stop(t + dur); sub.stop(t + dur); ns.stop(t + dur);
      } catch { /* audio blocked */ }
    };
    // ── Death — when a stalker kills you. A body SLAM, then a dying-demon groan that ring-mods and
    // slides DOWN into the sub while a shriek collapses over it, ending on a hollow comb-rung flatline.
    const death = () => {
      if (mutedRef.current) return;
      try {
        const dest = ensureAudio(); const t = actx!.currentTime; const dur = 2.2;
        // 1) SLAM — a deep fuzzed sub kick with a hard click transient
        const slam = actx!.createOscillator(); slam.type = 'sine'; slam.frequency.setValueAtTime(180, t); slam.frequency.exponentialRampToValueAtTime(28, t + 0.35);
        const slfz = shaper(10);
        const slg = actx!.createGain(); slg.gain.setValueAtTime(0.44, t); slg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        slam.connect(slfz); slfz.connect(slg); slg.connect(dest); slam.start(t); slam.stop(t + 0.52);
        const clk = actx!.createOscillator(); clk.type = 'triangle'; clk.frequency.setValueAtTime(1400, t); clk.frequency.exponentialRampToValueAtTime(160, t + 0.05);
        const clg = actx!.createGain(); clg.gain.setValueAtTime(0.28, t); clg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        clk.connect(clg); clg.connect(dest); clk.start(t); clk.stop(t + 0.07);
        // 2) DYING GROAN — ring-modulated metal sliding DOWN, hard-fuzzed, rung through a high-feedback comb
        const car = actx!.createOscillator(); car.type = 'sawtooth'; car.frequency.setValueAtTime(360, t); car.frequency.exponentialRampToValueAtTime(52, t + dur);
        const mod = actx!.createOscillator(); mod.type = 'square'; mod.frequency.setValueAtTime(104, t); mod.frequency.exponentialRampToValueAtTime(19, t + dur);
        const rg = actx!.createGain(); rg.gain.value = 0; mod.connect(rg.gain); car.connect(rg);
        const dfz = shaper(220); rg.connect(dfz);
        const dcomb = actx!.createDelay(0.05); dcomb.delayTime.value = 0.0093; const dfb = actx!.createGain(); dfb.gain.value = 0.9; dfz.connect(dcomb); dcomb.connect(dfb); dfb.connect(dcomb);
        const dbp = actx!.createBiquadFilter(); dbp.type = 'bandpass'; dbp.Q.value = 1.6; dbp.frequency.setValueAtTime(1300, t); dbp.frequency.exponentialRampToValueAtTime(300, t + dur);
        const dg = actx!.createGain(); dg.gain.setValueAtTime(0.0001, t); dg.gain.linearRampToValueAtTime(0.34, t + 0.04); dg.gain.setTargetAtTime(0.0001, t + dur * 0.6, 0.5);
        dfz.connect(dbp); dcomb.connect(dbp); dbp.connect(dg); dg.connect(dest);
        car.start(t); mod.start(t); car.stop(t + dur); mod.stop(t + dur);
        // 3) COLLAPSING SHRIEK — noise shriek that sweeps DOWN and dies (the last breath)
        const len = Math.floor(actx!.sampleRate * (dur * 0.7));
        const buf = actx!.createBuffer(1, len, actx!.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const ns = actx!.createBufferSource(); ns.buffer = buf;
        const nbp = actx!.createBiquadFilter(); nbp.type = 'bandpass'; nbp.Q.value = 10; nbp.frequency.setValueAtTime(3200, t); nbp.frequency.exponentialRampToValueAtTime(240, t + dur * 0.6);
        const ng = actx!.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.16, t + 0.03); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
        ns.connect(nbp); nbp.connect(ng); ng.connect(dest); ns.start(t); ns.stop(t + dur * 0.7);
      } catch { /* audio blocked */ }
    };
    // Hit — a brutal KICK-THUMP + gritty slash when the ghoul strikes you. Physical, chest-punching.
    const hurt = () => {
      if (mutedRef.current) return;
      try {
        const dest = ensureAudio(); const t = actx!.currentTime;
        // gritty slash — decaying noise pushed through fuzz so the impact bites
        const len = Math.floor(actx!.sampleRate * 0.18);
        const buf = actx!.createBuffer(1, len, actx!.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const ns = actx!.createBufferSource(); ns.buffer = buf;
        const bp = actx!.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.1;
        const slashFuzz = shaper(12);
        const ng = actx!.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.21, t + 0.003); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        ns.connect(bp); bp.connect(slashFuzz); slashFuzz.connect(ng); ng.connect(dest); ns.start(t);
        // KICK — a hard sub thump: sine punched from high down to sub-bass, fuzzed for a fried edge.
        const o = actx!.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
        const kfuzz = shaper(8);
        const g = actx!.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.34, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(kfuzz); kfuzz.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.24);
        // click transient — the sharp attack that makes it read as a KICK, not a hum
        const cl = actx!.createOscillator(); cl.type = 'triangle'; cl.frequency.setValueAtTime(1100, t); cl.frequency.exponentialRampToValueAtTime(180, t + 0.03);
        const cg = actx!.createGain(); cg.gain.setValueAtTime(0.18, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        cl.connect(cg); cg.connect(dest); cl.start(t); cl.stop(t + 0.05);
      } catch { /* audio blocked */ }
    };
    // Growl — low bandpassed noise rumble (a wet snarl), volume/pitch driven by proximity. Not a clean tone.
    const growl = (intensity: number, dur = 0.3) => {
      if (mutedRef.current) return;
      try {
        const dest = ensureAudio(); const t = actx!.currentTime;
        const len = Math.floor(actx!.sampleRate * dur);
        const buf = actx!.createBuffer(1, len, actx!.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const ns = actx!.createBufferSource(); ns.buffer = buf;
        const bp = actx!.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4 + intensity * 4; bp.frequency.value = 90 + intensity * 120;
        const g = actx!.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06 + intensity * 0.14, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        ns.connect(bp); bp.connect(g); g.connect(dest); ns.start(t); ns.stop(t + dur);
      } catch { /* audio blocked */ }
    };
    // Softer voiced note (attack + release) for the melodic layer over the drone.
    const tone = (freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.05) => {
      if (mutedRef.current) return;
      try {
        const dest = ensureAudio();
        const o = actx!.createOscillator(), g = actx!.createGain();
        o.type = type; o.frequency.value = freq; g.gain.value = 0;
        o.connect(g); g.connect(dest);
        const t = actx!.currentTime; o.start(t);
        g.gain.linearRampToValueAtTime(gain, t + Math.min(0.18, dur * 0.3));
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.stop(t + dur + 0.05);
      } catch { /* audio blocked */ }
    };
    // Footstep — the same soft pitch-dropping thud + bandpassed scuff the flat rooms use, so walking here
    // feels continuous with the rest of the world. Called once per stride from the movement code.
    const footstep = () => {
      if (mutedRef.current) return;
      try {
        const dest = ensureAudio(); const t = actx!.currentTime;
        const o = actx!.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(150 + Math.random() * 40, t); o.frequency.exponentialRampToValueAtTime(68, t + 0.08);
        const g = actx!.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);   // louder than the room bed
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.15);
        const len = Math.floor(actx!.sampleRate * 0.05);
        const buf = actx!.createBuffer(1, len, actx!.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const ns = actx!.createBufferSource(); ns.buffer = buf;
        const bp = actx!.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
        const ng = actx!.createGain(); ng.gain.value = 0.04;
        ns.connect(bp); bp.connect(ng); ng.connect(dest); ns.start(t);
      } catch { /* audio blocked */ }
    };
    let stepAt = 0;   // stride counter → one footstep per ~0.9 of view-bob travelled
    // Per-theme material: root pitch, melodic scale, and overall volume. Each atmosphere sounds different.
    const ROOTS: Record<Mood, number> = { day: 261.63, mist: 220.0, dungeon: 130.81, spooky: 130.81, mystery: 174.61, hell: 98.0, haven: 261.63 };
    const SCALES: Record<Mood, number[]> = {
      day: [0, 2, 4, 7, 9], mist: [0, 2, 4, 6, 9, 11], dungeon: [0, 2, 3, 5, 7, 10],
      spooky: [0, 1, 3, 5, 6, 8], mystery: [0, 2, 4, 6, 8, 10], hell: [0, 1, 4, 6, 7, 10],
      haven: [0, 2, 4, 5, 7, 9, 12],   // bright major — cheerful, resolved
    };
    const VOL: Record<Mood, number> = { day: 0.05, mist: 0.045, dungeon: 0.055, spooky: 0.06, mystery: 0.048, hell: 0.07, haven: 0.055 };
    const SCALE = SCALES[mood];
    const noteHz = (semi: number) => ROOTS[mood] * Math.pow(2, semi / 12);

    // ── Ambience — generative drone matching the level's mood (spooky/tense/chill). Starts on the
    // first user gesture (audio policy); a ♪ button mutes it. Spooky/tense get eerie stings over time.
    let amb: { master: GainNode; nodes: OscillatorNode[] } | null = null;
    const startAmbience = () => {
      if (amb || mutedRef.current) return;
      try {
        const dest = ensureAudio();
        const master = actx!.createGain(); master.gain.value = 0; master.connect(dest);
        master.gain.linearRampToValueAtTime(VOL[mood], actx!.currentTime + 2.5);   // gentler overall level
        const nodes: OscillatorNode[] = [];
        const mk = (f: number, type: OscillatorType, g: number) => {
          const o = actx!.createOscillator(), gg = actx!.createGain();
          o.type = type; o.frequency.value = f; gg.gain.value = g; o.connect(gg); gg.connect(master); o.start(); nodes.push(o); return o;
        };
        const wobble = (o: OscillatorNode, rate: number, depth: number) => { const lfo = actx!.createOscillator(); lfo.frequency.value = rate; const lg = actx!.createGain(); lg.gain.value = depth; lfo.connect(lg); lg.connect(o.frequency); lfo.start(); nodes.push(lfo); };
        if (mood === 'day') {
          mk(130.8, 'sine', 0.16); mk(196, 'sine', 0.11); mk(261.6, 'sine', 0.05);          // warm consonant pad
        } else if (mood === 'haven') {
          mk(130.8, 'sine', 0.14); mk(196, 'sine', 0.1); mk(261.6, 'triangle', 0.06); mk(392, 'sine', 0.03);   // bright major triad (C-E-G) + airy top → sunny, upbeat
          wobble(mk(784, 'sine', 0.018), 0.13, 3);                                                             // gentle shimmer
        } else if (mood === 'mist') {
          mk(110, 'sine', 0.14); mk(164.8, 'sine', 0.06); wobble(mk(659, 'sine', 0.03), 0.05, 4);   // airy, high shimmer drifting
        } else if (mood === 'dungeon') {
          mk(65.4, 'sine', 0.22); mk(98, 'triangle', 0.09); mk(130.8, 'sine', 0.05);         // low, moody, foreboding
        } else if (mood === 'spooky') {
          mk(52, 'sawtooth', 0.32); mk(55.5, 'sawtooth', 0.2);                                // detuned dread drone (beating)
          wobble(mk(415, 'sine', 0.05), 0.07, 8);                                             // high wavering tone
        } else if (mood === 'mystery') {
          mk(87.3, 'triangle', 0.15); mk(130.8, 'sine', 0.07); wobble(mk(523, 'sine', 0.035), 0.09, 6);   // cold, curious
        } else {   // hell
          mk(49, 'square', 0.2); mk(51.9, 'sawtooth', 0.16); mk(69.3, 'sawtooth', 0.1); mk(98, 'square', 0.06);   // menacing, dissonant
        }
        amb = { master, nodes };
      } catch { /* audio blocked */ }
    };
    const stopAmbience = () => {
      if (!amb || !actx) return;
      const a = amb; amb = null;
      try { a.master.gain.linearRampToValueAtTime(0, actx.currentTime + 0.4); } catch { /* noop */ }
      setTimeout(() => a.nodes.forEach(n => { try { n.stop(); } catch { /* noop */ } }), 500);
    };
    ambToggleRef.current = (m: boolean) => { if (m) { stopAmbience(); stopHunt(); } else startAmbience(); };
    // Duck the music down hard for a moment so a screech/hit PUNCHES through and dominates the mix (sidechain).
    const duck = (dur = 0.9) => {
      if (!amb || !actx) return;
      try {
        const t = actx.currentTime, g = amb.master.gain;
        g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(VOL[mood] * 0.4, t + 0.03);    // music dips but stays audible
        g.linearRampToValueAtTime(VOL[mood], t + dur);           // swells back
      } catch { /* noop */ }
    };

    // ── HUNT VOICE — a SUSTAINED screech that HOLDS the whole time a stalker is locked on you and
    // intensifies as it closes / as panic climbs: a high held violin-ish note + a screeching resonant-
    // noise layer, over a low bowed drone. Not one-shot swishes — it rides under you until you're safe.
    let hunt: { master: GainNode; hi: OscillatorNode; hi2: OscillatorNode; rmod: OscillatorNode; noise: AudioBufferSourceNode; bp: BiquadFilterNode; low: OscillatorNode; low2: OscillatorNode } | null = null;
    const startHunt = () => {
      if (hunt || mutedRef.current) return;
      try {
        const dest = ensureAudio(); const t = actx!.currentTime;
        const master = actx!.createGain(); master.gain.value = 0; master.connect(dest);
        master.gain.linearRampToValueAtTime(0.24, t + 0.18);          // swell in on lock — present but leaves room for the song
        // HELD DRONE — a metallic, disharmonic, comb-distorted MID drone (not a shrill note). Two
        // detuned saws ring-modulated by a low inharmonic square = clangorous metal; fried through
        // fuzz; run through a feedback comb for ringing resonance. The DREAD comes from it SWELLING
        // in volume as the stalker closes — not from rising pitch.
        const hi = actx!.createOscillator(); hi.type = 'sawtooth'; hi.frequency.value = 300;
        const hi2 = actx!.createOscillator(); hi2.type = 'sawtooth'; hi2.frequency.value = 300 * 1.008;    // slow menacing beat
        const rmod = actx!.createOscillator(); rmod.type = 'square'; rmod.frequency.value = 47;             // inharmonic ring modulator
        const ring = actx!.createGain(); ring.gain.value = 0; rmod.connect(ring.gain); hi.connect(ring); hi2.connect(ring);
        const hfz = shaper(48); ring.connect(hfz);
        const comb = actx!.createDelay(0.05); comb.delayTime.value = 0.0081; const cfb = actx!.createGain(); cfb.gain.value = 0.88; hfz.connect(comb); comb.connect(cfb); cfb.connect(comb);
        const hf = actx!.createBiquadFilter(); hf.type = 'bandpass'; hf.Q.value = 2.6; hf.frequency.value = 900;
        const hg = actx!.createGain(); hg.gain.value = 0.22; hfz.connect(hf); comb.connect(hf); hf.connect(hg); hg.connect(master); hi.start(t); hi2.start(t); rmod.start(t);
        // SCREECH AIR — resonant white noise riding on top for the shrieking, hissing edge.
        const len = Math.floor(actx!.sampleRate * 2); const buf = actx!.createBuffer(1, len, actx!.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const noise = actx!.createBufferSource(); noise.buffer = buf; noise.loop = true;
        const bp = actx!.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 24; bp.frequency.value = 2600;   // screeching resonance
        const ng = actx!.createGain(); ng.gain.value = 0.06; noise.connect(bp); bp.connect(ng); ng.connect(master); noise.start(t);
        // LOW HUM — a smooth, steady dread drone. Two detuned sines beat slowly; solid, not buzzy.
        const low = actx!.createOscillator(); low.type = 'sine'; low.frequency.value = 57;
        const low2 = actx!.createOscillator(); low2.type = 'sine'; low2.frequency.value = 57 * 1.013;   // slow ~0.75Hz throb
        const lg = actx!.createGain(); lg.gain.value = 0.24; low.connect(lg); low2.connect(lg); lg.connect(master); low.start(t); low2.start(t);
        hunt = { master, hi, hi2, rmod, noise, bp, low, low2 };
        if (amb) { const g = amb.master.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(VOL[mood] * 0.5, t + 0.15); }   // duck music while hunted, but keep the level song present
      } catch { /* noop */ }
    };
    const setHunt = (prox: number, pan: number) => {   // live intensify while it holds
      if (!hunt || !actx) return;
      try {
        const t = actx.currentTime, I = prox + pan * 0.5;
        hunt.master.gain.setTargetAtTime(0.16 + I * 0.27, t, 0.18);                 // VOLUME SWELL — the drone looms louder as it closes / panic rises
        hunt.bp.frequency.setTargetAtTime(1400 + prox * 1400 + pan * 700, t, 0.25); // metallic air opens a little
        const f = 300 + prox * 150 + pan * 90;                                      // drone barely creeps up — dread is the swell, not the pitch
        hunt.hi.frequency.setTargetAtTime(f, t, 0.35);
        hunt.hi2.frequency.setTargetAtTime(f * 1.008, t, 0.35);                     // keep the detune beat
      } catch { /* noop */ }
    };
    const stopHunt = () => {
      if (!hunt || !actx) return;
      const h = hunt; hunt = null;
      try {
        const t = actx.currentTime; h.master.gain.cancelScheduledValues(t); h.master.gain.setValueAtTime(h.master.gain.value, t); h.master.gain.linearRampToValueAtTime(0, t + 0.55);
        if (amb) { const g = amb.master.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(VOL[mood], t + 0.8); }   // music swells back
      } catch { /* noop */ }
      setTimeout(() => { try { h.hi.stop(); h.hi2.stop(); h.rmod.stop(); h.noise.stop(); h.low.stop(); h.low2.stop(); } catch { /* noop */ } }, 650);
    };

    // ── Input ─────────────────────────────────────────────────────────────────────────────────
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      keys.add(k);
      startAmbience();
      if (k === 'escape') onExitRef.current?.();
      if (k === 'f') attackFnRef.current?.();
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    // Mouse-look via pointer lock (desktop). Once locked, a click swings your weapon (combat realms).
    const onClick = () => {
      if (isMobileStage) return;
      startAmbience();
      if (document.pointerLockElement === canvas) attackFnRef.current?.();
      else canvas.requestPointerLock?.();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      dir += e.movementX * 0.0022;
      pitch = Math.max(-RES_H * 0.55, Math.min(RES_H * 0.55, pitch - e.movementY * 0.5));   // look up/down
    };
    canvas.addEventListener('click', onClick);
    window.addEventListener('mousemove', onMouseMove);

    // Touch: left half = move stick, right half = turn stick
    type Stick = { id: number; ox: number; oy: number; x: number; y: number };
    let moveStick: Stick | null = null, turnStick: Stick | null = null;
    const td = (e: PointerEvent) => {
      startAmbience();
      const r = canvas.getBoundingClientRect();
      const lx = e.clientX - r.left;
      const s: Stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      if (lx < r.width / 2) moveStick = s; else turnStick = s;
    };
    const tm = (e: PointerEvent) => {
      if (moveStick && e.pointerId === moveStick.id) { moveStick.x = e.clientX; moveStick.y = e.clientY; }
      if (turnStick && e.pointerId === turnStick.id) { turnStick.x = e.clientX; turnStick.y = e.clientY; }
    };
    const tu = (e: PointerEvent) => {
      if (moveStick && e.pointerId === moveStick.id) moveStick = null;
      if (turnStick && e.pointerId === turnStick.id) turnStick = null;
    };
    if (isMobileStage) {
      canvas.addEventListener('pointerdown', td);
      window.addEventListener('pointermove', tm);
      window.addEventListener('pointerup', tu);
      window.addEventListener('pointercancel', tu);
    }

    // ── Collision: try to move to (nx,ny); slide along walls; never enter a wall cell. A floor more
    // than one level above where you stand is too tall to climb (acts like a wall); dropping down any
    // amount is fine (you step/fall down). `base` = the level you're currently standing on.
    const tooTall = (cx: number, cy: number, base: number) => floorLvl(cx, cy) - base > (jz > 0.1 ? 2 : 1);
    const blocked = (x: number, y: number, base: number) => {
      const pts: [number, number][] = [[x - RADIUS, y], [x + RADIUS, y], [x, y - RADIUS], [x, y + RADIUS]];
      for (const [sx, sy] of pts) {
        const cx = Math.floor(sx), cy = Math.floor(sy);
        const c = cellAt(rows, cx, cy);
        if (isWall(c) || c === 'T' || c === 'r' || c === 'l') return true;   // trees, rocks, lamp posts are solid
        if (heightMap && tooTall(cx, cy, base)) return true;
      }
      return false;
    };
    const tryMove = (nx: number, ny: number) => {
      const base = floorLvl(Math.floor(px), Math.floor(py));
      if (!blocked(nx, py, base)) px = nx;
      if (!blocked(px, ny, base)) py = ny;
    };

    const doRespawn = () => { if (!stacked && fi !== spawnFloor) loadFloor(spawnFloor); px = spawn.x; py = spawn.y; dir = ((level.spawnDir ?? 0) * Math.PI) / 180; pz = stacked ? baseZ(spawnFloor) : floorLvl(Math.floor(px), Math.floor(py)) * STEP_UNIT; viewZ = pz; vz = 0; grounded = true; pitch = 0; hp = MAX_HP; breath = 100; respawn = 0; tpLock = false; panic = 0; stopHunt(); };

    // Transient on-screen message (gate cleared / gate locked). Cleared after a beat.
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    let lastDeniedTick = -999;
    const showToast = (msg: string, kind: 'good' | 'bad') => {
      setToast({ msg, kind }); clearTimeout(toastTimer); toastTimer = setTimeout(() => setToast(null), 2400);
    };
    // Advance the lava-bubble pool: integrate rise/fall under gravity, retire spent ones, spawn fresh
    // pops from lava tiles near the player. Cheap — a capped pool, only within view range.
    const stepBubbles = () => {
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]; b.vz -= 0.0018; b.z += b.vz;
        if (b.z <= b.gz - 0.03) bubbles.splice(i, 1);
      }
      if (lavaCells.length && bubbles.length < 70) {
        for (let s = 0; s < 2; s++) {
          const lc = lavaCells[(Math.random() * lavaCells.length) | 0];
          const dx = lc.x - px, dy = lc.y - py;
          if (dx * dx + dy * dy > 144 || Math.random() > 0.22) continue;   // sparse, within ~12 tiles
          bubbles.push({ x: lc.x + (Math.random() - 0.5) * 0.7, y: lc.y + (Math.random() - 0.5) * 0.7, z: lc.z, gz: lc.z, vz: 0.028 + Math.random() * 0.032, sz: 0.08 + Math.random() * 0.07 });
        }
      }
    };
    // Draw the bubbles as glowing molten cubes (hotter/brighter near the surface, cooling as they arc up).
    const drawBubbles = (env: BoxEnv) => {
      for (const b of bubbles) {
        const hot = Math.max(0.25, 1 - (b.z - b.gz) * 2.2);
        drawBox3D(env, b.x, b.y, b.sz, b.sz, b.z, b.z + b.sz, 255, 70 + hot * 150, 20 + hot * 40, 1, true);
      }
    };
    // Sprout little voxel grass tufts on nearby 'g' tiles so the ground reads 3D (deterministic per
    // tile: a few short green blade-cubes at hashed offsets, gently swaying). Culled to view range.
    const drawGrass = (env: BoxEnv, lightFn: (d: number) => number) => {
      for (const gc of grassCells) {
        const dx = gc.x - px, dy = gc.y - py, d2 = dx * dx + dy * dy;
        if (d2 > 110) continue;                       // ~10 tiles
        const gx = Math.floor(gc.x), gy = Math.floor(gc.y), light = lightFn(Math.sqrt(d2));
        for (let i = 0; i < 3; i++) {
          const rx = cellRand(gx * 4 + i, gy * 7 + i * 13), ry = cellRand(gx * 9 + i * 5, gy * 3 + i), rh = cellRand(gx + i, gy + i * 2);
          const sway = Math.sin(tick * 0.05 + gx + gy + i) * 0.02;
          const h = 0.12 + rh * 0.16;
          drawBox3D(env, gc.x + (rx - 0.5) * 0.66 + sway, gc.y + (ry - 0.5) * 0.66, 0.08, 0.08, gc.z, gc.z + h, 36, 96 + rh * 70, 44, light, false);
        }
      }
    };
    // Draw a stalker as a blocky VOXEL humanoid (legs, torso, dangling arms, head) with glowing eyes
    // and a gaping maw when hunting. Lateral/depth offsets are relative to the camera so the face and
    // limbs read correctly from any angle; it lurches when chasing. gz = the storey floor it stands on.
    const drawStalker = (env: BoxEnv, e: Enemy, gz: number, light: number) => {
      const dxp = env.px - e.x, dyp = env.py - e.y, dd = Math.hypot(dxp, dyp) || 1;
      const fx = dxp / dd, fy = dyp / dd, perpX = -fy, perpY = fx;   // toward-camera + lateral units
      const sway = e.chasing ? Math.sin(tick * 0.34 + e.hx) * 0.06 + Math.sin(tick * 0.71) * 0.03 : Math.sin(tick * 0.12 + e.hx) * 0.02;
      const HX = e.x + perpX * sway, HY = e.y + perpY * sway;
      let R = 26, G = 22, B = 34;                       // dark body
      if (e.chasing) { R = 78; G = 16; B = 22; }        // seething red when hunting
      if (e.flash > 0) { R = 255; G = 230; B = 230; }   // hit flash
      // box at lateral L / depth D from the figure centre, spanning world-Z [z0,z1]
      const box = (L: number, D: number, w: number, d: number, z0: number, z1: number, r: number, g: number, b: number, glow = false, lg = light) =>
        drawBox3D(env, HX + perpX * L + fx * D, HY + perpY * L + fy * D, w, d, gz + z0, gz + z1, r, g, b, lg, glow);
      box(-0.1, 0, 0.16, 0.16, 0, 0.82, R, G, B); box(0.1, 0, 0.16, 0.16, 0, 0.82, R, G, B);   // legs
      box(0, 0, 0.42, 0.34, 0.8, 1.5, R, G, B);                                                 // torso
      box(-0.27, 0, 0.13, 0.13, 0.84, 1.48, R, G, B); box(0.27, 0, 0.13, 0.13, 0.84, 1.48, R, G, B);   // long arms
      box(0, 0, 0.32, 0.3, 1.5, 1.88, R, G, B);                                                 // head
      const eyeGl = e.chasing ? 1 + 0.4 * Math.sin(tick * 0.5) : 1;
      const eR = (e.chasing ? 255 : 205) * eyeGl, eG = e.chasing ? 34 : 120, es = e.chasing ? 0.09 : 0.07;
      box(-es, 0.15, 0.08, 0.06, 1.66, 1.74, eR, eG, 34, true, 1); box(es, 0.15, 0.08, 0.06, 1.66, 1.74, eR, eG, 34, true, 1);   // glowing eyes
      if (e.chasing) box(0, 0.15, 0.18, 0.05, 1.55, 1.63, 44 + 26 * Math.sin(tick * 0.3), 4, 6, true, 1);   // gaping maw
    };
    // Exit as a VOXEL DOOR: a rock frame (pillars + lintel + threshold) around a swirling pixel-gradient
    // energy panel, facing `dirDeg` (0/90/180/270). Locked → the rock reddens and the panel smoulders.
    const drawExitDoor = (env: BoxEnv, wx: number, wy: number, gz: number, dirDeg: number, locked: boolean, light: number) => {
      const rd = dirDeg * Math.PI / 180, fxv = Math.cos(rd), fyv = Math.sin(rd), perpX = -fyv, perpY = fxv;
      const rr = locked ? 96 : 112, rg = locked ? 78 : 106, rb = locked ? 72 : 98;
      const fbox = (L: number, D: number, tLat: number, tDir: number, z0: number, z1: number) => {
        const w = Math.abs(perpX) * tLat + Math.abs(fxv) * tDir, dep = Math.abs(perpY) * tLat + Math.abs(fyv) * tDir;
        drawBox3D(env, wx + perpX * L + fxv * D, wy + perpY * L + fyv * D, w, dep, gz + z0, gz + z1, rr, rg, rb, light, false);
      };
      fbox(-0.44, 0, 0.2, 0.36, 0, 1.72);      // left pillar
      fbox(0.44, 0, 0.2, 0.36, 0, 1.72);       // right pillar
      fbox(0, 0, 1.08, 0.36, 1.6, 1.92);       // lintel
      fbox(0, 0, 1.08, 0.36, -0.02, 0.12);     // threshold
      const hw = 0.36, z0 = gz + 0.12, z1 = gz + 1.58;
      const P = (L: number, z: number) => projPt(env, wx + perpX * L, wy + perpY * L, z);
      fillPortalQuad(env, P(-hw, z0), P(hw, z0), P(hw, z1), P(-hw, z1), locked, tick);
    };
    let hudHp = -1, hudCry = -1, hudDead = false, hudBr = -1, hudCh = -1;
    const pushHud = () => {
      const c = grabbed.size, br = Math.round(breath), oc = opened.size;
      if (hp !== hudHp || c !== hudCry || (respawn > 0) !== hudDead || br !== hudBr || oc !== hudCh) {
        hudHp = hp; hudCry = c; hudDead = respawn > 0; hudBr = br; hudCh = oc;
        setHud({ hp: Math.max(0, Math.round(hp)), crystals: c, total: totalCrystals, dead: respawn > 0, exited, breath: br, submerged, chests: oc, chestTotal: totalChests });
      }
    };

    // ── Sim tick ────────────────────────────────────────────────────────────────────────────────
    const update = () => {
      tick++;
      if (atkCd > 0) atkCd--;
      if (atkAnim > 0) atkAnim--;
      if (exited) return;
      if (respawn > 0) { respawn--; if (respawn === 0) doRespawn(); return; }

      // jump — a hop you can use to mount a ledge one extra level high while airborne
      if ((keys.has(' ') || keys.has('spacebar')) && grounded) { vz = 0.05; grounded = false; }
      if (!grounded) { jz += vz; vz -= 0.006; if (jz <= 0) { jz = 0; vz = 0; grounded = true; } }

      // intent
      let fwd = 0, strafe = 0, turn = 0;
      const run = keys.has('shift');
      if (keys.has('w') || keys.has('arrowup')) fwd += 1;
      if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
      if (keys.has('q')) strafe -= 1;
      if (keys.has('e')) strafe += 1;
      if (keys.has('a') || keys.has('arrowleft')) turn -= 1;
      if (keys.has('d') || keys.has('arrowright')) turn += 1;
      if (moveStick) {
        const dx = moveStick.x - moveStick.ox, dy = moveStick.y - moveStick.oy;
        const max = 70;
        fwd += Math.max(-1, Math.min(1, -dy / max));
        strafe += Math.max(-1, Math.min(1, dx / max));
      }
      if (turnStick) turn += Math.max(-1, Math.min(1, (turnStick.x - turnStick.ox) / 70));

      dir += turn * TURN;
      const sp = run ? RUN : MOVE;
      const cos = Math.cos(dir), sin = Math.sin(dir);
      let nx = px, ny = py;
      if (fwd) { nx += cos * fwd * sp; ny += sin * fwd * sp; }
      if (strafe) { nx += -sin * strafe * sp; ny += cos * strafe * sp; }
      if (nx !== px || ny !== py) {
        tryMove(nx, ny);
        bob += sp;
        const s = Math.floor(bob / 0.9); if (s !== stepAt) { stepAt = s; footstep(); }   // one footfall per stride
      }

      // ease eye-height toward the floor you're standing on (so steps feel smooth, not teleporty)
      const standZ = floorLvl(Math.floor(px), Math.floor(py)) * STEP_UNIT;
      pz += (standZ - pz) * 0.25;

      // standing-tile effects
      const cx = Math.floor(px), cy = Math.floor(py);
      const here = cellAt(rows, cx, cy);
      if (here === TUNNEL_CHAR) {               // tunnel — warp to the next tunnel cell (loops/pairs)
        if (!tpLock && tunnels.length > 1) {
          const idx = tunnels.findIndex(t => Math.floor(t.x) === cx && Math.floor(t.y) === cy);
          const dst = tunnels[(idx + 1) % tunnels.length];
          px = dst.x; py = dst.y;
          pz = floorLvl(Math.floor(px), Math.floor(py)) * STEP_UNIT;
          tpLock = true;                         // don't bounce off the destination pad on arrival
          shake = Math.min(4, shake + 1.2);
          beep(520, 0.1, 'sine', 0.05); beep(780, 0.12, 'sine', 0.045); beep(1180, 0.14, 'sine', 0.04);
        }
      } else if (here === STAIR_UP || here === STAIR_DOWN) {   // stairs — change storey, land at the same x,y
        if (!tpLock) {
          const dest = fi + (here === STAIR_UP ? 1 : -1);
          if (dest >= 0 && dest < floors.length) {
            loadFloor(dest);
            pz = floorLvl(cx, cy) * STEP_UNIT;   // ease onto the new floor's terrain
            tpLock = true;                       // don't immediately ride the stair back
            beep(here === STAIR_UP ? 560 : 360, 0.12, 'triangle', 0.05); beep(here === STAIR_UP ? 840 : 240, 0.14, 'triangle', 0.045);
          }
        }
      } else { tpLock = false; }                 // stepped off a pad/stair → warps armed again
      if (here === '~') {                       // pit — you fall and die
        beep(180, 0.5, 'sawtooth', 0.06);
        hp = 0; respawn = 70;
      } else if (here === 'L') {                // lava — drains HP
        hp -= LAVA_DPS; shake = Math.min(4, shake + 0.8);
        if (tick % 14 === 0) beep(90, 0.08, 'sawtooth', 0.04);
        if (hp <= 0) { hp = 0; respawn = 70; beep(150, 0.5, 'sawtooth', 0.06); }
      }
      if (shake > 0) shake *= 0.85;
      if (panic > 0) panic *= 0.992;   // terror ebbs slowly once you get away

      // swimming — water saps your air; surface (any non-water tile) to breathe, or you drown
      submerged = here === 'w';
      if (submerged) {
        breath -= 0.38;
        if (tick % 50 === 0) beep(420, 0.12, 'sine', 0.025);            // bubble
        if (breath <= 0) { breath = 0; hp -= 0.7; if (tick % 10 === 0) beep(120, 0.2, 'sawtooth', 0.05); if (hp <= 0) { hp = 0; respawn = 70; } }
      } else if (breath < 100) {
        breath = Math.min(100, breath + 2.2);                           // gulp air back fast on the surface
      }

      // crystal pickups
      for (const s of sprites) {
        if (s.kind !== 'crystal' || !s.key || grabbed.has(s.key)) continue;
        if (Math.abs(s.x - px) < 0.45 && Math.abs(s.y - py) < 0.45) {
          grabbed.add(s.key); onRewardRef.current?.(5); beep(880, 0.12, 'triangle', 0.05); beep(1320, 0.1, 'triangle', 0.04);
        }
      }

      // chest opening — step onto a chest to open it (loot + reward); opening all unlocks the exit
      for (const s of sprites) {
        if (s.kind !== 'chest' || !s.key || opened.has(s.key)) continue;
        if (Math.abs(s.x - px) < 0.5 && Math.abs(s.y - py) < 0.5) { opened.add(s.key); onRewardRef.current?.(10); chestOpen(); if (opened.size === totalChests) { gateFanfare(); showToast('⚿ The gate is open', 'good'); } }
      }

      // exit — locked until every chest is opened
      if (here === 'E') {
        if (exitLocked()) { if (tick % 22 === 0) denied(); if (tick - lastDeniedTick > 80) { lastDeniedTick = tick; showToast(`▤ Gate locked — open all chests (${opened.size}/${totalChests})`, 'bad'); } }
        else { exited = true; stopHunt(); beep(660, 0.15, 'sine', 0.06); beep(990, 0.2, 'sine', 0.05); setTimeout(() => onExitRef.current?.(), 220); }
      }

      updateEnemies();
      stepBubbles();
      musicStep();
      pushHud();
    };

    // ── Melodic layer over the drone — evolving, not a flat pad ──────────────────────────────────
    let musicSeq = 0;
    const musicStep = () => {
      if (!amb || mutedRef.current) return;
      if (mood === 'day') {
        // gentle rolling arpeggio up and down the pentatonic + a soft bass swell
        if (tick % 26 === 0) { const n = SCALE.length, i = musicSeq % (n * 2), idx = i < n ? i : n * 2 - 1 - i; tone(noteHz(SCALE[idx] + 12), 0.9, 'sine', 0.05); musicSeq++; }
        if (tick % 208 === 0) tone(noteHz(SCALE[(musicSeq * 3) % SCALE.length]) / 2, 3.5, 'triangle', 0.045);
      } else if (mood === 'haven') {
        // bouncy, cheerful major melody with a light skip + a warm walking bass (upbeat, not ambient)
        const b = tick % 20;
        if (b === 0) { tone(noteHz(SCALE[musicSeq % SCALE.length] + 12), 0.32, 'triangle', 0.05); musicSeq++; }
        else if (b === 8) tone(noteHz(SCALE[(musicSeq * 2 + 2) % SCALE.length] + 12), 0.26, 'triangle', 0.04);   // the skip
        else if (b === 12) tone(noteHz(SCALE[(musicSeq + 4) % SCALE.length] + 24), 0.2, 'sine', 0.03);           // sparkle grace note
        if (tick % 40 === 0) tone(noteHz([0, 4, 7, 4][(musicSeq >> 1) & 3]) / 2, 1.1, 'triangle', 0.05);          // warm I–IV–V-ish bass
      } else if (mood === 'mist') {
        // sparse, airy high notes drifting in and out with long release
        if (tick % 96 === 0) { tone(noteHz(SCALE[(musicSeq * 2) % SCALE.length] + 12), 2.6, 'sine', 0.035); musicSeq++; }
        if (tick % 240 === 120) tone(noteHz(SCALE[musicSeq % SCALE.length] + 24), 3.0, 'sine', 0.022);
      } else if (mood === 'dungeon') {
        // slow ominous notes + a distant low toll
        if (tick % 84 === 0) { tone(noteHz(SCALE[(musicSeq * 4) % SCALE.length]), 1.8, 'triangle', 0.045); musicSeq++; }
        if (tick % 300 === 150) tone(noteHz(0) / 2, 3.4, 'sine', 0.05);
      } else if (mood === 'spooky') {
        // sparse, irregular minor notes that creep in + a low tritone swell
        const phr = tick % 168;
        if (phr === 0) { tone(noteHz(SCALE[(musicSeq * 5) % SCALE.length] + 12), 1.6, 'sine', 0.04); musicSeq++; }
        else if (phr === 70) tone(noteHz(SCALE[(musicSeq * 2 + 1) % SCALE.length] + 12), 1.1, 'sine', 0.03);
        else if (phr === 118 && (musicSeq & 1)) tone(noteHz(6) / 2, 2.2, 'sawtooth', 0.03);
      } else if (mood === 'mystery') {
        // wandering whole-tone notes at irregular spacing — unresolved, curious
        if (tick % 60 === 0) { tone(noteHz(SCALE[(musicSeq * 3 + 1) % SCALE.length] + 12), 1.2, 'triangle', 0.035); musicSeq++; }
        if (tick % 190 === 95) tone(noteHz(SCALE[musicSeq % SCALE.length] + 6), 1.6, 'sine', 0.03);
      } else {   // hell — driving pulse + dissonant stabs + tritone menace
        if (tick % 16 === 0) { tone(noteHz(0) / 2, 0.13, 'square', 0.06); musicSeq++; }
        if (tick % 128 === 64) tone(noteHz(SCALE[musicSeq % SCALE.length] + 12), 0.5, 'sawtooth', 0.05);
        if (tick % 96 === 48) tone(noteHz(6) / 2, 0.9, 'sawtooth', 0.045);
      }
    };

    // ── Stalker AI ──────────────────────────────────────────────────────────────────────────────
    const SIGHT = 4.5, LOSE = 7.5, E_WANDER = 0.012, E_CHASE = 0.038, E_DMG = 0.9;   // close to notice, slower than a running player → you can run & hide
    const eBlocked = (g: string[], x: number, y: number) =>
      isWall(cellAt(g, Math.floor(x), Math.floor(y))) || cellAt(g, Math.floor(x), Math.floor(y)) === '~' || isAir(cellAt(g, Math.floor(x), Math.floor(y)));   // walls, pits AND air-edges pen a stalker in
    const lineClear = (g: string[], x0: number, y0: number, x1: number, y1: number) => {
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (isWall(cellAt(g, Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t)))) return false;
      }
      return true;
    };
    const updateEnemies = () => {
      let chaseDist = Infinity;   // nearest hunting stalker → drives the escalating dread audio
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        const g = e.k != null ? grids[e.k] : rows;     // stalkers hunt within their own storey's grid
        const sameZ = e.k == null || Math.abs(baseZ(e.k) - pz) < 1.2;   // only menace you if you're on roughly its level
        if (e.hit > 0) e.hit--;
        if (e.flash > 0) e.flash--;
        const dx = px - e.x, dy = py - e.y;
        const dist = Math.hypot(dx, dy);
        const sees = sameZ && dist < SIGHT && lineClear(g, e.x, e.y, px, py);
        if (sees && !e.chasing) {   // the INSTANT it locks on → a piercing shriek that ducks the music and dominates
          screech(1.9, 0.9); growl(1.1, 0.7); duck(1.1); shake = Math.min(6, shake + 4);
        }
        if (sees) e.chasing = true; else if (dist > LOSE || !sameZ) e.chasing = false;   // give up if you break line of sight / change floors
        if (e.chasing && dist < chaseDist) chaseDist = dist;

        let tx: number, ty: number, sp: number;
        if (e.chasing) { tx = px; ty = py; sp = E_CHASE; }
        else {
          if (e.wt <= 0 || (Math.abs(e.x - e.wx) < 0.2 && Math.abs(e.y - e.wy) < 0.2)) {
            // pick a new wander point near home (deterministic-ish via tick + position, no RNG needed)
            const ang = (tick * 0.13 + e.hx * 1.7 + e.hy * 2.3) % (Math.PI * 2);
            e.wx = e.hx + Math.cos(ang) * 2.2; e.wy = e.hy + Math.sin(ang) * 2.2; e.wt = 160;
          }
          e.wt--; tx = e.wx; ty = e.wy; sp = E_WANDER;
        }
        const a = Math.atan2(ty - e.y, tx - e.x);
        const nx = e.x + Math.cos(a) * sp, ny = e.y + Math.sin(a) * sp;
        if (!eBlocked(g, nx, e.y)) e.x = nx;
        if (!eBlocked(g, e.x, ny)) e.y = ny;

        // touch → damage (with a short cooldown so it ticks, not nukes)
        if (sameZ && dist < 0.6 && e.hit === 0 && respawn === 0) {
          hp -= E_DMG * 8; e.hit = 40; shake = 5; panic = Math.min(1.4, panic + 0.4);   // each hit winds the terror up
          hurt(); screech(1.5, 0.45); duck(0.7);   // fleshy hit + a fresh shriek that gets shriller as panic climbs
          if (hp <= 0) { hp = 0; respawn = 70; stopHunt(); death(); duck(1.4); }
        }
      }
      // Escalating hunt dread — the closer the nearest stalker, the LOUDER, higher and faster the growl,
      // plus a heartbeat thump and rasp when it's right on you. Ramps up so being caught feels frantic.
      if (chaseDist < Infinity) {
        const prox = 1 - Math.min(chaseDist, SIGHT) / SIGHT;          // 0 far → 1 breathing down your neck
        startHunt(); setHunt(prox, panic);                           // the HELD screech that rides under you while hunted
        if (tick % Math.max(10, Math.round(26 - prox * 14)) === 0) growl(prox, 0.3);    // wet snarl over the top
        if (prox > 0.4 && tick % Math.max(8, Math.round(26 - prox * 16)) === 0) beep(42, 0.13, 'sine', 0.06 + prox * 0.12);   // heartbeat thud under it
      } else {
        stopHunt();
      }
    };

    // Attack — only in combat realms. A short-range frontal swing; run-and-hide realms have no weapon.
    const doAttack = () => {
      if (!canFight || atkCd > 0 || respawn > 0 || exited) return;
      atkCd = 24; atkAnim = 10; beep(260, 0.06, 'square', 0.05);
      const cos = Math.cos(dir), sin = Math.sin(dir);
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        if (e.k != null && Math.abs(baseZ(e.k) - pz) > 1.0) continue;   // can't hit a stalker a storey away
        const dx = e.x - px, dy = e.y - py, dist = Math.hypot(dx, dy);
        if (dist > 1.8 || dist < 0.001) continue;
        if ((dx * cos + dy * sin) / dist < 0.5) continue;   // must be roughly in front (~60° arc)
        e.hp -= 1; e.flash = 8; e.chasing = true; shake = 2; beep(150, 0.1, 'square', 0.05);
        if (e.hp <= 0) { onRewardRef.current?.(10); beep(440, 0.18, 'triangle', 0.06); }
      }
    };
    attackFnRef.current = doAttack;

    // ── Render ────────────────────────────────────────────────────────────────────────────────
    const draw = () => {
      const W = RES_W, H = RES_H;
      const cos = Math.cos(dir), sin = Math.sin(dir);
      const F = H / FOV;                       // focal length — apparent size of everything scales with this
      const planeLen = (W / H) * 0.5 * FOV;    // widen the lens by FOV; keeps pixels square with focal F
      const planeX = -sin * planeLen, planeY = cos * planeLen;
      const horizon = (H >> 1) + Math.round(pitch) + (heightMap ? 0 : Math.round(jz * 120));   // pitch + jump-bob (flat)
      const fog = pal.fog;

      const fogMix = (r: number, g: number, b: number, t: number): [number, number, number] => {
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        return [r + (fog[0] - r) * t, g + (fog[1] - g) * t, b + (fog[2] - b) * t];
      };

      // Lantern light: 1 near you, falling to `ambient` past `radius`; flickers if asked. The black
      // beyond your light is what makes the horror atmospheres terrifying. 1 (no darkening) otherwise.
      const flick = lighting && lighting.flicker
        ? 1 - lighting.flicker * (0.5 + 0.5 * Math.sin(tick * 0.7) * Math.sin(tick * 0.21 + 1.3))
        : 1;
      const lightAt = (dist: number): number => {
        if (!lighting) return 1;
        const f = 1 - dist / lighting.radius;
        return (f < lighting.ambient ? lighting.ambient : f) * flick;
      };

      // Sky: when a realm has one, the "ceiling" region renders a vertical gradient (day/night/etc.)
      // instead of a flat ceiling. null = a solid dungeon ceiling. Sky ignores the lantern (it's far off).
      const skyGrad = sky;   // [topRGB, horizonRGB] or null
      const skyColAt = (y: number): [number, number, number] => {
        const t = horizon <= 0 ? 1 : Math.max(0, Math.min(1, y / horizon));
        return [skyGrad![0][0] + (skyGrad![1][0] - skyGrad![0][0]) * t,
                skyGrad![0][1] + (skyGrad![1][1] - skyGrad![0][1]) * t,
                skyGrad![0][2] + (skyGrad![1][2] - skyGrad![0][2]) * t];
      };

      depth.fill(1e9);     // reset per-pixel depth + clear colour so a shifted horizon never tears
      data.fill(0);

      if (!heightMap) {
      // 1a) Sky / ceiling — colour depends only on the row, so fill each row once. Cover the horizon
      // row too (≤ horizon) so a pitched view never leaves an uncovered tearing line.
      for (let y = 0; y <= horizon && y < H; y++) {
        const p = Math.max(1, horizon - y);
        const rowDist = (0.5 * F) / p;
        let cr: number, cg: number, cb: number, dd: number;
        if (sky) { [cr, cg, cb] = skyColAt(y); dd = 1e9; }
        else { const lf = lightAt(rowDist); const ft = 1 - 1 / (1 + rowDist * rowDist * 0.012); const m = fogMix(pal.ceil[0], pal.ceil[1], pal.ceil[2], ft * 0.7); cr = m[0] * lf; cg = m[1] * lf; cb = m[2] * lf; dd = rowDist; }
        for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255; depth[y * W + x] = dd; }
      }
      // 1b) Floor cast (per pixel). Left/right edge rays bound the row.
      const rdx0 = cos - planeX, rdy0 = sin - planeY;   // leftmost ray
      const rdx1 = cos + planeX, rdy1 = sin + planeY;   // rightmost ray
      for (let y = Math.max(0, horizon + 1); y < H; y++) {
        const p = y - horizon;
        const rowDist = (0.5 * F) / p;                  // camera height 0.5
        const stepX = (rowDist * (rdx1 - rdx0)) / W;
        const stepY = (rowDist * (rdy1 - rdy0)) / W;
        let fx = px + rowDist * rdx0;
        let fy = py + rowDist * rdy0;
        const fogT = 1 - 1 / (1 + rowDist * rowDist * 0.012);
        const lf = lightAt(rowDist);
        const floorRow = y * W * 4;
        for (let x = 0; x < W; x++, fx += stepX, fy += stepY) {
          const mx = Math.floor(fx), my = Math.floor(fy);
          // Past the edge of the grid there is NO floor — paint the void (sky if the realm has one, else a
          // dark fog) instead of an endless checkerboard. This is what kills the "infinite chessboard" look.
          if (my < 0 || my >= rows.length || mx < 0 || mx >= rows[my].length) {
            const o = floorRow + x * 4;
            if (sky) { const [sr, sg, sb] = skyColAt(y); data[o] = sr; data[o + 1] = sg; data[o + 2] = sb; data[o + 3] = 255; depth[y * W + x] = 1e9; }
            else { const [vr, vg, vb] = fogMix(fog[0], fog[1], fog[2], 0); data[o] = vr * 0.6; data[o + 1] = vg * 0.6; data[o + 2] = vb * 0.6; data[o + 3] = 255; depth[y * W + x] = rowDist; }
            continue;
          }
          const c = cellAt(rows, mx, my);
          // floor colour by tile. Lava and the exit pad are EMISSIVE — they light themselves, so the
          // lantern darkness doesn't dim them (they read as beacons in a blackout).
          let fr: number, fg: number, fb: number, emissive = false;
          if (c === 'L') {                               // lava — glowing, shimmering
            const sh = 0.6 + 0.4 * Math.sin((fx + fy) * 6 + tick * 0.25);
            fr = 255 * sh; fg = 90 * sh + 30; fb = 20 * sh; emissive = true;
          } else if (c === 'w') {                         // water — animated blue ripples
            const sh = 0.7 + 0.3 * Math.sin((fx * 3 + fy * 2) * 2 + tick * 0.12);
            fr = 20 * sh; fg = 90 * sh; fb = 170 * sh; emissive = true;
          } else if (c === '~') {                         // pit — near-black void
            fr = 4; fg = 3; fb = 8; emissive = true;
          } else if (c === 'E') {                         // exit — cyan pad
            const sh = 0.7 + 0.3 * Math.sin(tick * 0.18);
            fr = 30; fg = 200 * sh; fb = 230 * sh; emissive = true;
          } else if (c === TUNNEL_CHAR) {                 // tunnel — swirling violet warp pad
            const sw = 0.55 + 0.45 * Math.sin((fx + fy) * 5 - tick * 0.3);
            fr = 150 * sw + 40; fg = 40 * sw; fb = 210 * sw + 40; emissive = true;
          } else if (c === STAIR_UP) {                    // stairs up — bright banded steps
            const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 1 : 0.7;
            fr = 180 * st; fg = 200 * st; fb = 150 * st; emissive = true;
          } else if (c === STAIR_DOWN) {                  // stairs down — a dark recessed shaft
            const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 0.5 : 0.28;
            fr = 40 * st; fg = 44 * st; fb = 60 * st; emissive = true;
          } else if (c === 'g' || c === 'b' || c === 'f') {  // grass (also under bushes/flowers)
            const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.95;
            fr = 46 * chk; fg = 120 * chk; fb = 48 * chk;
          } else if (c === 'p') {                          // pavement — light stone tiles with grout
            const gx = fx - Math.floor(fx), gy = fy - Math.floor(fy);
            const grout = (gx < 0.06 || gx > 0.94 || gy < 0.06 || gy > 0.94) ? 0.55 : 1;
            const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.9;
            fr = 150 * chk * grout; fg = 150 * chk * grout; fb = 162 * chk * grout;
          } else {                                        // normal floor — a faint grid, not a stark checker
            const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.95;
            fr = pal.floor[0] * chk; fg = pal.floor[1] * chk; fb = pal.floor[2] * chk;
          }
          const isVoid = c === '~';
          let [r, g, b] = isVoid ? [fr, fg, fb] : fogMix(fr, fg, fb, fogT);
          if (!emissive) { r *= lf; g *= lf; b *= lf; }
          const o = floorRow + x * 4;
          data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
          depth[y * W + x] = rowDist;
        }
      }

      // 2) Wall cast (DDA), one column per screen X. Overwrites the floor/ceil band.
      for (let x = 0; x < W; x++) {
        const camX = (2 * x) / W - 1;
        const rdx = cos + planeX * camX, rdy = sin + planeY * camX;
        let mapX = Math.floor(px), mapY = Math.floor(py);
        const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
        let sideX: number, sideY: number, stepX: number, stepY: number;
        if (rdx < 0) { stepX = -1; sideX = (px - mapX) * ddx; } else { stepX = 1; sideX = (mapX + 1 - px) * ddx; }
        if (rdy < 0) { stepY = -1; sideY = (py - mapY) * ddy; } else { stepY = 1; sideY = (mapY + 1 - py) * ddy; }
        let side = 0, hitCh = '#';
        for (let guard = 0; guard < 64; guard++) {
          if (sideX < sideY) { sideX += ddx; mapX += stepX; side = 0; } else { sideY += ddy; mapY += stepY; side = 1; }
          const c = cellAt(rows, mapX, mapY);
          if (isWall(c)) { hitCh = c; break; }
        }
        const perp = Math.max(0.02, side === 0 ? sideX - ddx : sideY - ddy);
        const lineH = Math.min(H * 12, Math.max(1, Math.floor(F / perp)));
        let drawStart = horizon - (lineH >> 1);
        let drawEnd = drawStart + lineH;
        const top = Math.max(0, drawStart), bot = Math.min(H, drawEnd);
        // texture X (where the ray hit along the wall face)
        const wallX = (side === 0 ? py + perp * rdy : px + perp * rdx) % 1;
        const base = pal.wall[hitCh] ?? pal.wall['#'];
        const sideDark = (side === 1 ? 0.7 : 1) * lightAt(perp);   // N/S faces darker + lantern falloff
        const fogT = 1 - 1 / (1 + perp * perp * 0.012);
        for (let y = top; y < bot; y++) {
          const ty = (y - drawStart) / lineH;            // 0..1 down the wall
          // cheap procedural brick: mortar lines + per-brick tint
          const brickRow = Math.floor(ty * 6);
          const offset = (brickRow & 1) ? 0.5 : 0;
          const bx = (wallX + offset) % 1;
          const mortar = (ty * 6) % 1 < 0.09 || (bx * 3) % 1 < 0.06 ? 0.55 : 1;
          const shade = sideDark * mortar * (0.8 + 0.2 * (1 - ty));
          const [r, g, b] = fogMix(base[0] * shade, base[1] * shade, base[2] * shade, fogT);
          const o = (y * W + x) * 4;
          data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
          depth[y * W + x] = perp;
        }
      }
      } else {
        // ── Multi-height renderer ──────────────────────────────────────────────────────────────────
        // Per column, march cells near→far. For each cell draw its floor at its OWN height, the flat
        // ceiling, and a vertical riser wherever the floor steps up/down. A free window [yCeil, yFloor)
        // shrinks as we go, so nearer geometry occludes farther — the trick that makes height read.
        const eye = pz + EYE_BASE + jz;   // jump raises your eye in 3D-height realms
        const projF = (z: number, d: number) => horizon + ((eye - z) * F) / d;
        const fogTd = (d: number) => 1 - 1 / (1 + d * d * 0.012);
        for (let x = 0; x < W; x++) {
          const camX = (2 * x) / W - 1;
          const rdx = cos + planeX * camX, rdy = sin + planeY * camX;
          let mapX = Math.floor(px), mapY = Math.floor(py);
          const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
          let sideX: number, sideY: number, stepX: number, stepY: number;
          if (rdx < 0) { stepX = -1; sideX = (px - mapX) * ddx; } else { stepX = 1; sideX = (mapX + 1 - px) * ddx; }
          if (rdy < 0) { stepY = -1; sideY = (py - mapY) * ddy; } else { stepY = 1; sideY = (mapY + 1 - py) * ddy; }
          let curCh = cellAt(rows, mapX, mapY);
          let curZ = floorLvl(mapX, mapY) * STEP_UNIT;
          let dEnter = 0.0001, yFloor = H, yCeil = 0;
          for (let guard = 0; guard < 96 && yFloor > yCeil; guard++) {
            let side: number, dExit: number;
            if (sideX < sideY) { dExit = sideX; sideX += ddx; mapX += stepX; side = 0; }
            else { dExit = sideY; sideY += ddy; mapY += stepY; side = 1; }
            if (dExit < dEnter + 0.0001) dExit = dEnter + 0.0001;

            // floor of the current cell over [dEnter, dExit] (only visible when below your eye)
            if (curZ < eye) {
              const a = Math.max(yCeil, Math.floor(projF(curZ, dExit)));      // floor/ceil rounding expands
              const b = Math.min(yFloor, Math.ceil(projF(curZ, dEnter)));     // each strip 1px → no seams
              for (let y = a; y < b; y++) {
                const pp = y - horizon; if (pp <= 0) continue;
                const d = ((eye - curZ) * F) / pp;
                const fx = px + d * rdx, fy = py + d * rdy;
                let fr: number, fg: number, fb: number, emis = false;
                if (curCh === 'L') { [fr, fg, fb] = moltenLava(fx, fy, tick); emis = true; }
                else if (curCh === 'w') { [fr, fg, fb] = pixelWater(fx, fy, tick); emis = true; }
                else if (curCh === 'E') { const [pr, pg, pb, pa] = portalFloor(fx, fy, tick, exitLocked()); const bs = sampleTex(TEXES.dirt, fx, fy, lodOf(d)); fr = pr + pal.floor[0] * bs * (1 - pa); fg = pg + pal.floor[1] * bs * (1 - pa); fb = pb + pal.floor[2] * bs * (1 - pa); emis = true; }
                else if (curCh === TUNNEL_CHAR) { const sw = 0.55 + 0.45 * Math.sin((fx + fy) * 5 - tick * 0.3); fr = 150 * sw + 40; fg = 40 * sw; fb = 210 * sw + 40; emis = true; }
                else if (curCh === STAIR_UP) { const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 1 : 0.7; fr = 180 * st; fg = 200 * st; fb = 150 * st; emis = true; }
                else if (curCh === STAIR_DOWN) { const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 0.5 : 0.28; fr = 40 * st; fg = 44 * st; fb = 60 * st; emis = true; }
                else if (curCh === '~') { fr = 4; fg = 3; fb = 8; emis = true; }
                else if (curCh === 'g' || curCh === 'b' || curCh === 'f') { const b = sampleTex(TEXES.grass, fx, fy, lodOf(d)); fr = 46 * b; fg = 120 * b; fb = 48 * b; }
                else if (curCh === 'p') { const b = sampleTex(TEXES.pave, fx, fy, lodOf(d)); fr = 150 * b; fg = 150 * b; fb = 162 * b; }
                else { const b = sampleTex(TEXES.dirt, fx, fy, lodOf(d)); fr = pal.floor[0] * b; fg = pal.floor[1] * b; fb = pal.floor[2] * b; }
                let r: number, g: number, bl: number;
                if (emis) { r = fr; g = fg; bl = fb; } else { [r, g, bl] = fogMix(fr, fg, fb, fogTd(d)); const lf = lightAt(d); r *= lf; g *= lf; bl *= lf; }
                const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255;
                depth[y * W + x] = d;
              }
              yFloor = Math.min(yFloor, a);
            }

            // ceiling / sky over [dEnter, dExit] (only visible above the horizon)
            {
              const ct = Math.max(yCeil, Math.floor(projF(CEIL_Z, dEnter)));
              const cb = Math.min(yFloor, Math.ceil(projF(CEIL_Z, dExit)));
              for (let y = ct; y < cb; y++) {
                const pp = y - horizon; if (pp >= 0) continue;
                const o = (y * W + x) * 4;
                if (sky) { const [sr, sg, sb] = skyColAt(y); data[o] = sr; data[o + 1] = sg; data[o + 2] = sb; data[o + 3] = 255; depth[y * W + x] = 1e9; }
                else { const d = ((eye - CEIL_Z) * F) / pp; const lf = lightAt(d); const [cr, cg, cbl] = fogMix(pal.ceil[0], pal.ceil[1], pal.ceil[2], fogTd(d) * 0.7); data[o] = cr * lf; data[o + 1] = cg * lf; data[o + 2] = cbl * lf; data[o + 3] = 255; depth[y * W + x] = d; }
              }
              yCeil = Math.max(yCeil, cb);
            }

            const nextCh = cellAt(rows, mapX, mapY);
            if (isWall(nextCh)) {                                   // full wall → close the column
              const base = pal.wall[nextCh] ?? pal.wall['#'];
              const sd = (side === 1 ? 0.6 : 1) * lightAt(dExit);   // stronger N/S face shading → more depth
              const ft = fogTd(dExit);
              const wTopF = projF(CEIL_Z, dExit), wBotF = projF(curZ, dExit);
              const span = Math.max(1, wBotF - wTopF);
              const wxv = side === 0 ? py + dExit * rdy : px + dExit * rdx;
              const wxf = wxv - Math.floor(wxv);
              const wt = Math.max(yCeil, Math.floor(wTopF)), wb = Math.min(yFloor, Math.ceil(wBotF));
              const tex = wallTexOf(nextCh), lod = lodOf(dExit), vScale = (CEIL_Z - curZ) / STOREY_H;   // one texture tile per block
              const edgeAO = 0.88 + 0.12 * (1 - Math.abs(wxf - 0.5) * 2);   // fake AO: darker toward block edges
              for (let y = wt; y < wb; y++) {
                const ty = (y - wTopF) / span;
                const b = sampleTex(tex, wxf, ty * vScale, lod);       // real (procedural) block texture
                const baseAO = 0.66 + 0.34 * Math.min(1, (1 - ty) * 3);   // contact shadow where the wall meets the floor
                const shade = sd * b * baseAO * edgeAO;
                const [r, g, bl] = fogMix(base[0] * shade, base[1] * shade, base[2] * shade, ft);
                const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255;
                depth[y * W + x] = dExit;
              }
              break;
            }
            const nZ = floorLvl(mapX, mapY) * STEP_UNIT;
            if (nZ !== curZ) {                                      // step up/down → vertical riser
              const zHi = Math.max(curZ, nZ), zLo = Math.min(curZ, nZ);
              const sd = (side === 1 ? 0.5 : 0.62) * lightAt(dExit);
              const ft = fogTd(dExit);
              const base = pal.floor;                              // a SHADOWED ledge (darkened floor), not bright stone
              const ra = Math.max(yCeil, Math.floor(projF(zHi, dExit)));
              const rb = Math.min(yFloor, Math.ceil(projF(zLo, dExit)));
              const [r, g, bl] = fogMix(base[0] * sd, base[1] * sd, base[2] * sd, ft);
              for (let y = ra; y < rb; y++) { const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255; depth[y * W + x] = dExit; }
              yFloor = Math.min(yFloor, ra);
              curZ = nZ;
            }
            curCh = nextCh;
            dEnter = dExit;
            if (dExit > 48) break;
          }
        }
      }

      // 3) Sprites (crystals + exit gate) — billboard, depth-tested per column against zbuf.
      // Canonical raycaster inverse camera matrix (Lodev): dir=(cos,sin), plane=(planeX,planeY).
      const invDet = 1 / (planeX * sin - cos * planeY);
      const order = sprites
        .map((s, i) => ({ s, i, d: (s.x - px) ** 2 + (s.y - py) ** 2 }))
        .filter(o => !(o.s.kind === 'crystal' && o.s.key && grabbed.has(o.s.key)))
        .sort((a, b) => b.d - a.d);
      for (const { s, kind } of order.map(o => ({ s: o.s, kind: o.s.kind as string }))) {
        const relX = s.x - px, relY = s.y - py;
        const camY = invDet * (-planeY * relX + planeX * relY);  // depth (forward)
        if (camY <= 0.1) continue;
        const camX = invDet * (sin * relX - cos * relY);
        const screenX = Math.floor((W / 2) * (1 + camX / camY));
        const sizeBase = Math.abs(Math.floor(F / camY));
        const zfS = heightMap ? floorLvl(Math.floor(s.x), Math.floor(s.y)) * STEP_UNIT : 0;
        const eyeH2 = heightMap ? pz + EYE_BASE + jz : 0.5;
        const groundY = horizon + ((eyeH2 - zfS) * F) / camY;             // where this cell's floor meets the sprite
        const hShift = heightMap ? Math.round(((pz - zfS) * F) / camY) : 0;
        // Crystal — a floating, bobbing voxel gem (glowing cyan cubes) instead of a flat billboard
        if (kind === 'crystal') {
          const env: BoxEnv = { px, py, invDet, sin, cos, planeX, planeY, W, H, F, horizon, eye: eyeH2, fog: pal.fog, data, depth };
          const fb = zfS + 0.42 + Math.sin(tick * 0.09 + s.x * 3) * 0.06;
          drawBox3D(env, s.x, s.y, 0.1, 0.1, fb, fb + 0.12, 150, 240, 255, 1, true);
          drawBox3D(env, s.x, s.y, 0.26, 0.26, fb + 0.1, fb + 0.26, 110, 225, 255, 1, true);
          drawBox3D(env, s.x, s.y, 0.12, 0.12, fb + 0.24, fb + 0.38, 190, 250, 255, 1, true);
          continue;
        }
        // Exit — a voxel rock DOOR with a swirling pixel-gradient panel, facing its chosen direction
        if (kind === 'exit') {
          const env: BoxEnv = { px, py, invDet, sin, cos, planeX, planeY, W, H, F, horizon, eye: eyeH2, fog: pal.fog, data, depth };
          const gx = Math.floor(s.x), gy = Math.floor(s.y);
          const auto = !isWall(cellAt(rows, gx + 1, gy)) ? 0 : !isWall(cellAt(rows, gx, gy + 1)) ? 90 : !isWall(cellAt(rows, gx - 1, gy)) ? 180 : 270;
          drawExitDoor(env, s.x, s.y, zfS, level.exitDir ?? auto, exitLocked(), Math.max(lightAt(camY), 0.6));
          continue;
        }
        // Voxel props — real depth-tested cubes (walk around them), not billboards
        const isVox = kind === 'tree' || kind === 'chest' || kind === 'rock' || kind === 'bush' || kind === 'lamp' || kind === 'flower';
        if (isVox) {
          const env: BoxEnv = { px, py, invDet, sin, cos, planeX, planeY, W, H, F, horizon, eye: eyeH2, fog: pal.fog, data, depth };
          const light = lightAt(camY);
          const boxes = kind === 'tree' ? TREE_BOXES : kind === 'rock' ? ROCK_BOXES : kind === 'bush' ? BUSH_BOXES : kind === 'lamp' ? LAMP_BOXES
            : kind === 'flower' ? flowerBoxes((Math.floor(s.x) * 7 + Math.floor(s.y) * 13) % 5) : chestBoxes(!!(s.key && opened.has(s.key)));
          for (const bx of boxes) drawBox3D(env, s.x + bx.dx, s.y + bx.dy, bx.w, bx.dep, zfS + bx.z0, zfS + bx.z1, bx.r, bx.g, bx.b, bx.glow ? Math.max(light, bx.glow) : light, !!bx.glow);
          continue;
        }
        // sizes bumped for the tall-player world (walls are ~2 blocks) so props/exit read proportional, not tiny
        const szMul = kind === 'tree' ? 2.4 : kind === 'lamp' ? 1.8 : kind === 'rock' ? 1.15 : kind === 'bush' ? 1.0 : kind === 'flower' ? 0.62 : kind === 'exit' ? 1.8 : kind === 'chest' ? 0.85 : 0.9;
        const sz = kind === 'exit' ? sizeBase : Math.floor(sizeBase * szMul);
        const half = sz >> 1;
        const isGround = kind === 'tree' || kind === 'bush' || kind === 'flower' || kind === 'rock' || kind === 'lamp';
        // ground props stand ON the floor; crystals float; the exit gate sits at the horizon
        const vCenter = isGround ? Math.round(groundY) - half
          : (kind === 'exit' ? horizon : horizon + Math.floor(sizeBase * 0.18) - Math.floor(Math.sin(tick * 0.08) * sizeBase * 0.04)) + hShift;
        const lfTree = isGround ? lightAt(camY) : 1;
        const hue = (Math.floor(s.x) * 7 + Math.floor(s.y) * 13) % 5;   // flower colour variety by tile
        const sx0 = Math.max(0, screenX - half), sx1 = Math.min(W, screenX + half);
        const sy0 = Math.max(0, vCenter - half), sy1 = Math.min(H, vCenter + (kind === 'exit' ? half : 0) + 1);
        const fogT = 1 - 1 / (1 + camY * camY * 0.012);
        for (let x = sx0; x < sx1; x++) {
          const u = (x - (screenX - half)) / sz - 0.5;   // -0.5..0.5 across sprite
          for (let y = sy0; y < sy1; y++) {
            if (camY >= depth[y * W + x]) continue;       // per-pixel depth → steps/walls occlude it
            const v = (y - (vCenter - half)) / sz - 0.5;  // -0.5 top .. 0.5 bottom
            let on = false, r = 0, g = 0, b = 0, lit = false;
            if (kind === 'crystal') {                     // glowing diamond
              const dd = Math.abs(u) + Math.abs(v);
              if (dd < 0.42) { on = true; const gl = 1 - dd / 0.42; r = 120 + 135 * gl; g = 230; b = 255; }
            } else if (kind === 'tree') {                 // trunk + leafy canopy (lantern-lit, not emissive)
              if (v > 0.12 && Math.abs(u) < 0.07) { on = true; lit = true; r = 96; g = 64; b = 36; }                    // trunk
              else { const cu = u, cv = v + 0.18; const dd = Math.sqrt(cu * cu + cv * cv * 1.1); if (dd < 0.4) { on = true; lit = true; const sh = 0.7 + 0.3 * Math.sin(u * 9 + v * 9 + tick * 0.05); r = 28 * sh; g = (95 + 40 * (1 - dd / 0.4)) * sh; b = 38 * sh; } }   // canopy
            } else if (kind === 'bush') {                 // low rounded shrub
              const cu = u, cv = v - 0.16; const dd = Math.sqrt(cu * cu * 1.15 + cv * cv);
              if (dd < 0.42) { on = true; lit = true; const sh = 0.7 + 0.3 * Math.sin(u * 12 + v * 10 + tick * 0.04); r = 30 * sh; g = (88 + 46 * (1 - dd / 0.42)) * sh; b = 44 * sh; }
            } else if (kind === 'flower') {               // slender stem + a coloured bloom
              if (Math.abs(u) < 0.04 && v > -0.04) { on = true; lit = true; r = 40; g = 112; b = 52; }                  // stem
              else { const cu = u, cv = v + 0.28; const dd = Math.sqrt(cu * cu + cv * cv);
                if (dd < 0.2) { on = true; lit = true;
                  if (dd < 0.06) { r = 250; g = 220; b = 70; }                                                          // golden centre
                  else { const P = [[235, 80, 90], [235, 150, 60], [210, 90, 220], [90, 150, 240], [240, 240, 250]][hue]; r = P[0]; g = P[1]; b = P[2]; } } }
            } else if (kind === 'rock') {                 // grey boulder
              const cu = u, cv = v - 0.2; const dd = Math.sqrt(cu * cu + cv * cv * 1.3);
              if (dd < 0.44) { on = true; lit = true; const sh = 0.55 + 0.45 * (1 - dd / 0.44) + 0.07 * Math.sin(u * 16); const g0 = 120 * sh; r = g0; g = g0 + 4; b = g0 + 14; }
            } else if (kind === 'lamp') {                 // post + glowing lantern (the orb lights itself)
              if (Math.abs(u) < 0.05 && v > -0.18) { on = true; lit = true; r = 52; g = 50; b = 60; }                   // post
              else { const cu = u, cv = v + 0.34; const dd = Math.sqrt(cu * cu + cv * cv);
                if (dd < 0.17) { on = true; const gl = 0.7 + 0.3 * Math.sin(tick * 0.12); r = 255 * gl; g = 222 * gl; b = 120 * gl; } }   // emissive orb
            } else if (kind === 'chest') {                 // wooden chest — glowing lock when closed, treasure-glow when open
              const isOpen = !!(s.key && opened.has(s.key));
              if (Math.abs(u) < 0.32 && v > 0.0 && v < 0.46) { on = true; lit = true; const band = (Math.abs(u) > 0.27 || Math.abs(u) < 0.02) ? 0.6 : 1; const sh = 0.65 + 0.35 * (1 - v / 0.46); r = 118 * sh * band; g = 72 * sh * band; b = 32 * sh * band; }   // box body + iron bands
              if (isOpen) {
                if (Math.abs(u) < 0.3 && v > -0.36 && v < -0.08) { on = true; lit = true; r = 55; g = 33; b = 15; }                                                          // lid flung up
                if (Math.abs(u) < 0.28 && v >= -0.08 && v < 0.06) { on = true; const gl = 0.7 + 0.3 * Math.sin(tick * 0.2 + u * 9); r = 255 * gl; g = 220 * gl; b = 120 * gl; }   // treasure glow
              } else {
                if (Math.abs(u) < 0.34 && v > -0.16 && v <= 0.02) { on = true; lit = true; const sh = 0.72; r = 100 * sh; g = 60 * sh; b = 28 * sh; }                          // closed lid
                if (Math.abs(u) < 0.055 && v > 0.0 && v < 0.13) { on = true; const gl = 0.6 + 0.4 * Math.sin(tick * 0.14); r = 255 * gl; g = 200 * gl; b = 80 * gl; }            // glowing lock
              }
            } else {                                       // exit — a swirling vertical portal of energy
              const pu = u / 0.34, pv = (v + 0.05) / 0.55; const rr2 = pu * pu + pv * pv;
              if (rr2 < 1) { on = true;
                const ang = Math.atan2(pv, pu); const swirl = 0.5 + 0.5 * Math.sin(ang * 4 + rr2 * 8 - tick * 0.3 + v * 6);
                const rim = Math.max(0, 1 - Math.abs(1 - rr2) * 6); const core = (1 - rr2) * (1 - rr2); const gl = 0.35 + 0.65 * swirl;
                if (exitLocked()) { r = 200 * gl + 180 * rim + 150 * core; g = 55 * gl + 60 * rim + 40 * core; b = 30 * gl + 40 * rim + 20 * core; }   // locked → smouldering red
                else { r = 40 * gl + 180 * rim + 130 * core; g = 210 * gl + 120 * rim + 150 * core; b = 255 * gl + 200 * rim + 120 * core; } }
            }
            if (!on) continue;
            if (lit) { r *= lfTree; g *= lfTree; b *= lfTree; }
            const [rr, gg, bb] = fogMix(r, g, b, fogT * 0.6);
            const o = (y * W + x) * 4;
            data[o] = rr; data[o + 1] = gg; data[o + 2] = bb; data[o + 3] = 255;
          }
        }
      }

      // 3.5) Lava bubbles + 4) Stalkers — glowing/voxel cubes rising & looming out of the dark
      const eyeH = heightMap ? pz + EYE_BASE + jz : 0.5;
      const env3d: BoxEnv = { px, py, invDet, sin, cos, planeX, planeY, W, H, F, horizon, eye: eyeH, fog: pal.fog, data, depth };
      if (bubbles.length) drawBubbles(env3d);
      if (grassCells.length) drawGrass(env3d, lightAt);
      const eorder = enemies.filter(e => e.hp > 0)
        .map(e => ({ e, d: (e.x - px) ** 2 + (e.y - py) ** 2 })).sort((a, b) => b.d - a.d);
      for (const { e } of eorder) {
        const relX = e.x - px, relY = e.y - py;
        const camY = invDet * (-planeY * relX + planeX * relY);
        if (camY <= 0.05) continue;
        const zfE = heightMap ? floorLvl(Math.floor(e.x), Math.floor(e.y)) * STEP_UNIT : 0;
        drawStalker(env3d, e, zfE, Math.max(lightAt(camY), 0.5));   // self-lit so it looms out of the dark
      }

      bctx.putImageData(img, 0, 0);

      // Blit the low-res scene up to the visible canvas (crisp pixels), with a subtle damage shake.
      const sx = shake > 0.2 ? (((tick * 7) % 3) - 1) * shake : 0;
      const sy = shake > 0.2 ? (((tick * 13) % 3) - 1) * shake : 0;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf, sx, sy, canvas.width, canvas.height);

      // NPC billboards (your character-builder characters) — full-res overlay, feet on their floor,
      // coarsely occluded by walls via a centre depth sample. Drawn smooth (they're detailed sprites).
      if (npcs.length) {
        const S = canvas.height / H;
        const invDet = 1 / (planeX * sin - cos * planeY);
        const eyeH = heightMap ? pz + EYE_BASE + jz : 0.5;
        const ord = npcs.map((nn) => ({ nn, d: (nn.x + 0.5 - px) ** 2 + (nn.y + 0.5 - py) ** 2 })).sort((a, b) => b.d - a.d);
        ctx.imageSmoothingEnabled = true; ctx.textAlign = 'center';
        for (const { nn } of ord) {
          const relX = nn.x + 0.5 - px, relY = nn.y + 0.5 - py;
          const camY = invDet * (-planeY * relX + planeX * relY);
          if (camY <= 0.3) continue;
          const camX = invDet * (sin * relX - cos * relY);
          const scrX = (W / 2) * (1 + camX / camY);
          const zfN = heightMap ? floorLvl(nn.x, nn.y) * STEP_UNIT : 0;
          const groundY = horizon + ((eyeH - zfN) * F) / camY;
          const bx = Math.max(0, Math.min(W - 1, Math.floor(scrX)));
          const by = Math.max(0, Math.min(H - 1, Math.floor(groundY - (F / camY) * 0.4)));
          if (camY > depth[by * W + bx] + 0.3) continue;   // torso behind a wall → hide
          const figScreen = (F / camY) * 1.35 * (nn.sz ?? 1) * S;   // taller NPCs to match the tall player
          const drawH = figScreen / 0.6, drawW = drawH * (npcBuf.width / npcBuf.height);
          renderAppearance(nn.a, tick * 0.5);
          ctx.drawImage(npcBuf, scrX * S - drawW / 2, groundY * S - drawH * 0.84, drawW, drawH);
          const headY = groundY * S - figScreen;
          if (nn.n) { const fs = Math.max(9, Math.round(figScreen * 0.12)); ctx.font = `${fs}px monospace`; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(nn.n, scrX * S + 1, headY + 1); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(nn.n, scrX * S, headY); }
          // speech — when you're close, the NPC talks (cycles its lines)
          const dist = Math.hypot(relX, relY);
          if (nn.lines && nn.lines.length && dist < 2.6) {
            const line = nn.lines[Math.floor(tick / 200) % nn.lines.length];
            if (line) {
              const fs = Math.max(11, Math.round(canvas.height * 0.018));
              ctx.font = `${fs}px monospace`; ctx.textAlign = 'center';
              const tw = ctx.measureText(line).width, padX = 10, bw = tw + padX * 2, bh = fs + 12;
              const bxc = scrX * S, byc = headY - (nn.n ? fs + 8 : 6) - bh;
              ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.rect(bxc - bw / 2, byc, bw, bh); ctx.fill(); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(bxc - 5, byc + bh); ctx.lineTo(bxc + 5, byc + bh); ctx.lineTo(bxc, byc + bh + 7); ctx.closePath(); ctx.fill();   // tail
              ctx.fillStyle = '#fff'; ctx.fillText(line, bxc, byc + fs + 2);
            }
          }
        }
        ctx.textAlign = 'left'; ctx.imageSmoothingEnabled = false;
      }

      if (skyFx) drawWeather(skyFx);

      // Weapon viewmodel — a blade that swings when you attack (combat realms only).
      if (canFight) {
        const cw = canvas.width, ch = canvas.height, swing = atkAnim > 0 ? atkAnim / 10 : 0;
        ctx.save();
        ctx.translate(cw * 0.70, ch - cw * 0.02 + swing * ch * 0.05);
        ctx.rotate(-0.45 + swing * 0.85);
        ctx.fillStyle = '#3a2e20'; ctx.fillRect(-cw * 0.02, 0, cw * 0.04, ch * 0.12);             // hilt
        ctx.fillStyle = '#d7dde6'; ctx.fillRect(-cw * 0.013, -ch * 0.30, cw * 0.026, ch * 0.30);  // blade
        ctx.fillStyle = '#9aa3ad'; ctx.fillRect(-cw * 0.003, -ch * 0.30, cw * 0.006, ch * 0.30);  // edge highlight
        ctx.restore();
      }

      // Hazard / death vignette
      if (hp < 40 || respawn > 0) {
        const a = respawn > 0 ? Math.min(0.85, (70 - respawn) / 30) : (40 - hp) / 100;
        ctx.fillStyle = `rgba(120,0,0,${a})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (exited) { ctx.fillStyle = 'rgba(40,220,255,0.25)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      // underwater — blue murk that deepens as your air runs out
      if (submerged) {
        ctx.fillStyle = `rgba(20,80,150,${0.28 + 0.4 * (1 - breath / 100)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Minimap (top-left)
      drawMinimap();
    };

    const drawMinimap = () => {
      const cell = 5, pad = 10;
      const mw = rows[0].length * cell, mh = rows.length * cell;
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(pad - 2, pad - 2, mw + 4, mh + 4);
      for (let y = 0; y < rows.length; y++)
        for (let x = 0; x < rows[y].length; x++) {
          const c = rows[y][x];
          if (c === '#' || c === '1' || c === '2' || c === '3' || c === '4') ctx.fillStyle = '#6a6a86';
          else if (c === 'L') ctx.fillStyle = '#ff5a1e';
          else if (c === '~') ctx.fillStyle = '#000';
          else if (c === 'E') ctx.fillStyle = '#1ee0ff';
          else if (c === TUNNEL_CHAR) ctx.fillStyle = '#b35cff';
          else if (c === STAIR_UP) ctx.fillStyle = '#9be07a';
          else if (c === STAIR_DOWN) ctx.fillStyle = '#3a4a66';
          else continue;
          ctx.fillRect(pad + x * cell, pad + y * cell, cell, cell);
        }
      // stalkers (red = hunting, dim = wandering)
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        ctx.fillStyle = e.chasing ? '#ff2d2d' : '#a05050';
        ctx.fillRect(pad + e.x * cell - 1.5, pad + e.y * cell - 1.5, 3, 3);
      }
      // player dot + facing
      ctx.fillStyle = '#ffd400';
      ctx.fillRect(pad + px * cell - 1.5, pad + py * cell - 1.5, 3, 3);
      ctx.strokeStyle = '#ffd400'; ctx.beginPath();
      ctx.moveTo(pad + px * cell, pad + py * cell);
      ctx.lineTo(pad + px * cell + Math.cos(dir) * 6, pad + py * cell + Math.sin(dir) * 6);
      ctx.stroke();
      // storey indicator (only for multi-floor realms): which floor you're on, relative to the ground
      if (floors.length > 1) {
        const rel = fi - spawnFloor;
        const label = rel === 0 ? 'GROUND' : rel > 0 ? `FLOOR +${rel}` : `BASEMENT ${rel}`;
        ctx.globalAlpha = 1; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(pad - 2, pad + mh + 4, mw + 4, 12);
        ctx.fillStyle = '#ffd400'; ctx.fillText(label, pad + 2, pad + mh + 13);
      }
      ctx.restore();
    };

    // ── Weather overlay (full-res, drawn over the blitted scene) ─────────────────────────────────
    // Stars are a DISTANT background — only paint them where the sky is actually visible (depth = far),
    // so they don't speckle over walls/ceilings. Rain/snow/embers are foreground, drawn everywhere.
    const skyVisibleAt = (sx: number, sy: number) => {
      const bx = Math.min(RES_W - 1, Math.max(0, Math.floor((sx / canvas.width) * RES_W)));
      const by = Math.min(RES_H - 1, Math.max(0, Math.floor((sy / canvas.height) * RES_H)));
      return depth[by * RES_W + bx] > 1e8;
    };
    const drawWeather = (fx: string) => {
      const w = canvas.width, h = canvas.height, t = tick;
      if (fx === 'rain') {
        ctx.strokeStyle = 'rgba(175,195,215,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < 160; i++) { const xx = ((i * 97 + t * 9) % (w + 40)) - 20; const yy = ((i * 53 + t * 26) % (h + 40)) - 20; ctx.moveTo(xx, yy); ctx.lineTo(xx - 6, yy + 20); }
        ctx.stroke();
      } else if (fx === 'snow') {
        ctx.fillStyle = 'rgba(232,240,247,0.8)';
        for (let i = 0; i < 120; i++) { const xx = ((i * 131 + Math.sin(t * 0.02 + i) * 22) % (w + 20)) - 10; const yy = ((i * 71 + t * 1.6) % (h + 20)) - 10; ctx.fillRect(xx, yy, 2, 2); }
      } else if (fx === 'stars') {
        const pan = (dir / (Math.PI * 2)) * w * 2;
        for (let i = 0; i < 150; i++) { const xx = (((i * 167) - pan) % w + w) % w; const yy = (i * 89) % (h * 0.6); if (!skyVisibleAt(xx, yy)) continue; const tw = 0.5 + 0.5 * Math.sin(t * 0.05 + i); ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.55 * tw})`; ctx.fillRect(xx, yy, 1.6, 1.6); }
      } else if (fx === 'embers') {
        for (let i = 0; i < 90; i++) { const xx = ((i * 149 + Math.sin(t * 0.03 + i) * 30) % w + w) % w; const yy = h - ((i * 53 + t * 2.4) % h); const a = yy / h; ctx.fillStyle = `rgba(255,${110 + 80 * Math.abs(Math.sin(i))},40,${0.55 * a})`; ctx.fillRect(xx, yy, 2, 2); }
      } else if (fx === 'mist') {
        const g = ctx.createLinearGradient(0, h * 0.25, 0, h); g.addColorStop(0, 'rgba(190,195,200,0)'); g.addColorStop(1, 'rgba(190,195,200,0.4)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
    };

    // ── Stacked sim tick (real gravity, jump, walk-under-overhangs) ───────────────────────────────
    const clamp1 = (v: number) => v < -1 ? -1 : v > 1 ? 1 : v;
    const updateStacked = () => {
      tick++;
      if (atkCd > 0) atkCd--;
      if (atkAnim > 0) atkAnim--;
      if (exited) return;
      if (respawn > 0) { respawn--; if (respawn === 0) doRespawn(); return; }

      // intent
      let fwd = 0, strafe = 0, turn = 0;
      const run = keys.has('shift');
      if (keys.has('w') || keys.has('arrowup')) fwd += 1;
      if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
      if (keys.has('q')) strafe -= 1;
      if (keys.has('e')) strafe += 1;
      if (keys.has('a') || keys.has('arrowleft')) turn -= 1;
      if (keys.has('d') || keys.has('arrowright')) turn += 1;
      if (moveStick) { const dx = moveStick.x - moveStick.ox, dy = moveStick.y - moveStick.oy; fwd += clamp1(-dy / 70); strafe += clamp1(dx / 70); }
      if (turnStick) turn += clamp1((turnStick.x - turnStick.ox) / 70);
      dir += turn * TURN;

      // jump
      if ((keys.has(' ') || keys.has('spacebar') || jumpRef.current) && grounded) { vz = JUMP_V; grounded = false; }

      // horizontal move — collide against solid blocks at BODY height only, so you pass freely under
      // a slab/overhang above your head. Slide per-axis.
      const sp = run ? RUN : MOVE;
      const cos = Math.cos(dir), sin = Math.sin(dir);
      let nx = px, ny = py;
      if (fwd) { nx += cos * fwd * sp; ny += sin * fwd * sp; }
      if (strafe) { nx += -sin * strafe * sp; ny += cos * strafe * sp; }
      if (nx !== px || ny !== py) {
        const free = (x: number, y: number) => {
          const pts: [number, number][] = [[x - RADIUS, y], [x + RADIUS, y], [x, y - RADIUS], [x, y + RADIUS]];
          for (const [sx, sy] of pts) if (solidFor(Math.floor(sx), Math.floor(sy), pz)) return false;
          return true;
        };
        if (free(nx, py)) px = nx;
        if (free(px, ny)) py = ny;
        bob += sp;
        const s = Math.floor(bob / 0.9); if (s !== stepAt) { stepAt = s; footstep(); }   // one footfall per stride
      }

      // gravity, stepping & landing (real Z) — Minecraft-style. You auto-step UP a one-level ledge (so
      // raised terrain becomes walkable ramps), must JUMP a full wall to climb it, and take graduated
      // fall damage coming down. `groundZ` = the surface you left, so jumps never inflate a fall.
      const cx = Math.floor(px), cy = Math.floor(py);
      const tops = standTops(cx, cy);
      const highestUnder = (feet: number, tol: number) => { let s = -Infinity; for (const t of tops) if (t <= feet + tol && t > s) s = t; return s; };
      const fallDamage = (drop: number): boolean => {            // drop in world height → true if it killed you
        const storeys = drop / STOREY_H;                         // a one-wall (one-storey) drop is free
        if (storeys < 1.6) return false;
        hp -= Math.round((storeys - 1.5) * 34);                  // ~2 storeys: a scratch · ~3: hurts · ~4.5: lethal
        shake = Math.min(4, shake + 2); beep(120, 0.2, 'sawtooth', 0.06);
        if (hp <= 0) { hp = 0; respawn = 70; beep(150, 0.5, 'sawtooth', 0.07); return true; }
        return false;
      };
      if (grounded && vz <= 0) {
        // walking: stick to the ground, auto-stepping up/down a ledge no taller than one level
        const s = highestUnder(pz, STEP_UP);
        if (s > -Infinity && s >= pz - STEP_UP) { pz = s; groundZ = s; }
        else { grounded = false; vz -= GRAV; pz += vz; }            // walked off a ledge taller than a step → fall
      } else {
        // airborne: integrate gravity (capped at a terminal velocity so a long fall can't tunnel THROUGH
        // thin floors), bonk on ceilings, then SWEEP for the highest surface we crossed this tick.
        const pzPrev = pz;
        vz = Math.max(-0.6, vz - GRAV);
        pz += vz;
        if (vz > 0) { const head = ceilAbove(cx, cy, pz + 0.4); if (pz + 1.7 > head) { pz = head - 1.7; vz = 0; } }   // head-bonk (Minecraft-tall)
        let s = -Infinity;
        for (const t of tops) if (t <= pzPrev + 0.06 && pz <= t && t > s) s = t;   // were above it, have now reached it
        if (s > -Infinity) { if (vz < 0) fallDamage(groundZ - s); pz = s; vz = 0; grounded = true; groundZ = s; }
        else grounded = false;
      }
      if (!grounded && pz < -0.8 && highestUnder(pz, 0.06) === -Infinity) {   // nothing left to land on below → reset, scaled by the fall
        if (!fallDamage(groundZ - pz)) { px = spawn.x; py = spawn.y; dir = ((level.spawnDir ?? 0) * Math.PI) / 180; pz = baseZ(spawnFloor); vz = 0; grounded = true; groundZ = pz; shake = Math.min(4, shake + 2); beep(200, 0.18, 'sine', 0.05); }
      }
      // smooth the eye for stair lifts/landings, but keep jumps crisp
      if (grounded) viewZ += (pz - viewZ) * 0.4; else viewZ = pz;

      // standing-tile effects on the layer under your feet
      const pk = layerAt(pz);
      const here = cellL(pk, cx, cy);
      if (here === TUNNEL_CHAR) {                 // tunnel — warp to the next tunnel on this layer
        if (!tpLock) {
          const g = grids[pk]; const ts: { x: number; y: number }[] = [];
          for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === TUNNEL_CHAR) ts.push({ x: x + 0.5, y: y + 0.5 });
          if (ts.length > 1) {
            const idx = ts.findIndex(t => Math.floor(t.x) === cx && Math.floor(t.y) === cy);
            const dst = ts[(idx + 1) % ts.length]; px = dst.x; py = dst.y; tpLock = true; shake = Math.min(4, shake + 1.2);
            beep(520, 0.1, 'sine', 0.05); beep(780, 0.12, 'sine', 0.045); beep(1180, 0.14, 'sine', 0.04);
          }
        }
      } else if (here === STAIR_UP || here === STAIR_DOWN) {   // stairs — a quick lift up/down one storey
        if (!tpLock) {
          const dest = pk + (here === STAIR_UP ? 1 : -1);
          if (dest >= 0 && dest < nLayers) { pz = baseZ(dest); vz = 0; grounded = true; tpLock = true; beep(here === STAIR_UP ? 560 : 360, 0.12, 'triangle', 0.05); beep(here === STAIR_UP ? 840 : 240, 0.14, 'triangle', 0.045); }
        }
      } else { tpLock = false; }
      if (here === '~') { beep(180, 0.5, 'sawtooth', 0.06); hp = 0; respawn = 70; }   // pit
      else if (here === 'L') { hp -= LAVA_DPS; shake = Math.min(4, shake + 0.8); if (tick % 14 === 0) beep(90, 0.08, 'sawtooth', 0.04); if (hp <= 0) { hp = 0; respawn = 70; beep(150, 0.5, 'sawtooth', 0.06); } }

      // swimming
      submerged = here === 'w';
      if (submerged) { breath -= 0.38; if (tick % 50 === 0) beep(420, 0.12, 'sine', 0.025); if (breath <= 0) { breath = 0; hp -= 0.7; if (tick % 10 === 0) beep(120, 0.2, 'sawtooth', 0.05); if (hp <= 0) { hp = 0; respawn = 70; } } }
      else if (breath < 100) breath = Math.min(100, breath + 2.2);

      if (shake > 0) shake *= 0.85;
      if (panic > 0) panic *= 0.992;   // terror ebbs slowly once you get away

      // crystal pickups — must be on roughly the same level as the crystal
      for (const s of allSprites) {
        if (s.kind !== 'crystal' || !s.key || grabbed.has(s.key)) continue;
        if (Math.abs(s.x - px) < 0.45 && Math.abs(s.y - py) < 0.45 && Math.abs(baseZ(s.k) - pz) < 0.7) {
          grabbed.add(s.key); onRewardRef.current?.(5); beep(880, 0.12, 'triangle', 0.05); beep(1320, 0.1, 'triangle', 0.04);
        }
      }
      // chest opening — same-storey step-on; opening every chest unlocks the exit
      for (const s of allSprites) {
        if (s.kind !== 'chest' || !s.key || opened.has(s.key)) continue;
        if (Math.abs(s.x - px) < 0.5 && Math.abs(s.y - py) < 0.5 && Math.abs(baseZ(s.k) - pz) < 0.7) { opened.add(s.key); onRewardRef.current?.(10); chestOpen(); if (opened.size === totalChests) { gateFanfare(); showToast('⚿ The gate is open', 'good'); } }
      }
      if (here === 'E') {
        if (exitLocked()) { if (tick % 22 === 0) denied(); if (tick - lastDeniedTick > 80) { lastDeniedTick = tick; showToast(`▤ Gate locked — open all chests (${opened.size}/${totalChests})`, 'bad'); } }
        else { exited = true; stopHunt(); beep(660, 0.15, 'sine', 0.06); beep(990, 0.2, 'sine', 0.05); setTimeout(() => onExitRef.current?.(), 220); }
      }

      updateEnemies();
      stepBubbles();
      musicStep();
      pushHud();
    };

    // ── Stacked renderer — every layer drawn at its true height at once (overhangs, holes, depth) ──
    const drawStacked = () => {
      const W = RES_W, H = RES_H;
      const cos = Math.cos(dir), sin = Math.sin(dir);
      const F = H / FOV;                       // focal length — apparent size of everything scales with this
      const planeLen = (W / H) * 0.5 * FOV;    // widen the lens by FOV; keeps pixels square with focal F
      const planeX = -sin * planeLen, planeY = cos * planeLen;
      const horizon = (H >> 1) + Math.round(pitch);
      const eye = viewZ + EYE_BASE;
      const fog = pal.fog;
      const topZ = baseZ(nLayers - 1) + STOREY_H + CEIL_GAP;   // sky/ceiling cap above the whole stack

      const fogMix = (r: number, g: number, b: number, t: number): [number, number, number] => { t = t < 0 ? 0 : t > 1 ? 1 : t; return [r + (fog[0] - r) * t, g + (fog[1] - g) * t, b + (fog[2] - b) * t]; };
      const flick = lighting && lighting.flicker ? 1 - lighting.flicker * (0.5 + 0.5 * Math.sin(tick * 0.7) * Math.sin(tick * 0.21 + 1.3)) : 1;
      const lightAt = (d: number) => { if (!lighting) return 1; const f = 1 - d / lighting.radius; return (f < lighting.ambient ? lighting.ambient : f) * flick; };
      const skyColAt = (y: number): [number, number, number] => { const t = horizon <= 0 ? 1 : Math.max(0, Math.min(1, y / horizon)); return [sky![0][0] + (sky![1][0] - sky![0][0]) * t, sky![0][1] + (sky![1][1] - sky![0][1]) * t, sky![0][2] + (sky![1][2] - sky![0][2]) * t]; };
      const fogTd = (d: number) => 1 - 1 / (1 + d * d * 0.012);
      const projF = (z: number, d: number) => horizon + ((eye - z) * F) / d;

      // surface colour for a floor/slab cell at world (fx,fy), mip-sampled by lod → [r,g,b,emissive]
      const floorColor = (c: string, fx: number, fy: number, lod = 0): [number, number, number, boolean] => {
        if (c === 'L') { const [r, g, b] = moltenLava(fx, fy, tick); return [r, g, b, true]; }
        if (c === 'w') { const [r, g, b] = pixelWater(fx, fy, tick); return [r, g, b, true]; }
        if (c === '~') return [4, 3, 8, true];
        if (c === 'E') { const [pr, pg, pb, pa] = portalFloor(fx, fy, tick, exitLocked()); const bs = sampleTex(TEXES.dirt, fx, fy, lod); return [pr + pal.floor[0] * bs * (1 - pa), pg + pal.floor[1] * bs * (1 - pa), pb + pal.floor[2] * bs * (1 - pa), true]; }
        if (c === TUNNEL_CHAR) { const sw = 0.55 + 0.45 * Math.sin((fx + fy) * 5 - tick * 0.3); return [150 * sw + 40, 40 * sw, 210 * sw + 40, true]; }
        if (c === STAIR_UP) { const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 1 : 0.7; return [180 * st, 200 * st, 150 * st, true]; }
        if (c === STAIR_DOWN) { const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 0.5 : 0.28; return [40 * st, 44 * st, 60 * st, true]; }
        if (c === 'g' || c === 'b' || c === 'f') { const b = sampleTex(TEXES.grass, fx, fy, lod); return [46 * b, 120 * b, 48 * b, false]; }
        if (c === 'p') { const b = sampleTex(TEXES.pave, fx, fy, lod); return [150 * b, 150 * b, 162 * b, false]; }
        const b = sampleTex(TEXES.dirt, fx, fy, lod); return [pal.floor[0] * b, pal.floor[1] * b, pal.floor[2] * b, false];
      };

      depth.fill(1e9);
      data.fill(0);

      // draw a horizontal surface (floor top or block roof) at height z over the depth slice [dA,dB]
      const drawHoriz = (x: number, c: string, z: number, dA: number, dB: number, rdx: number, rdy: number, roof: boolean) => {
        const ya = Math.floor(projF(z, dB)), yb = Math.ceil(projF(z, dA));   // far edge → near edge
        const y0 = Math.max(0, Math.min(ya, yb)), y1 = Math.min(H, Math.max(ya, yb));
        for (let y = y0; y < y1; y++) {
          const pp = y - horizon; if (pp <= 0) continue;            // floor is below the horizon
          // NOTE: no distance-band cull here — the y-range already bounds this cell's screen span, and a
          // hard [dA,dB] reject skipped boundary pixels, opening the flickering 1px seams. Depth-test only.
          const d = ((eye - z) * F) / pp;
          if (d >= depth[y * W + x]) continue;
          const fx = px + d * rdx, fy = py + d * rdy;
          let R: number, G: number, B: number;
          if (roof) { const base = pal.wall[c] ?? pal.wall['#']; const b = sampleTex(wallTexOf(c), fx, fy, lodOf(d)) * 0.88; const ft = fogTd(d), lf = lightAt(d); [R, G, B] = fogMix(base[0] * b, base[1] * b, base[2] * b, ft); R *= lf; G *= lf; B *= lf; }
          else { const [r, g, b, emis] = floorColor(c, fx, fy, lodOf(d)); if (emis) { R = r; G = g; B = b; } else { const ft = fogTd(d), lf = lightAt(d); [R, G, B] = fogMix(r, g, b, ft); R *= lf; G *= lf; B *= lf; } }
          const o = (y * W + x) * 4; data[o] = R; data[o + 1] = G; data[o + 2] = B; data[o + 3] = 255; depth[y * W + x] = d;
        }
      };
      // draw the UNDERSIDE of a slab/block above your eye over [dA,dB] — the ceiling you walk under
      const drawUnder = (x: number, c: string, z: number, dA: number, dB: number, rdx: number, rdy: number) => {
        const ya = Math.floor(projF(z, dA)), yb = Math.ceil(projF(z, dB));   // near edge → far edge (above horizon)
        const y0 = Math.max(0, Math.min(ya, yb)), y1 = Math.min(H, Math.max(ya, yb));
        for (let y = y0; y < y1; y++) {
          const pp = y - horizon; if (pp >= 0) continue;            // underside is above the horizon
          const d = ((eye - z) * F) / pp;                           // no band cull (see drawHoriz) — closes seams
          if (d >= depth[y * W + x]) continue;
          const fx = px + d * rdx, fy = py + d * rdy;
          const [r, g, b] = floorColor(c, fx, fy, lodOf(d)); const ft = fogTd(d), lf = lightAt(d);
          const [R, G, B] = fogMix(r * 0.45, g * 0.45, b * 0.45, ft);   // a shadowed underside
          const o = (y * W + x) * 4; data[o] = R * lf; data[o + 1] = G * lf; data[o + 2] = B * lf; data[o + 3] = 255; depth[y * W + x] = d;
        }
      };

      // 1) Per-column voxel march — for each cell along the ray, draw every layer's faces.
      for (let x = 0; x < W; x++) {
        const camX = (2 * x) / W - 1;
        const rdx = cos + planeX * camX, rdy = sin + planeY * camX;
        let mapX = Math.floor(px), mapY = Math.floor(py);
        const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
        let sideX: number, sideY: number, stepX: number, stepY: number;
        if (rdx < 0) { stepX = -1; sideX = (px - mapX) * ddx; } else { stepX = 1; sideX = (mapX + 1 - px) * ddx; }
        if (rdy < 0) { stepY = -1; sideY = (py - mapY) * ddy; } else { stepY = 1; sideY = (mapY + 1 - py) * ddy; }
        let dEnter = 0.0001, entrySide = 0;
        for (let guard = 0; guard < 80; guard++) {
          let dExit = sideX < sideY ? sideX : sideY;
          if (dExit < dEnter + 0.0001) dExit = dEnter + 0.0001;
          for (let k = 0; k < nLayers; k++) {
            const c = cellL(k, mapX, mapY);
            if (isAir(c)) continue;
            if (isWall(c)) {
              const zb = baseZ(k), zt = zb + STOREY_H;
              // near vertical face — the wall you see/bump (depth = entry distance)
              const wTopF = projF(zt, dEnter), wBotF = projF(zb, dEnter), span = Math.max(1, wBotF - wTopF);
              const base = pal.wall[c] ?? pal.wall['#'];
              const wxv = entrySide === 0 ? py + dEnter * rdy : px + dEnter * rdx, wxf = wxv - Math.floor(wxv);
              const sd = (entrySide === 1 ? 0.6 : 1) * lightAt(dEnter), ft = fogTd(dEnter);   // stronger N/S shading
              const wt = Math.max(0, Math.floor(wTopF)), wb = Math.min(H, Math.ceil(wBotF));
              const tex = wallTexOf(c), lod = lodOf(dEnter);   // one texture tile over this block-tall face
              const edgeAO = 0.88 + 0.12 * (1 - Math.abs(wxf - 0.5) * 2);   // fake AO toward block edges
              for (let y = wt; y < wb; y++) {
                if (dEnter >= depth[y * W + x]) continue;
                const ty = (y - wTopF) / span;
                const b = sampleTex(tex, wxf, ty, lod);       // real (procedural) block texture
                const baseAO = 0.66 + 0.34 * Math.min(1, (1 - ty) * 3);   // contact shadow at each block's base
                const shade = sd * b * baseAO * edgeAO;
                const [r, g, bl] = fogMix(base[0] * shade, base[1] * shade, base[2] * shade, ft);
                const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255; depth[y * W + x] = dEnter;
              }
              if (zt < eye) drawHoriz(x, c, zt, dEnter, dExit, rdx, rdy, true);   // walk on its roof
              if (zb > eye) drawUnder(x, c, zb, dEnter, dExit, rdx, rdy);          // its underside (rare)
            } else {
              const z = slabZ(k, mapX, mapY);                                      // raised terrain lifts the slab
              const zb = baseZ(k);
              if (z > zb + 0.02) {                                                 // SOLID cliff face — raised ground is a filled hill, not a floating shelf
                const fTopF = projF(z, dEnter), fBotF = projF(zb, dEnter);
                const y0 = Math.max(0, Math.floor(fTopF)), y1 = Math.min(H, Math.ceil(fBotF));
                const [cr0, cg0, cb0] = floorColor(c, px + dEnter * rdx, py + dEnter * rdy, lodOf(dEnter));
                const sd = (entrySide === 1 ? 0.6 : 0.82) * lightAt(dEnter), ftf = fogTd(dEnter);
                for (let y = y0; y < y1; y++) { if (dEnter >= depth[y * W + x]) continue; const [r, g, bl] = fogMix(cr0 * sd, cg0 * sd, cb0 * sd, ftf); const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255; depth[y * W + x] = dEnter; }
              }
              if (z < eye) drawHoriz(x, c, z, dEnter, dExit, rdx, rdy, false);     // top of the raised ground (walk on it)
              else if (z > eye) drawUnder(x, c, z, dEnter, dExit, rdx, rdy);       // underside, if it's above your eye
            }
          }
          if (sideX < sideY) { sideX += ddx; mapX += stepX; entrySide = 0; } else { sideY += ddy; mapY += stepY; entrySide = 1; }
          dEnter = dExit;
          if (dEnter > 44) break;
        }

        // 2) Fill anything still open (sky if the realm has one, else the flat ceiling cap).
        for (let y = 0; y < H; y++) {
          if (depth[y * W + x] < 1e8) continue;
          const o = (y * W + x) * 4;
          if (sky) { const [sr, sg, sb] = skyColAt(y); data[o] = sr; data[o + 1] = sg; data[o + 2] = sb; data[o + 3] = 255; }
          else { const pp = horizon - y; const d = pp > 0 ? ((topZ - eye) * F) / pp : 40; const lf = lightAt(d); const [cr, cg, cb] = fogMix(pal.ceil[0], pal.ceil[1], pal.ceil[2], fogTd(d) * 0.7); data[o] = cr * lf; data[o + 1] = cg * lf; data[o + 2] = cb * lf; data[o + 3] = 255; depth[y * W + x] = d; }
        }
      }

      // 3) Sprites (crystals/exit/props) — billboard, anchored to their layer's slab, depth-tested.
      const invDet = 1 / (planeX * sin - cos * planeY);
      const order = allSprites
        .map(s => ({ s, d: (s.x - px) ** 2 + (s.y - py) ** 2 }))
        .filter(o => !(o.s.kind === 'crystal' && o.s.key && grabbed.has(o.s.key)))
        .sort((a, b) => b.d - a.d);
      for (const { s } of order) {
        const kind: string = s.kind;
        const relX = s.x - px, relY = s.y - py;
        const camY = invDet * (-planeY * relX + planeX * relY);
        if (camY <= 0.1) continue;
        const camX = invDet * (sin * relX - cos * relY);
        const screenX = Math.floor((W / 2) * (1 + camX / camY));
        const sizeBase = Math.abs(Math.floor(F / camY));
        const zf = baseZ(s.k);
        const groundY = horizon + ((eye - zf) * F) / camY;        // where this layer's floor meets the sprite
        // Crystal — a floating, bobbing voxel gem (glowing cyan cubes) instead of a flat billboard
        if (kind === 'crystal') {
          const env: BoxEnv = { px, py, invDet, sin, cos, planeX, planeY, W, H, F, horizon, eye, fog: pal.fog, data, depth };
          const fb = zf + 0.42 + Math.sin(tick * 0.09 + s.x * 3) * 0.06;
          drawBox3D(env, s.x, s.y, 0.1, 0.1, fb, fb + 0.12, 150, 240, 255, 1, true);
          drawBox3D(env, s.x, s.y, 0.26, 0.26, fb + 0.1, fb + 0.26, 110, 225, 255, 1, true);
          drawBox3D(env, s.x, s.y, 0.12, 0.12, fb + 0.24, fb + 0.38, 190, 250, 255, 1, true);
          continue;
        }
        // Exit — a voxel rock DOOR with a swirling pixel-gradient panel, facing its chosen direction
        if (kind === 'exit') {
          const env: BoxEnv = { px, py, invDet, sin, cos, planeX, planeY, W, H, F, horizon, eye, fog: pal.fog, data, depth };
          const gg = grids[s.k]; const gx = Math.floor(s.x), gy = Math.floor(s.y);
          const auto = !isWall(cellAt(gg, gx + 1, gy)) ? 0 : !isWall(cellAt(gg, gx, gy + 1)) ? 90 : !isWall(cellAt(gg, gx - 1, gy)) ? 180 : 270;
          drawExitDoor(env, s.x, s.y, zf, level.exitDir ?? auto, exitLocked(), Math.max(lightAt(camY), 0.6));
          continue;
        }
        // Voxel props — real depth-tested cubes (walk around them), not billboards
        const isVox = kind === 'tree' || kind === 'chest' || kind === 'rock' || kind === 'bush' || kind === 'lamp' || kind === 'flower';
        if (isVox) {
          const env: BoxEnv = { px, py, invDet, sin, cos, planeX, planeY, W, H, F, horizon, eye, fog: pal.fog, data, depth };
          const light = lightAt(camY);
          const boxes = kind === 'tree' ? TREE_BOXES : kind === 'rock' ? ROCK_BOXES : kind === 'bush' ? BUSH_BOXES : kind === 'lamp' ? LAMP_BOXES
            : kind === 'flower' ? flowerBoxes((Math.floor(s.x) * 7 + Math.floor(s.y) * 13) % 5) : chestBoxes(!!(s.key && opened.has(s.key)));
          for (const bx of boxes) drawBox3D(env, s.x + bx.dx, s.y + bx.dy, bx.w, bx.dep, zf + bx.z0, zf + bx.z1, bx.r, bx.g, bx.b, bx.glow ? Math.max(light, bx.glow) : light, !!bx.glow);
          continue;
        }
        // sizes bumped for the tall-player world (walls are ~2 blocks) so props/exit read proportional, not tiny
        const szMul = kind === 'tree' ? 2.4 : kind === 'lamp' ? 1.8 : kind === 'rock' ? 1.15 : kind === 'bush' ? 1.0 : kind === 'flower' ? 0.62 : kind === 'exit' ? 1.8 : kind === 'chest' ? 0.85 : 0.9;
        const sz = Math.floor(sizeBase * szMul), half = sz >> 1;
        const isGround = kind !== 'crystal';
        const vCenter = isGround ? Math.round(groundY) - half : Math.round(groundY) - Math.floor(sizeBase * 0.5) - Math.floor(Math.sin(tick * 0.08) * sizeBase * 0.04);
        const lfTree = lightAt(camY);
        const hue = (Math.floor(s.x) * 7 + Math.floor(s.y) * 13) % 5;
        const sx0 = Math.max(0, screenX - half), sx1 = Math.min(W, screenX + half);
        const sy0 = Math.max(0, vCenter - half), sy1 = Math.min(H, vCenter + half + 1);
        const fogT = 1 - 1 / (1 + camY * camY * 0.012);
        for (let x = sx0; x < sx1; x++) {
          const u = (x - (screenX - half)) / sz - 0.5;
          for (let y = sy0; y < sy1; y++) {
            if (camY >= depth[y * W + x]) continue;
            const v = (y - (vCenter - half)) / sz - 0.5;
            let on = false, r = 0, g = 0, b = 0, lit = false;
            if (kind === 'crystal') { const dd = Math.abs(u) + Math.abs(v); if (dd < 0.42) { on = true; const gl = 1 - dd / 0.42; r = 120 + 135 * gl; g = 230; b = 255; } }
            else if (kind === 'tree') { if (v > 0.12 && Math.abs(u) < 0.07) { on = true; lit = true; r = 96; g = 64; b = 36; } else { const cu = u, cv = v + 0.18; const dd = Math.sqrt(cu * cu + cv * cv * 1.1); if (dd < 0.4) { on = true; lit = true; const sh = 0.7 + 0.3 * Math.sin(u * 9 + v * 9 + tick * 0.05); r = 28 * sh; g = (95 + 40 * (1 - dd / 0.4)) * sh; b = 38 * sh; } } }
            else if (kind === 'bush') { const cu = u, cv = v - 0.16; const dd = Math.sqrt(cu * cu * 1.15 + cv * cv); if (dd < 0.42) { on = true; lit = true; const sh = 0.7 + 0.3 * Math.sin(u * 12 + v * 10 + tick * 0.04); r = 30 * sh; g = (88 + 46 * (1 - dd / 0.42)) * sh; b = 44 * sh; } }
            else if (kind === 'flower') { if (Math.abs(u) < 0.04 && v > -0.04) { on = true; lit = true; r = 40; g = 112; b = 52; } else { const cu = u, cv = v + 0.28; const dd = Math.sqrt(cu * cu + cv * cv); if (dd < 0.2) { on = true; lit = true; if (dd < 0.06) { r = 250; g = 220; b = 70; } else { const P = [[235, 80, 90], [235, 150, 60], [210, 90, 220], [90, 150, 240], [240, 240, 250]][hue]; r = P[0]; g = P[1]; b = P[2]; } } } }
            else if (kind === 'rock') { const cu = u, cv = v - 0.2; const dd = Math.sqrt(cu * cu + cv * cv * 1.3); if (dd < 0.44) { on = true; lit = true; const sh = 0.55 + 0.45 * (1 - dd / 0.44) + 0.07 * Math.sin(u * 16); const g0 = 120 * sh; r = g0; g = g0 + 4; b = g0 + 14; } }
            else if (kind === 'lamp') { if (Math.abs(u) < 0.05 && v > -0.18) { on = true; lit = true; r = 52; g = 50; b = 60; } else { const cu = u, cv = v + 0.34; const dd = Math.sqrt(cu * cu + cv * cv); if (dd < 0.17) { on = true; const gl = 0.7 + 0.3 * Math.sin(tick * 0.12); r = 255 * gl; g = 222 * gl; b = 120 * gl; } } }
            else if (kind === 'chest') {                   // wooden chest — glowing lock when closed, treasure-glow when open
              const isOpen = !!(s.key && opened.has(s.key));
              if (Math.abs(u) < 0.32 && v > 0.0 && v < 0.46) { on = true; lit = true; const band = (Math.abs(u) > 0.27 || Math.abs(u) < 0.02) ? 0.6 : 1; const sh = 0.65 + 0.35 * (1 - v / 0.46); r = 118 * sh * band; g = 72 * sh * band; b = 32 * sh * band; }
              if (isOpen) {
                if (Math.abs(u) < 0.3 && v > -0.36 && v < -0.08) { on = true; lit = true; r = 55; g = 33; b = 15; }
                if (Math.abs(u) < 0.28 && v >= -0.08 && v < 0.06) { on = true; const gl = 0.7 + 0.3 * Math.sin(tick * 0.2 + u * 9); r = 255 * gl; g = 220 * gl; b = 120 * gl; }
              } else {
                if (Math.abs(u) < 0.34 && v > -0.16 && v <= 0.02) { on = true; lit = true; const sh = 0.72; r = 100 * sh; g = 60 * sh; b = 28 * sh; }
                if (Math.abs(u) < 0.055 && v > 0.0 && v < 0.13) { on = true; const gl = 0.6 + 0.4 * Math.sin(tick * 0.14); r = 255 * gl; g = 200 * gl; b = 80 * gl; }
              }
            }
            else { const pu = u / 0.34, pv = (v + 0.05) / 0.55; const rr2 = pu * pu + pv * pv;
              if (rr2 < 1) { on = true; const ang = Math.atan2(pv, pu); const swirl = 0.5 + 0.5 * Math.sin(ang * 4 + rr2 * 8 - tick * 0.3 + v * 6);
                const rim = Math.max(0, 1 - Math.abs(1 - rr2) * 6); const core = (1 - rr2) * (1 - rr2); const gl = 0.35 + 0.65 * swirl;
                if (exitLocked()) { r = 200 * gl + 180 * rim + 150 * core; g = 55 * gl + 60 * rim + 40 * core; b = 30 * gl + 40 * rim + 20 * core; }   // locked → smouldering red
                else { r = 40 * gl + 180 * rim + 130 * core; g = 210 * gl + 120 * rim + 150 * core; b = 255 * gl + 200 * rim + 120 * core; } } }
            if (!on) continue;
            if (lit) { r *= lfTree; g *= lfTree; b *= lfTree; }
            const [rr, gg, bb] = fogMix(r, g, b, fogT * 0.6);
            const o = (y * W + x) * 4; data[o] = rr; data[o + 1] = gg; data[o + 2] = bb; data[o + 3] = 255;
          }
        }
      }

      // 3.5) Lava bubbles + 4) Stalkers — glowing/voxel cubes on their own layer, depth-tested
      const env3d: BoxEnv = { px, py, invDet, sin, cos, planeX, planeY, W, H, F, horizon, eye, fog: pal.fog, data, depth };
      if (bubbles.length) drawBubbles(env3d);
      if (grassCells.length) drawGrass(env3d, lightAt);
      const eorder = enemies.filter(e => e.hp > 0).map(e => ({ e, d: (e.x - px) ** 2 + (e.y - py) ** 2 })).sort((a, b) => b.d - a.d);
      for (const { e } of eorder) {
        const relX = e.x - px, relY = e.y - py;
        const camY = invDet * (-planeY * relX + planeX * relY);
        if (camY <= 0.05) continue;
        drawStalker(env3d, e, baseZ(e.k ?? 0), Math.max(lightAt(camY), 0.5));
      }

      bctx.putImageData(img, 0, 0);
      const shx = shake > 0.2 ? (((tick * 7) % 3) - 1) * shake : 0;
      const shy = shake > 0.2 ? (((tick * 13) % 3) - 1) * shake : 0;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf, shx, shy, canvas.width, canvas.height);

      // 5) NPC billboards (full-res overlay) — feet on their layer's floor.
      if (allNpcs.length) {
        const S = canvas.height / H;
        const ord = allNpcs.map(nn => ({ nn, d: (nn.x + 0.5 - px) ** 2 + (nn.y + 0.5 - py) ** 2 })).sort((a, b) => b.d - a.d);
        ctx.imageSmoothingEnabled = true; ctx.textAlign = 'center';
        for (const { nn } of ord) {
          const relX = nn.x + 0.5 - px, relY = nn.y + 0.5 - py;
          const camY = invDet * (-planeY * relX + planeX * relY);
          if (camY <= 0.3) continue;
          const camX = invDet * (sin * relX - cos * relY);
          const scrX = (W / 2) * (1 + camX / camY);
          const groundY = horizon + ((eye - baseZ(nn.k)) * F) / camY;
          const bx = Math.max(0, Math.min(W - 1, Math.floor(scrX))), by = Math.max(0, Math.min(H - 1, Math.floor(groundY - (F / camY) * 0.4)));
          if (camY > depth[by * W + bx] + 0.3) continue;
          const figScreen = (F / camY) * 1.35 * (nn.sz ?? 1) * S, drawH = figScreen / 0.6, drawW = drawH * (npcBuf.width / npcBuf.height);   // taller NPCs to match the tall player
          renderAppearance(nn.a, tick * 0.5);
          ctx.drawImage(npcBuf, scrX * S - drawW / 2, groundY * S - drawH * 0.84, drawW, drawH);
          const headY = groundY * S - figScreen;
          if (nn.n) { const fs = Math.max(9, Math.round(figScreen * 0.12)); ctx.font = `${fs}px monospace`; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(nn.n, scrX * S + 1, headY + 1); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(nn.n, scrX * S, headY); }
          const dist = Math.hypot(relX, relY);
          if (nn.lines && nn.lines.length && dist < 2.6) {
            const line = nn.lines[Math.floor(tick / 200) % nn.lines.length];
            if (line) {
              const fs = Math.max(11, Math.round(canvas.height * 0.018)); ctx.font = `${fs}px monospace`; ctx.textAlign = 'center';
              const tw = ctx.measureText(line).width, bw = tw + 20, bh = fs + 12, bxc = scrX * S, byc = headY - (nn.n ? fs + 8 : 6) - bh;
              ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.rect(bxc - bw / 2, byc, bw, bh); ctx.fill(); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(bxc - 5, byc + bh); ctx.lineTo(bxc + 5, byc + bh); ctx.lineTo(bxc, byc + bh + 7); ctx.closePath(); ctx.fill();
              ctx.fillStyle = '#fff'; ctx.fillText(line, bxc, byc + fs + 2);
            }
          }
        }
        ctx.textAlign = 'left'; ctx.imageSmoothingEnabled = false;
      }

      if (skyFx) drawWeather(skyFx);
      if (canFight) {
        const cw = canvas.width, ch = canvas.height, swing = atkAnim > 0 ? atkAnim / 10 : 0;
        ctx.save(); ctx.translate(cw * 0.70, ch - cw * 0.02 + swing * ch * 0.05); ctx.rotate(-0.45 + swing * 0.85);
        ctx.fillStyle = '#3a2e20'; ctx.fillRect(-cw * 0.02, 0, cw * 0.04, ch * 0.12);
        ctx.fillStyle = '#d7dde6'; ctx.fillRect(-cw * 0.013, -ch * 0.30, cw * 0.026, ch * 0.30);
        ctx.fillStyle = '#9aa3ad'; ctx.fillRect(-cw * 0.003, -ch * 0.30, cw * 0.006, ch * 0.30); ctx.restore();
      }
      if (hp < 40 || respawn > 0) { const a = respawn > 0 ? Math.min(0.85, (70 - respawn) / 30) : (40 - hp) / 100; ctx.fillStyle = `rgba(120,0,0,${a})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      if (exited) { ctx.fillStyle = 'rgba(40,220,255,0.25)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      if (submerged) { ctx.fillStyle = `rgba(20,80,150,${0.28 + 0.4 * (1 - breath / 100)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }

      drawMinimapStacked();
    };

    // Minimap for stacked realms — shows the layer you're standing on + a storey label.
    const drawMinimapStacked = () => {
      const pk = layerAt(pz), g = grids[pk], cell = 5, pad = 10;
      const mw = g[0].length * cell, mh = g.length * cell;
      ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(pad - 2, pad - 2, mw + 4, mh + 4);
      for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
        const c = g[y][x];
        if (c === '#' || c === '1' || c === '2' || c === '3' || c === '4') ctx.fillStyle = '#6a6a86';
        else if (c === 'L') ctx.fillStyle = '#ff5a1e';
        else if (c === '~') ctx.fillStyle = '#000';
        else if (c === 'E') ctx.fillStyle = '#1ee0ff';
        else if (c === TUNNEL_CHAR) ctx.fillStyle = '#b35cff';
        else if (c === STAIR_UP) ctx.fillStyle = '#9be07a';
        else if (c === STAIR_DOWN) ctx.fillStyle = '#3a4a66';
        else if (isAir(c)) { continue; }
        else continue;
        ctx.fillRect(pad + x * cell, pad + y * cell, cell, cell);
      }
      for (const e of enemies) { if (e.hp <= 0 || (e.k ?? 0) !== pk) continue; ctx.fillStyle = e.chasing ? '#ff2d2d' : '#a05050'; ctx.fillRect(pad + e.x * cell - 1.5, pad + e.y * cell - 1.5, 3, 3); }
      ctx.fillStyle = '#ffd400'; ctx.fillRect(pad + px * cell - 1.5, pad + py * cell - 1.5, 3, 3);
      ctx.strokeStyle = '#ffd400'; ctx.beginPath(); ctx.moveTo(pad + px * cell, pad + py * cell); ctx.lineTo(pad + px * cell + Math.cos(dir) * 6, pad + py * cell + Math.sin(dir) * 6); ctx.stroke();
      const rel = pk - spawnFloor, label = rel === 0 ? 'GROUND' : rel > 0 ? `FLOOR +${rel}` : `BASEMENT ${rel}`;
      ctx.globalAlpha = 1; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(pad - 2, pad + mh + 4, mw + 4, 12);
      ctx.fillStyle = '#ffd400'; ctx.fillText(label, pad + 2, pad + mh + 13);
      ctx.restore();
    };

    // ── Loop (fixed 60Hz accumulator) ───────────────────────────────────────────────────────────
    let raf = 0, last = 0, acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (last === 0) last = now;
      let dt = now - last; last = now;
      if (dt > 250) dt = 250;
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) { (stacked ? updateStacked : update)(); acc -= STEP; n++; }
      (stacked ? drawStacked : draw)();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(toastTimer);
      ro.disconnect();
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('pointerdown', td);
      window.removeEventListener('pointermove', tm);
      window.removeEventListener('pointerup', tu);
      window.removeEventListener('pointercancel', tu);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      stopAmbience(); stopHunt();
      try { actx?.close(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level?.id, levelProp]);

  if (!level) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center bg-black text-center gap-4">
        {loadingRealm
          ? <p className="font-mono text-sm text-[#1ee0ff]/80 animate-pulse">summoning realm…</p>
          : <p className="font-mono text-sm text-white/60">That realm has collapsed — no level data.</p>}
        {!loadingRealm && <button onClick={() => onExit?.()} className="border border-white/20 text-white/70 text-xs uppercase tracking-widest px-5 py-2.5 hover:bg-white hover:text-black transition-colors">Back</button>}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-black" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" style={{ cursor: isMobileStage ? 'auto' : 'crosshair' }} />

      {/* Toast — gate cleared / gate locked */}
      {toast && (
        <div className="absolute left-1/2 top-[22%] z-40 -translate-x-1/2 pointer-events-none">
          <div className={`font-mono text-sm px-4 py-2 border rounded-sm backdrop-blur-sm shadow-lg ${toast.kind === 'good' ? 'text-[#8fffa8] border-[#8fffa8]/50 bg-[#08301a]/80' : 'text-[#ffcf7a] border-[#ffcf7a]/50 bg-[#301c08]/80'}`}>
            {toast.msg}
          </div>
        </div>
      )}

      {/* HUD */}
      <div className="absolute top-3 right-4 z-30 flex flex-col items-end gap-1.5 pointer-events-none">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#1ee0ff]">{level.name}</div>
        <div className="flex items-center gap-2">
          <div className="w-28 h-2.5 border border-white/30 bg-black/60">
            <div className="h-full bg-gradient-to-r from-brandRed to-[#ff9d3d] transition-all" style={{ width: `${hud.hp}%` }} />
          </div>
          <span className="font-mono text-[10px] text-white/70">{hud.hp}</span>
        </div>
        {hud.total > 0 && <div className="font-mono text-[11px] text-[#9beaff]">◆ {hud.crystals}/{hud.total}</div>}
        {hud.chestTotal > 0 && (
          <div className={`font-mono text-[11px] ${hud.chests >= hud.chestTotal ? 'text-[#7fe38f]' : 'text-[#ffb24d]'}`}>
            {hud.chests >= hud.chestTotal ? '⚿ exit open' : `▤ ${hud.chests}/${hud.chestTotal} — exit locked`}
          </div>
        )}
        {(hud.submerged || hud.breath < 100) && (
          <div className="flex items-center gap-2">
            <div className="w-28 h-2.5 border border-[#4fb3ff]/50 bg-black/60">
              <div className="h-full bg-gradient-to-r from-[#1e6fff] to-[#7fe3ff] transition-all" style={{ width: `${hud.breath}%` }} />
            </div>
            <span className="font-mono text-[10px] text-[#9beaff]">⧗ air</span>
          </div>
        )}
      </div>

      {/* Mute / ambience toggle */}
      <button onClick={() => { const m = !muted; setMuted(m); ambToggleRef.current?.(m); }}
        className="absolute top-3 left-3 z-30 text-[12px] font-mono text-white/50 border border-white/15 bg-black/50 px-2 py-1 hover:text-white">{muted ? '♪̸' : '♪'}</button>

      {/* Mobile FIRE button (combat realms) */}
      {isMobileStage && level.combat && (
        <button onPointerDown={(e) => { e.preventDefault(); attackFnRef.current?.(); }}
          style={{ bottom: 'max(4.5rem, env(safe-area-inset-bottom))' }}
          className="absolute right-6 z-30 w-16 h-16 rounded-full border-2 border-brandRed/70 bg-brandRed/20 text-brandRed font-mono text-xs flex items-center justify-center active:bg-brandRed/40">FIRE</button>
      )}

      {/* Mobile JUMP button — climb/hop between levels in stacked realms */}
      {isMobileStage && (
        <button onPointerDown={(e) => { e.preventDefault(); jumpRef.current = true; }} onPointerUp={() => { jumpRef.current = false; }} onPointerLeave={() => { jumpRef.current = false; }}
          style={{ bottom: 'max(4.5rem, env(safe-area-inset-bottom))', right: level.combat ? '6.5rem' : '1.5rem' }}
          className="absolute z-30 w-16 h-16 rounded-full border-2 border-[#1ee0ff]/70 bg-[#1ee0ff]/20 text-[#1ee0ff] font-mono text-xs flex items-center justify-center active:bg-[#1ee0ff]/40">JUMP</button>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 text-center text-[10px] font-mono text-white/40 pointer-events-none">
        {isMobileStage ? 'left = move · right = turn · tap to jump' : `WASD move · mouse/AD turn · QE strafe · Shift run · Space jump${level.combat ? ' · click attack' : ''} · Esc exit`}
      </div>

      {hud.dead && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <p className="font-mono text-2xl uppercase tracking-[0.4em] text-brandRed animate-pulse">you died</p>
        </div>
      )}

      <button onClick={() => onExit?.()} style={{ bottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        className="absolute right-3 z-30 text-[10px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all">[ EXIT ]</button>
    </div>
  );
};

export default RaycastCanvas;
