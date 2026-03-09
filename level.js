const TILE_SIZE = 32;
const COLS = 200;
const ROWS = 14;

const Level = {
  width: 6400,
  height: 450,
  tiles: null,
  flagX: 191 * TILE_SIZE,

  init() {
    this.tiles = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
    const t = this.tiles;

    // Bottom 2 rows solid ground
    for (let row = 12; row <= 13; row++) {
      for (let col = 0; col <= 68; col++)   t[row][col] = 1;
      for (let col = 72; col <= 107; col++) t[row][col] = 1;
      for (let col = 111; col <= 199; col++) t[row][col] = 1;
    }

    // Floating bricks row 8
    for (const col of [15, 16, 17, 23, 24, 25]) t[8][col] = 2;

    // Question blocks
    t[8][20] = 3;
    t[6][55] = 3;

    // Elevated block
    t[10][28] = 1;
    t[10][29] = 1;

    // Pipes — each pipe uses two adjacent columns
    // cols 27-28: rows 11(top), 12-13(body)
    for (const col of [27, 28]) {
      t[11][col] = 4;
      t[12][col] = 5;
      t[13][col] = 5;
    }
    // cols 37-38: rows 10(top), 11-13(body)
    for (const col of [37, 38]) {
      t[10][col] = 4;
      t[11][col] = 5;
      t[12][col] = 5;
      t[13][col] = 5;
    }
    // cols 46-47: rows 9(top), 10-13(body)
    for (const col of [46, 47]) {
      t[9][col] = 4;
      t[10][col] = 5;
      t[11][col] = 5;
      t[12][col] = 5;
      t[13][col] = 5;
    }
    // cols 57-58: rows 11(top), 12-13(body)
    for (const col of [57, 58]) {
      t[11][col] = 4;
      t[12][col] = 5;
      t[13][col] = 5;
    }

    // Bricks around cols 75-90
    for (const col of [75, 76, 77, 78]) t[8][col] = 2;
    t[8][80] = 3;

    // End staircase cols 183-190
    // col 183: rows 13,12 (2 high)
    // col 184: rows 13,12,11 (3 high)
    // ...
    // col 190: rows 13..7 (7 high)
    for (let i = 0; i < 8; i++) {
      const col = 183 + i;
      const height = 2 + i; // 2 to 9 rows from bottom
      for (let h = 0; h < height; h++) {
        t[13 - h][col] = 1;
      }
    }
  },

  collide(entity) {
    const t = this.tiles;
    let hit = false;

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
        const tile = t[row][col];
        if (tile === 0) continue;

        const tileLeft   = col * TILE_SIZE;
        const tileRight  = tileLeft + TILE_SIZE;
        const tileTop    = row * TILE_SIZE;
        const tileBottom = tileTop + TILE_SIZE;

        const overlapX = Math.min(right, tileRight)   - Math.max(left, tileLeft);
        const overlapY = Math.min(bottom, tileBottom) - Math.max(top, tileTop);

        if (overlapX <= 0 || overlapY <= 0) continue;

        hit = true;

        if (overlapX < overlapY) {
          // Resolve horizontally
          if (entity.x + entity.width / 2 < tileLeft + TILE_SIZE / 2) {
            entity.x -= overlapX;
          } else {
            entity.x += overlapX;
          }
          entity.vx = 0;
        } else {
          // Resolve vertically
          if (entity.y + entity.height / 2 < tileTop + TILE_SIZE / 2) {
            // Entity was above tile — landed on top
            entity.y -= overlapY;
            entity.vy = 0;
            entity.onGround = true;
          } else {
            // Entity hit ceiling
            entity.y += overlapY;
            entity.vy = 0;

            if (tile === 3) {
              // Question block hit from below
              t[row][col] = 0;
              if (typeof Game !== 'undefined') {
                Game.addScore(200);
                Game.addCoin();
              }
              if (typeof Entities !== 'undefined') {
                Entities.spawnCoin(col * TILE_SIZE, row * TILE_SIZE);
              }
            }
          }
        }
      }
    }

    return hit;
  },

  update(dt) {
    // Reserved for future use
  },

  draw(cameraX) {
    const ctx = Game.ctx;

    const startCol = Math.max(0, Math.floor(cameraX / TILE_SIZE));
    const endCol   = Math.min(COLS, Math.ceil((cameraX + 800) / TILE_SIZE));

    for (let row = 0; row < ROWS; row++) {
      for (let col = startCol; col < endCol; col++) {
        const tile = this.tiles[row][col];
        if (tile === 0) continue;

        const screenX = col * TILE_SIZE - cameraX;
        const screenY = row * TILE_SIZE;
        const s = TILE_SIZE;

        if (tile === 1) {
          // Ground — brown
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(screenX, screenY, s, s);
          ctx.strokeStyle = '#5C2E00';
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 0.5, screenY + 0.5, s - 1, s - 1);

        } else if (tile === 2) {
          // Brick
          ctx.fillStyle = '#CD853F';
          ctx.fillRect(screenX, screenY, s, s);
          ctx.strokeStyle = '#8B5A1A';
          ctx.lineWidth = 1;
          // Horizontal mortar lines
          ctx.beginPath();
          ctx.moveTo(screenX, screenY + s / 2);
          ctx.lineTo(screenX + s, screenY + s / 2);
          ctx.stroke();
          // Vertical mortar lines — offset per row half
          const offset = (row % 2 === 0) ? s / 2 : 0;
          ctx.beginPath();
          ctx.moveTo(screenX + offset, screenY);
          ctx.lineTo(screenX + offset, screenY + s / 2);
          ctx.moveTo(screenX + ((offset + s / 2) % s), screenY + s / 2);
          ctx.lineTo(screenX + ((offset + s / 2) % s), screenY + s);
          ctx.stroke();
          ctx.strokeRect(screenX + 0.5, screenY + 0.5, s - 1, s - 1);

        } else if (tile === 3) {
          // Question block
          ctx.fillStyle = '#FFD700';
          ctx.fillRect(screenX, screenY, s, s);
          ctx.strokeStyle = '#B8860B';
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 0.5, screenY + 0.5, s - 1, s - 1);
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 20px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', screenX + s / 2, screenY + s / 2);

        } else if (tile === 4) {
          // Pipe top — bright green, slightly wider look
          ctx.fillStyle = '#00AA00';
          ctx.fillRect(screenX - 2, screenY, s + 4, s);
          ctx.strokeStyle = '#005500';
          ctx.lineWidth = 2;
          ctx.strokeRect(screenX - 2 + 1, screenY + 1, s + 4 - 2, s - 2);

        } else if (tile === 5) {
          // Pipe body — medium green
          ctx.fillStyle = '#008800';
          ctx.fillRect(screenX, screenY, s, s);
          ctx.strokeStyle = '#005500';
          ctx.lineWidth = 1;
          // Side highlight lines
          ctx.beginPath();
          ctx.moveTo(screenX + 4, screenY);
          ctx.lineTo(screenX + 4, screenY + s);
          ctx.moveTo(screenX + s - 4, screenY);
          ctx.lineTo(screenX + s - 4, screenY + s);
          ctx.stroke();
        }
      }
    }
  }
};
