'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const TILE_SIZE = 32;
const COLS = 200;
const ROWS = 14;
const DT = 1 / 60;
const GRAVITY = 1800;
const MAX_VY = 900;
const MOVE_SPEED = 200;
const JUMP_VY = -520;
const FLAG_X = 191 * TILE_SIZE; // 6112

// ─── Level tile initialisation (ported from level.js) ─────────────────────────
function makeTiles() {
  const t = Array.from({ length: ROWS }, () => new Int8Array(COLS));

  // Bottom 2 rows solid ground
  for (let row = 12; row <= 13; row++) {
    for (let col = 0; col <= 68; col++)    t[row][col] = 1;
    for (let col = 72; col <= 107; col++)  t[row][col] = 1;
    for (let col = 111; col <= 199; col++) t[row][col] = 1;
  }

  // Floating bricks row 8
  for (const col of [15, 16, 17, 23, 24, 25]) t[8][col] = 2;

  // Question blocks
  t[8][20] = 3;
  t[6][55] = 3;

  // Elevated blocks
  t[10][28] = 1;
  t[10][29] = 1;

  // Pipes
  for (const col of [27, 28]) { t[11][col] = 4; t[12][col] = 5; t[13][col] = 5; }
  for (const col of [37, 38]) { t[10][col] = 4; t[11][col] = 5; t[12][col] = 5; t[13][col] = 5; }
  for (const col of [46, 47]) { t[9][col] = 4; t[10][col] = 5; t[11][col] = 5; t[12][col] = 5; t[13][col] = 5; }
  for (const col of [57, 58]) { t[11][col] = 4; t[12][col] = 5; t[13][col] = 5; }

  // Bricks around cols 75-90
  for (const col of [75, 76, 77, 78]) t[8][col] = 2;
  t[8][80] = 3;

  // End staircase cols 183-190
  for (let i = 0; i < 8; i++) {
    const col = 183 + i;
    const height = 2 + i;
    for (let h = 0; h < height; h++) {
      t[13 - h][col] = 1;
    }
  }

  return t;
}

// Cache the base tile layout — we deep-copy per SimState instance
const BASE_TILES = makeTiles();

// ─── Collision (ported from level.js) ─────────────────────────────────────────
function levelCollide(tiles, entity) {
  const left   = entity.x;
  const right  = entity.x + entity.width;
  const top    = entity.y;
  const bottom = entity.y + entity.height;

  const colStart = Math.max(0, Math.floor(left / TILE_SIZE));
  const colEnd   = Math.min(COLS - 1, Math.floor((right - 1) / TILE_SIZE));
  const rowStart = Math.max(0, Math.floor(top / TILE_SIZE));
  const rowEnd   = Math.min(ROWS - 1, Math.floor((bottom - 1) / TILE_SIZE));

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const tile = tiles[row][col];
      if (tile === 0) continue;

      const tileLeft   = col * TILE_SIZE;
      const tileRight  = tileLeft + TILE_SIZE;
      const tileTop    = row * TILE_SIZE;
      const tileBottom = tileTop + TILE_SIZE;

      const overlapX = Math.min(right,  tileRight)  - Math.max(left, tileLeft);
      const overlapY = Math.min(bottom, tileBottom) - Math.max(top,  tileTop);

      if (overlapX <= 0 || overlapY <= 0) continue;

      if (overlapX < overlapY) {
        // Horizontal resolution
        if (entity.x + entity.width / 2 < tileLeft + TILE_SIZE / 2) {
          entity.x -= overlapX;
        } else {
          entity.x += overlapX;
        }
        entity.vx = 0;
      } else {
        // Vertical resolution
        if (entity.y + entity.height / 2 < tileTop + TILE_SIZE / 2) {
          // Landed on top
          entity.y -= overlapY;
          entity.vy = 0;
          entity.onGround = true;
        } else {
          // Hit ceiling
          entity.y += overlapY;
          entity.vy = 0;
          // Destroy question block hit from below
          if (tile === 3) {
            tiles[row][col] = 0;
          }
        }
      }
    }
  }
}

// ─── SimState ─────────────────────────────────────────────────────────────────
class SimState {
  static ACTION_COUNT = 6;

  constructor() {
    // Tiles: array of Int8Array rows (deep copy of base)
    this.tiles = BASE_TILES.map(row => row.slice());

    // Mario
    this.mario = { x: 100, y: 300, vx: 0, vy: 0, width: 30, height: 48, onGround: false, state: 'idle' };

    // Goombas
    this.goombas = [
      { x: 400,  y: 350, vx: -60, vy: 0, width: 30, height: 30, state: 'alive', squishTimer: 0, onGround: false },
      { x: 520,  y: 350, vx: -60, vy: 0, width: 30, height: 30, state: 'alive', squishTimer: 0, onGround: false },
      { x: 680,  y: 350, vx: -60, vy: 0, width: 30, height: 30, state: 'alive', squishTimer: 0, onGround: false },
      { x: 950,  y: 350, vx: -60, vy: 0, width: 30, height: 30, state: 'alive', squishTimer: 0, onGround: false },
      { x: 1150, y: 350, vx: -60, vy: 0, width: 30, height: 30, state: 'alive', squishTimer: 0, onGround: false },
      { x: 1450, y: 350, vx: -60, vy: 0, width: 30, height: 30, state: 'alive', squishTimer: 0, onGround: false },
      { x: 1750, y: 350, vx: -60, vy: 0, width: 30, height: 30, state: 'alive', squishTimer: 0, onGround: false },
      { x: 2100, y: 350, vx: -60, vy: 0, width: 30, height: 30, state: 'alive', squishTimer: 0, onGround: false },
    ];

    this.done = false;
    this.win  = false;
    this._prevX = this.mario.x;
  }

  clone() {
    const s = Object.create(SimState.prototype);
    s.tiles   = this.tiles.map(row => row.slice());
    s.mario   = Object.assign({}, this.mario);
    s.goombas = this.goombas.map(g => Object.assign({}, g));
    s.done    = this.done;
    s.win     = this.win;
    s._prevX  = this._prevX;
    return s;
  }

  // action: 0=idle, 1=left, 2=right, 3=jump, 4=jump+right, 5=jump+left
  step(action) {
    if (this.done) return { reward: 0, done: true, win: this.win };

    const m = this.mario;
    const prevX = m.x;

    // ── Mario update ──────────────────────────────────────────────────────────
    if (m.state === 'dead') {
      m.vy += GRAVITY * DT;
      m.y  += m.vy * DT;
      // death bounces and falls off screen → done
      if (m.y > 600) {
        this.done = true;
        return { reward: -100, done: true, win: false };
      }
      return { reward: 0, done: false, win: false };
    }

    // Gravity
    m.vy += GRAVITY * DT;
    if (m.vy > MAX_VY) m.vy = MAX_VY;

    // Horizontal input
    const wantRight = action === 2 || action === 4;
    const wantLeft  = action === 1 || action === 5;
    const wantJump  = action === 3 || action === 4 || action === 5;

    if (wantRight)      { m.vx = MOVE_SPEED; }
    else if (wantLeft)  { m.vx = -MOVE_SPEED; }
    else                { m.vx = 0; }

    // Jump
    if (wantJump && m.onGround) {
      m.vy = JUMP_VY;
      m.onGround = false;
    }

    m.x += m.vx * DT;
    m.y += m.vy * DT;

    m.onGround = false;
    levelCollide(this.tiles, m);

    if (m.x < 0) m.x = 0;

    // Fall off screen → die
    if (m.y > 500) {
      m.state = 'dead';
      this.done = true;
      return { reward: -100, done: true, win: false };
    }

    // State label
    if (!m.onGround)     m.state = 'jump';
    else if (m.vx !== 0) m.state = 'walk';
    else                 m.state = 'idle';

    // ── Goombas update ────────────────────────────────────────────────────────
    for (const g of this.goombas) {
      if (g.state === 'dead') continue;
      if (g.state === 'squished') {
        g.squishTimer -= DT;
        if (g.squishTimer <= 0) g.state = 'dead';
        continue;
      }

      g.vy += GRAVITY * DT;
      if (g.vy > MAX_VY) g.vy = MAX_VY;

      const prevVx = g.vx;
      g.x += g.vx * DT;
      g.y += g.vy * DT;
      g.onGround = false;
      levelCollide(this.tiles, g);
      if (g.vx === 0 && prevVx !== 0) g.vx = -prevVx;

      // Mario ↔ Goomba collision
      if (m.state !== 'dead') {
        if (m.x < g.x + g.width && m.x + m.width > g.x &&
            m.y < g.y + g.height && m.y + m.height > g.y) {
          const mBottom = m.y + m.height;
          const gTop    = g.y;
          if (m.vy > 0 && mBottom - gTop < 20) {
            // Stomp
            g.state = 'squished';
            g.squishTimer = 0.4;
            m.vy = -320;
          } else {
            // Mario dies
            m.state = 'dead';
            m.vy = -400;
            m.vx = 0;
            // will be caught next step or when y > 500
          }
        }
      }
    }

    // ── Win check ─────────────────────────────────────────────────────────────
    if (m.x > FLAG_X) {
      this.done = true;
      this.win  = true;
      const progress = m.x - prevX;
      return { reward: progress + 1000, done: true, win: true };
    }

    // ── Check immediate death state set this step ─────────────────────────────
    if (m.state === 'dead') {
      this.done = true;
      return { reward: -100, done: true, win: false };
    }

    const reward = m.x - prevX;
    return { reward, done: false, win: false };
  }

  // Returns Float32Array of 9 features
  getState() {
    const m = this.mario;
    const out = new Float32Array(9);

    // Nearest alive goomba
    let nearestDist = Infinity;
    let nearestDx   = 6400;
    let nearestDy   = 450;

    for (const g of this.goombas) {
      if (g.state === 'dead' || g.state === 'squished') continue;
      const dx   = g.x - m.x;
      const dy   = g.y - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestDx   = dx;
        nearestDy   = dy;
      }
    }
    if (nearestDist === Infinity) nearestDist = 6400;

    out[0] = m.x / 6400;
    out[1] = m.y / 450;
    out[2] = m.vx / 500;
    out[3] = m.vy / 900;
    out[4] = m.onGround ? 1 : 0;
    out[5] = nearestDx / 6400;
    out[6] = nearestDy / 450;
    out[7] = nearestDist / 6400;
    out[8] = m.x / FLAG_X;

    return out;
  }
}

module.exports = { SimState };
