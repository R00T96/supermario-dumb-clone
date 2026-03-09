const Game = {
  canvas: document.getElementById('gameCanvas'),
  ctx: null,

  width: 800,
  height: 450,

  keys: {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    Space: false,
  },

  camera: { x: 0 },

  state: 'start', // 'start' | 'playing' | 'dead' | 'win'

  score: 0,
  lives: 3,
  coins: 0,

  addScore(n) {
    this.score += n;
  },

  addCoin() {
    this.coins += 1;
    this.score += 200;
  },

  loseLife() {
    this.lives--;
    if (this.lives > 0) {
      Mario.x = 100;
      Mario.y = 300;
      Mario.vx = 0;
      Mario.vy = 0;
      Mario.state = 'idle';
    } else {
      this.state = 'dead';
    }
  },

  startGame() {
    this.score = 0;
    this.lives = 3;
    this.coins = 0;
    this.state = 'playing';
    this.camera.x = 0;
    Level.init();
    Entities.init();
    Mario.x = 100;
    Mario.y = 300;
    Mario.vx = 0;
    Mario.vy = 0;
    Mario.state = 'idle';
  },

  update() {
    if (this.state !== 'playing') return;

    // Update camera
    let targetX = Mario.x - 300;
    this.camera.x = Math.max(0, Math.min(targetX, Level.width - this.width));

    Mario.update(1 / 60);
    Level.update(1 / 60);
    Entities.update(1 / 60);

    // Check win condition
    if (Mario.x > Level.flagX) {
      this.state = 'win';
    }
  },

  drawOverlay(alpha) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(0, 0, this.width, this.height);
  },

  drawHUD() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, this.width, 36);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`SCORE: ${this.score}   LIVES: ${this.lives}   COINS: ${this.coins}`, 16, 18);
  },

  drawCenteredText(text, y, size, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.width / 2, y);
  },

  render() {
    const ctx = this.ctx;

    // Clear with sky blue
    ctx.fillStyle = '#6B8CFF';
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.state === 'playing' || this.state === 'dead') {
      Level.draw(this.camera.x);
      Entities.draw(this.camera.x);
      Mario.draw(this.camera.x);
      this.drawHUD();
    }

    if (this.state === 'start') {
      this.drawOverlay(0.6);
      this.drawCenteredText('SUPER MARIO CLONE', this.height / 2 - 40, 48, '#fff');
      this.drawCenteredText('Press ENTER to Start', this.height / 2 + 30, 24, '#fff');
    }

    if (this.state === 'dead') {
      this.drawOverlay(0.6);
      this.drawCenteredText('GAME OVER', this.height / 2 - 60, 64, '#f00');
      this.drawCenteredText(`Score: ${this.score}`, this.height / 2 + 10, 32, '#fff');
      this.drawCenteredText('Press ENTER to retry', this.height / 2 + 55, 24, '#fff');
    }

    if (this.state === 'win') {
      this.drawOverlay(0.5);
      this.drawCenteredText('YOU WIN!', this.height / 2 - 50, 64, '#ff0');
      this.drawCenteredText(`Score: ${this.score}`, this.height / 2 + 20, 32, '#fff');
    }
  },

  loop() {
    this.update();
    this.render();
    requestAnimationFrame(() => this.loop());
  },

  init() {
    this.ctx = this.canvas.getContext('2d');

    window.addEventListener('keydown', (e) => {
      if (e.code in this.keys) {
        this.keys[e.code] = true;
        e.preventDefault();
      }
      if (e.code === 'Space') {
        this.keys.Space = true;
        e.preventDefault();
      }
      if (e.code === 'Enter') {
        if (this.state === 'start' || this.state === 'dead') {
          this.startGame();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code in this.keys) {
        this.keys[e.code] = false;
      }
      if (e.code === 'Space') {
        this.keys.Space = false;
      }
    });

    requestAnimationFrame(() => this.loop());
  },
};

Game.init();
