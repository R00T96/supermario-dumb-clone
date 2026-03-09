// ai-brain.js — AlphaGo-inspired Mario AI controller (browser, no modules)
// Sets window.AIBrain

(function () {
  'use strict';

  // ─── Tiny 2-layer policy network ────────────────────────────────────────────
  // Architecture: [9, 32, 6]  ReLU hidden, softmax output
  // Weights initialised to zero; call loadWeights(url) to populate.

  var INPUT_SIZE  = 9;
  var HIDDEN_SIZE = 32;
  var OUTPUT_SIZE = 6;

  function zeros(n) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = 0;
    return a;
  }

  function zeros2d(rows, cols) {
    var m = new Array(rows);
    for (var i = 0; i < rows; i++) m[i] = zeros(cols);
    return m;
  }

  var PolicyNet = {
    // Layer 1: INPUT_SIZE → HIDDEN_SIZE
    W1: zeros2d(INPUT_SIZE, HIDDEN_SIZE),   // [9][32]
    b1: zeros(HIDDEN_SIZE),                 // [32]
    // Layer 2: HIDDEN_SIZE → OUTPUT_SIZE
    W2: zeros2d(HIDDEN_SIZE, OUTPUT_SIZE),  // [32][6]
    b2: zeros(OUTPUT_SIZE),                 // [6]

    forward: function (x) {
      // Hidden layer: h = relu(W1^T x + b1)
      var h = new Array(HIDDEN_SIZE);
      for (var j = 0; j < HIDDEN_SIZE; j++) {
        var sum = this.b1[j];
        for (var i = 0; i < INPUT_SIZE; i++) sum += x[i] * this.W1[i][j];
        h[j] = sum > 0 ? sum : 0; // ReLU
      }

      // Output layer: logits = W2^T h + b2
      var logits = new Array(OUTPUT_SIZE);
      for (var k = 0; k < OUTPUT_SIZE; k++) {
        var s = this.b2[k];
        for (var j2 = 0; j2 < HIDDEN_SIZE; j2++) s += h[j2] * this.W2[j2][k];
        logits[k] = s;
      }

      // Softmax
      var maxL = logits[0];
      for (var k2 = 1; k2 < OUTPUT_SIZE; k2++) if (logits[k2] > maxL) maxL = logits[k2];
      var expSum = 0;
      var probs = new Array(OUTPUT_SIZE);
      for (var k3 = 0; k3 < OUTPUT_SIZE; k3++) {
        probs[k3] = Math.exp(logits[k3] - maxL);
        expSum += probs[k3];
      }
      for (var k4 = 0; k4 < OUTPUT_SIZE; k4++) probs[k4] /= expSum;

      return probs;
    },

    applyWeights: function (data) {
      // data: { W1, b1, W2, b2 } — nested arrays matching architecture
      if (data.W1) this.W1 = data.W1;
      if (data.b1) this.b1 = data.b1;
      if (data.W2) this.W2 = data.W2;
      if (data.b2) this.b2 = data.b2;
    }
  };

  // ─── State extraction ────────────────────────────────────────────────────────
  // Returns 9-element normalised feature array.
  function getState(Game, Mario, Entities) {
    var mx  = Mario.x;
    var my  = Mario.y;
    var mvx = Mario.vx;
    var mvy = Mario.vy;
    var og  = Mario.onGround ? 1 : 0;

    // Nearest alive goomba
    var nearestDx   = 0;
    var nearestDy   = 0;
    var nearestDist = 6400; // large default

    var goombas = Entities.goombas;
    for (var i = 0; i < goombas.length; i++) {
      var g = goombas[i];
      if (g.state === 'dead' || g.state === 'squished') continue;
      var dx   = g.x - mx;
      var dy   = g.y - my;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestDx   = dx;
        nearestDy   = dy;
      }
    }

    return [
      mx / 6400,
      my / 450,
      mvx / 500,
      mvy / 900,
      og,
      nearestDx   / 6400,
      nearestDy   / 450,
      nearestDist / 6400,
      mx / 6112
    ];
  }

  // ─── Action selection ─────────────────────────────────────────────────────────
  // Returns action index 0-5 (argmax of policy output).
  function pickAction(state) {
    var probs = PolicyNet.forward(state);
    var best  = 0;
    for (var i = 1; i < OUTPUT_SIZE; i++) {
      if (probs[i] > probs[best]) best = i;
    }
    return best;
  }

  // ─── Action → key mapping ────────────────────────────────────────────────────
  // 0=idle  1=left  2=right  3=jump  4=jump+right  5=jump+left
  function actionToKeys(action) {
    var k = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, Space: false };
    switch (action) {
      case 1: k.ArrowLeft  = true; break;
      case 2: k.ArrowRight = true; break;
      case 3: k.ArrowUp    = true; break;
      case 4: k.ArrowUp = true; k.ArrowRight = true; break;
      case 5: k.ArrowUp = true; k.ArrowLeft  = true; break;
      // 0: idle — all false
    }
    return k;
  }

  // ─── Controller lifecycle ─────────────────────────────────────────────────────
  var _gameRef     = null;
  var _marioRef    = null;
  var _entitiesRef = null;
  var _interval    = null;
  var _episode     = 0;
  var _bestScore   = 0;
  var _lastScore   = 0;

  function start(Game, Mario, Entities) {
    _gameRef     = Game;
    _marioRef    = Mario;
    _entitiesRef = Entities;

    if (_interval) clearInterval(_interval);
    _episode++;

    _interval = setInterval(function () {
      if (!_gameRef || _gameRef.state !== 'playing') return;

      var state  = getState(_gameRef, _marioRef, _entitiesRef);
      var action = pickAction(state);
      var keys   = actionToKeys(action);

      _gameRef.keys.ArrowLeft  = keys.ArrowLeft;
      _gameRef.keys.ArrowRight = keys.ArrowRight;
      _gameRef.keys.ArrowUp    = keys.ArrowUp;
      _gameRef.keys.Space      = keys.Space;

      // Track score for status display
      var cur = _gameRef.score;
      if (cur > _bestScore) _bestScore = cur;
      _lastScore = cur;

      // Auto-restart on game over / win so AI keeps running
      if (_gameRef.state === 'dead' || _gameRef.state === 'win') {
        _episode++;
        _gameRef.startGame();
      }

    }, 100);
  }

  function stop() {
    if (_interval) {
      clearInterval(_interval);
      _interval = null;
    }
    // Release keys
    if (_gameRef) {
      _gameRef.keys.ArrowLeft  = false;
      _gameRef.keys.ArrowRight = false;
      _gameRef.keys.ArrowUp    = false;
      _gameRef.keys.Space      = false;
    }
  }

  function loadWeights(url) {
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        PolicyNet.applyWeights(data);
        console.log('[AIBrain] Weights loaded from', url);
      })
      .catch(function (err) {
        console.warn('[AIBrain] Failed to load weights:', err);
      });
  }

  function getEpisode()   { return _episode; }
  function getBestScore() { return _bestScore; }

  // ─── Public API ───────────────────────────────────────────────────────────────
  window.AIBrain = {
    start       : start,
    stop        : stop,
    loadWeights : loadWeights,
    getState    : getState,
    pickAction  : pickAction,
    actionToKeys: actionToKeys,
    net         : PolicyNet,
    getEpisode  : getEpisode,
    getBestScore: getBestScore
  };

}());
