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

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function sampleFromDist(probs) {
    var r = Math.random();
    var cumulative = 0;
    for (var i = 0; i < probs.length; i++) {
      cumulative += probs[i];
      if (r < cumulative) return i;
    }
    return probs.length - 1;
  }

  var PolicyNet = {
    // Layer 1: INPUT_SIZE → HIDDEN_SIZE
    W1: zeros2d(INPUT_SIZE, HIDDEN_SIZE),   // [9][32]
    b1: zeros(HIDDEN_SIZE),                 // [32]
    // Layer 2: HIDDEN_SIZE → OUTPUT_SIZE
    W2: zeros2d(HIDDEN_SIZE, OUTPUT_SIZE),  // [32][6]
    b2: zeros(OUTPUT_SIZE),                 // [6]

    forwardDetailed: function (x) {
      // Hidden layer: h = relu(W1^T x + b1)
      var preH = new Array(HIDDEN_SIZE);
      var h = new Array(HIDDEN_SIZE);
      for (var j = 0; j < HIDDEN_SIZE; j++) {
        var sum = this.b1[j];
        for (var i = 0; i < INPUT_SIZE; i++) sum += x[i] * this.W1[i][j];
        preH[j] = sum;
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

      return { preH: preH, h: h, probs: probs };
    },

    forward: function (x) {
      return this.forwardDetailed(x).probs;
    },

    applyWeights: function (data) {
      // data: { W1, b1, W2, b2 } — nested arrays matching architecture
      if (data.W1) this.W1 = data.W1;
      if (data.b1) this.b1 = data.b1;
      if (data.W2) this.W2 = data.W2;
      if (data.b2) this.b2 = data.b2;
    },

    backward: function (x, target, learningRate) {
      var lr = learningRate;
      if (!isFinite(lr) || Math.abs(lr) < 1e-12) return;

      var f = this.forwardDetailed(x);
      var preH = f.preH;
      var h = f.h;
      var probs = f.probs;

      // dL/dlogits = softmax - target (cross-entropy)
      var dLogits = new Array(OUTPUT_SIZE);
      for (var k = 0; k < OUTPUT_SIZE; k++) dLogits[k] = probs[k] - target[k];

      // Backprop into hidden (use old W2 before updates)
      var dHidden = new Array(HIDDEN_SIZE);
      for (var j = 0; j < HIDDEN_SIZE; j++) {
        var sum = 0;
        for (var k2 = 0; k2 < OUTPUT_SIZE; k2++) sum += this.W2[j][k2] * dLogits[k2];
        dHidden[j] = preH[j] > 0 ? sum : 0;
      }

      // Update output layer
      for (var k3 = 0; k3 < OUTPUT_SIZE; k3++) {
        this.b2[k3] -= lr * dLogits[k3];
        for (var j2 = 0; j2 < HIDDEN_SIZE; j2++) {
          this.W2[j2][k3] -= lr * dLogits[k3] * h[j2];
        }
      }

      // Update hidden layer
      for (var j3 = 0; j3 < HIDDEN_SIZE; j3++) {
        this.b1[j3] -= lr * dHidden[j3];
        for (var i2 = 0; i2 < INPUT_SIZE; i2++) {
          this.W1[i2][j3] -= lr * dHidden[j3] * x[i2];
        }
      }
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
  // Returns action index 0-5 with epsilon-greedy exploration.
  function pickAction(state, epsilon) {
    var eps = epsilon || 0;
    if (Math.random() < eps) {
      return Math.floor(Math.random() * OUTPUT_SIZE);
    }
    var probs = PolicyNet.forward(state);
    return sampleFromDist(probs);
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
  var _weightsLoaded = false;
  var _trainedEpisodes = 0;
  var _lastEpisodeReturn = 0;
  var _epsilon = 0.25;
  var _episodeStates = [];
  var _episodeActions = [];
  var _episodeRewards = [];
  var _pendingTransition = null;
  var _lastX = 0;
  var _lastTrackedScore = 0;
  var WEIGHTS_KEY = 'AIBrainPolicy_v1';

  function getWeightsSnapshot() {
    return { W1: PolicyNet.W1, b1: PolicyNet.b1, W2: PolicyNet.W2, b2: PolicyNet.b2 };
  }

  function saveWeightsLocal() {
    try {
      localStorage.setItem(WEIGHTS_KEY, JSON.stringify(getWeightsSnapshot()));
    } catch (_) {}
  }

  function tryLoadLocalWeights() {
    try {
      var raw = localStorage.getItem(WEIGHTS_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !data.W1 || !data.W2 || !data.b1 || !data.b2) return false;
      PolicyNet.applyWeights(data);
      _weightsLoaded = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  function resetEpisodeBuffer() {
    _episodeStates = [];
    _episodeActions = [];
    _episodeRewards = [];
    _pendingTransition = null;
    _lastX = _marioRef ? _marioRef.x : 0;
    _lastTrackedScore = _gameRef ? _gameRef.score : 0;
    _lastEpisodeReturn = 0;
  }

  function flushPendingTransition(terminalBonus) {
    if (!_pendingTransition || !_marioRef || !_gameRef) return;
    var progress = _marioRef.x - _lastX;
    var scoreDelta = _gameRef.score - _lastTrackedScore;
    var reward = progress + scoreDelta * 0.05 - 0.01 + (terminalBonus || 0);
    _episodeStates.push(_pendingTransition.state);
    _episodeActions.push(_pendingTransition.action);
    _episodeRewards.push(reward);
    _lastEpisodeReturn += reward;
    _pendingTransition = null;
    _lastX = _marioRef.x;
    _lastTrackedScore = _gameRef.score;
  }

  function trainOnEpisode() {
    var n = _episodeRewards.length;
    if (n < 2) return;

    var returns = new Array(n);
    var G = 0;
    var gamma = 0.99;
    for (var t = n - 1; t >= 0; t--) {
      G = _episodeRewards[t] + gamma * G;
      returns[t] = G;
    }

    var mean = 0;
    for (var i = 0; i < n; i++) mean += returns[i];
    mean /= n;

    var variance = 0;
    for (var j = 0; j < n; j++) {
      var d = returns[j] - mean;
      variance += d * d;
    }
    variance /= n;
    var std = Math.sqrt(variance) + 1e-8;

    var baseLR = 0.0015;
    for (var k = 0; k < n; k++) {
      var adv = (returns[k] - mean) / std;
      var lr = clamp(baseLR * adv, -0.01, 0.01);
      var target = [0, 0, 0, 0, 0, 0];
      target[_episodeActions[k]] = 1;
      PolicyNet.backward(_episodeStates[k], target, lr);
    }

    _trainedEpisodes++;
    _epsilon = Math.max(0.05, _epsilon * 0.995);
    if (_trainedEpisodes % 5 === 0) saveWeightsLocal();
  }

  function convertTrainerPolicyToBrowser(policyObj) {
    if (!policyObj || !policyObj.weights || !policyObj.biases) return null;
    if (!policyObj.weights[0] || !policyObj.weights[1]) return null;
    if (!policyObj.biases[0] || !policyObj.biases[1]) return null;

    var w1Flat = policyObj.weights[0]; // [32 * 9] as [out][in]
    var w2Flat = policyObj.weights[1]; // [6 * 32] as [out][in]
    var b1     = policyObj.biases[0];
    var b2     = policyObj.biases[1];

    if (w1Flat.length !== HIDDEN_SIZE * INPUT_SIZE) return null;
    if (w2Flat.length !== OUTPUT_SIZE * HIDDEN_SIZE) return null;
    if (b1.length !== HIDDEN_SIZE || b2.length !== OUTPUT_SIZE) return null;

    var W1 = zeros2d(INPUT_SIZE, HIDDEN_SIZE);
    for (var h = 0; h < HIDDEN_SIZE; h++) {
      var row = h * INPUT_SIZE;
      for (var i = 0; i < INPUT_SIZE; i++) {
        W1[i][h] = w1Flat[row + i];
      }
    }

    var W2 = zeros2d(HIDDEN_SIZE, OUTPUT_SIZE);
    for (var o = 0; o < OUTPUT_SIZE; o++) {
      var row2 = o * HIDDEN_SIZE;
      for (var j = 0; j < HIDDEN_SIZE; j++) {
        W2[j][o] = w2Flat[row2 + j];
      }
    }

    return { W1: W1, b1: b1, W2: W2, b2: b2 };
  }

  function start(Game, Mario, Entities) {
    _gameRef     = Game;
    _marioRef    = Mario;
    _entitiesRef = Entities;

    if (!_weightsLoaded) tryLoadLocalWeights();
    if (_interval) clearInterval(_interval);
    _episode++;
    resetEpisodeBuffer();

    _interval = setInterval(function () {
      if (!_gameRef) return;

      if (_gameRef.state === 'dead' || _gameRef.state === 'win') {
        flushPendingTransition(_gameRef.state === 'win' ? 200 : -100);
        trainOnEpisode();
        saveWeightsLocal();
        _episode++;
        _gameRef.startGame();
        resetEpisodeBuffer();
      }
      if (_gameRef.state !== 'playing') return;

      flushPendingTransition(0);

      var state  = getState(_gameRef, _marioRef, _entitiesRef);
      var action = pickAction(state, _epsilon);
      var keys   = actionToKeys(action);

      _gameRef.keys.ArrowLeft  = keys.ArrowLeft;
      _gameRef.keys.ArrowRight = keys.ArrowRight;
      _gameRef.keys.ArrowUp    = keys.ArrowUp;
      _gameRef.keys.Space      = keys.Space;
      _pendingTransition = { state: state.slice(0), action: action };

      // Track score for status display
      var cur = _gameRef.score;
      if (cur > _bestScore) _bestScore = cur;
      _lastScore = cur;

    }, 100);
  }

  function stop() {
    flushPendingTransition(0);
    trainOnEpisode();
    saveWeightsLocal();
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
        var normalized = data;
        // Support both browser-native shape {W1,b1,W2,b2}
        // and trainer output shape { policy: { layerSizes, weights, biases }, value: ... }.
        if (!data.W1 && data.policy) {
          normalized = convertTrainerPolicyToBrowser(data.policy);
        }
        if (!normalized) throw new Error('Unsupported weights format');
        PolicyNet.applyWeights(normalized);
        _weightsLoaded = true;
        console.log('[AIBrain] Weights loaded from', url);
      })
      .catch(function (err) {
        console.warn('[AIBrain] Failed to load weights:', err);
      });
  }

  function getEpisode()   { return _episode; }
  function getBestScore() { return _bestScore; }
  function getTrainedEpisodes() { return _trainedEpisodes; }
  function getEpsilon() { return _epsilon; }
  function getLastEpisodeReturn() { return _lastEpisodeReturn; }

  // ─── Public API ───────────────────────────────────────────────────────────────
  window.AIBrain = {
    start       : start,
    stop        : stop,
    loadWeights : loadWeights,
    getState    : getState,
    pickAction  : pickAction,
    actionToKeys: actionToKeys,
    net         : PolicyNet,
    hasWeights  : function () { return _weightsLoaded; },
    getEpisode  : getEpisode,
    getBestScore: getBestScore,
    getTrainedEpisodes: getTrainedEpisodes,
    getEpsilon: getEpsilon,
    getLastEpisodeReturn: getLastEpisodeReturn
  };

}());
