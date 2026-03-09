const Mario = {
  x: 100, y: 300, vx: 0, vy: 0,
  width: 30, height: 48,
  onGround: false, facingRight: true,
  state: 'idle',
  animFrame: 0, animTimer: 0,
  deadTimer: 0,

  update(dt) {
    if (this.state === 'dead') {
      this.vy += 1800 * dt;
      this.y += this.vy * dt;
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) Game.loseLife();
      return;
    }

    // Gravity
    this.vy += 1800 * dt;
    if (this.vy > 900) this.vy = 900;

    // Input
    if (Game.keys.ArrowRight) {
      this.vx = 200;
      this.facingRight = true;
    } else if (Game.keys.ArrowLeft) {
      this.vx = -200;
      this.facingRight = false;
    } else {
      this.vx = 0;
    }

    // Jump
    if ((Game.keys.ArrowUp || Game.keys.Space) && this.onGround) {
      this.vy = -520;
      this.onGround = false;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.onGround = false;
    Level.collide(Mario);

    if (this.x < 0) this.x = 0;

    // Animation
    this.animTimer += dt;
    if (this.animTimer > 0.1) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % 4;
    }

    // State
    if (!this.onGround) {
      this.state = 'jump';
    } else if (this.vx !== 0) {
      this.state = 'walk';
    } else {
      this.state = 'idle';
    }
  },

  die() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.vy = -400;
    this.vx = 0;
    this.deadTimer = 2.0;
  },

  draw(cameraX) {
    const ctx = Game.ctx;
    const screenX = Math.round(this.x - cameraX);
    const screenY = Math.round(this.y);

    if (this.state === 'dead') {
      ctx.save();
      // Flip vertically around Mario's center
      ctx.translate(screenX + this.width / 2, screenY + this.height / 2);
      ctx.scale(1, -1);
      ctx.translate(-(this.width / 2), -(this.height / 2));
      this._drawBody(ctx, 0, 0);
      ctx.restore();
      return;
    }

    this._drawBody(ctx, screenX, screenY);
  },

  _drawBody(ctx, sx, sy) {
    const facingRight = this.facingRight;

    // Walking shoe animation offset
    const shoeOffset = (this.state === 'walk') ? (this.animFrame % 2 === 0 ? 2 : -2) : 0;

    // Shoes (dark brown), bottom of mario
    const shoeY = sy + this.height - 10;
    ctx.fillStyle = '#5C3317';
    // Left shoe
    ctx.fillRect(sx + 1 + (facingRight ? -shoeOffset : shoeOffset), shoeY, 14, 10);
    // Right shoe
    ctx.fillRect(sx + 15 + (facingRight ? shoeOffset : -shoeOffset), shoeY, 14, 10);

    // Body (red overalls)
    const bodyY = sy + this.height - 10 - 22;
    ctx.fillStyle = '#CC0000';
    ctx.fillRect(sx, bodyY, 30, 22);

    // Overall straps (two small red rects on body, slightly different shade)
    ctx.fillStyle = '#FF4444';
    ctx.fillRect(sx + 7, bodyY + 2, 6, 10);
    ctx.fillRect(sx + 17, bodyY + 2, 6, 10);

    // Head (skin/peach)
    const headY = bodyY - 18;
    ctx.fillStyle = '#FFCC99';
    ctx.fillRect(sx + 2, headY, 26, 18);

    // Hat (red), on top of head
    const hatTopY = headY - 10;
    ctx.fillStyle = '#CC0000';
    ctx.fillRect(sx + 1, hatTopY, 28, 10);

    // Hat brim (red, slightly different tone)
    ctx.fillStyle = '#AA0000';
    ctx.fillRect(sx + 3, hatTopY + 8, 24, 6);

    // Eyes
    const eyeY = headY + 4;
    const eyeX = facingRight ? sx + 14 : sx + 8;
    // White part
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(eyeX, eyeY, 8, 6);
    // Dark pupil
    ctx.fillStyle = '#111111';
    const pupilOffsetX = facingRight ? 3 : 1;
    ctx.fillRect(eyeX + pupilOffsetX, eyeY + 1, 4, 4);

    // Mustache (dark brown/black)
    const mustacheY = headY + 12;
    ctx.fillStyle = '#3B1F0A';
    ctx.fillRect(sx + 5, mustacheY, 20, 4);
  }
};
