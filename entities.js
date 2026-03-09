const Entities = {
  goombas: [],
  coinEffects: [],

  init() {
    this.goombas = [
      { x:400, y:350, vx:-60, vy:0, width:30, height:30, state:'alive', squishTimer:0, onGround:false },
      { x:520, y:350, vx:-60, vy:0, width:30, height:30, state:'alive', squishTimer:0, onGround:false },
      { x:680, y:350, vx:-60, vy:0, width:30, height:30, state:'alive', squishTimer:0, onGround:false },
      { x:950, y:350, vx:-60, vy:0, width:30, height:30, state:'alive', squishTimer:0, onGround:false },
      { x:1150, y:350, vx:-60, vy:0, width:30, height:30, state:'alive', squishTimer:0, onGround:false },
      { x:1450, y:350, vx:-60, vy:0, width:30, height:30, state:'alive', squishTimer:0, onGround:false },
      { x:1750, y:350, vx:-60, vy:0, width:30, height:30, state:'alive', squishTimer:0, onGround:false },
      { x:2100, y:350, vx:-60, vy:0, width:30, height:30, state:'alive', squishTimer:0, onGround:false },
    ],
    this.coinEffects = []
  },

  spawnCoin(x, y) {
    this.coinEffects.push({ x: x+16, y: y, vy: -300, alpha: 1.0, timer: 0.8 })
  },

  update(dt) {
    // Update goombas
    for (let g of this.goombas) {
      if (g.state === 'dead') continue
      if (g.state === 'squished') {
        g.squishTimer -= dt
        if (g.squishTimer <= 0) g.state = 'dead'
        continue
      }
      // gravity
      g.vy += 1800 * dt
      if (g.vy > 900) g.vy = 900
      const prevVx = g.vx
      g.x += g.vx * dt
      g.y += g.vy * dt
      g.onGround = false
      Level.collide(g)
      // reverse on wall hit: Level.collide zeroes vx on horizontal hit
      if (g.vx === 0 && prevVx !== 0) g.vx = -prevVx
      // check Mario collision
      const M = Mario
      if (M.state !== 'dead') {
        // overlap check
        if (M.x < g.x + g.width && M.x + M.width > g.x && M.y < g.y + g.height && M.y + M.height > g.y) {
          // Mario jumping on top?
          const mBottom = M.y + M.height
          const gTop = g.y
          if (M.vy > 0 && mBottom - gTop < 20) {
            // squish
            g.state = 'squished'
            g.squishTimer = 0.4
            M.vy = -320
            Game.addScore(200)
          } else {
            // Mario gets hurt
            M.die()
          }
        }
      }
    }
    // Update coin effects
    for (let c of this.coinEffects) {
      c.y += c.vy * dt
      c.vy += 800 * dt
      c.timer -= dt
      c.alpha = Math.max(0, c.timer / 0.8)
    }
    this.coinEffects = this.coinEffects.filter(c => c.timer > 0)
    // Remove dead goombas after they fall off screen
    this.goombas = this.goombas.filter(g => !(g.state==='dead' && g.y > 600))
  },

  draw(cameraX) {
    const ctx = Game.ctx
    for (let g of this.goombas) {
      if (g.state === 'dead') continue
      const sx = Math.round(g.x - cameraX)
      const sy = Math.round(g.y)
      if (sx < -40 || sx > 840) continue
      const squish = g.state === 'squished' ? 0.4 : 1.0
      ctx.save()
      ctx.translate(sx + g.width/2, sy + g.height/2)
      ctx.scale(1, squish)
      // body — brown oval
      ctx.fillStyle = '#8B4513'
      ctx.beginPath()
      ctx.ellipse(0, 0, 15, 15, 0, 0, Math.PI*2)
      ctx.fill()
      // eyes — white with dark pupils
      if (g.state !== 'squished') {
        ctx.fillStyle = 'white'
        ctx.fillRect(-10, -8, 8, 6)
        ctx.fillRect(2, -8, 8, 6)
        ctx.fillStyle = '#222'
        ctx.fillRect(-8, -7, 4, 4)
        ctx.fillRect(4, -7, 4, 4)
        // angry eyebrows
        ctx.strokeStyle = '#222'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(-4, -10); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(12, -12); ctx.lineTo(4, -10); ctx.stroke()
      }
      // feet
      ctx.fillStyle = '#5C2E00'
      ctx.fillRect(-14, 12, 12, 8)
      ctx.fillRect(2, 12, 12, 8)
      ctx.restore()
    }
    // coin effects
    for (let c of this.coinEffects) {
      const sx = Math.round(c.x - cameraX)
      ctx.globalAlpha = c.alpha
      ctx.fillStyle = '#FFD700'
      ctx.beginPath()
      ctx.arc(sx, Math.round(c.y), 8, 0, Math.PI*2)
      ctx.fill()
      ctx.strokeStyle = '#FFA500'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }
}
