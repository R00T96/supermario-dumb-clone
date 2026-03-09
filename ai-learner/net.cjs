'use strict';

const fs = require('fs');

// --- Math helpers (plain JS arrays) ---

function randn() {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function relu(x) { return x > 0 ? x : 0; }
function reluGrad(x) { return x > 0 ? 1 : 0; }
function tanh(x) { return Math.tanh(x); }
function tanhGrad(x) { const t = Math.tanh(x); return 1 - t * t; }

function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map(x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(x => x / sum);
}

// Matrix multiply: A[m x k] * B[k x n] -> C[m x n]
// A stored row-major as flat array length m*k, B as k*n
function matVec(W, b, x, outSize) {
  const inSize = x.length;
  const out = new Array(outSize);
  for (let i = 0; i < outSize; i++) {
    let sum = b[i];
    const row = i * inSize;
    for (let j = 0; j < inSize; j++) {
      sum += W[row + j] * x[j];
    }
    out[i] = sum;
  }
  return out;
}

// ---

class NeuralNet {
  constructor(layerSizes) {
    this.layerSizes = layerSizes;
    this.numLayers = layerSizes.length - 1; // number of weight layers
    this.weights = []; // W[l]: flat Float64Array, shape [out x in]
    this.biases = [];  // b[l]: Float64Array, shape [out]

    for (let l = 0; l < this.numLayers; l++) {
      const fanIn = layerSizes[l];
      const fanOut = layerSizes[l + 1];
      const std = Math.sqrt(2.0 / fanIn); // Xavier/He init
      const W = new Float64Array(fanOut * fanIn);
      for (let i = 0; i < W.length; i++) W[i] = randn() * std;
      const b = new Float64Array(fanOut).fill(0);
      this.weights.push(W);
      this.biases.push(b);
    }
  }

  // Returns { zs, as } where as[0] = input, as[l+1] = activations after layer l
  _forwardFull(inputArray) {
    const x = Array.from(inputArray);
    const zs = []; // pre-activations
    const as = [x]; // post-activations

    for (let l = 0; l < this.numLayers; l++) {
      const fanIn = this.layerSizes[l];
      const fanOut = this.layerSizes[l + 1];
      const z = matVec(this.weights[l], this.biases[l], as[l], fanOut);
      zs.push(z);

      const isLast = l === this.numLayers - 1;
      let a;
      if (isLast) {
        if (fanOut === 1) {
          a = [tanh(z[0])];
        } else {
          a = softmax(z);
        }
      } else {
        a = z.map(relu);
      }
      as.push(a);
    }
    return { zs, as };
  }

  forward(inputArray) {
    return this._forwardFull(inputArray).as[this.numLayers];
  }

  backward(inputArray, targetArray, learningRate) {
    const { zs, as } = this._forwardFull(inputArray);
    const target = Array.from(targetArray);
    const outputSize = this.layerSizes[this.numLayers];

    // Compute output delta
    // For value net (outputSize==1): MSE loss, tanh output
    //   dL/dz = (a - y) * tanh'(z)
    // For policy net (softmax + cross-entropy):
    //   dL/dz = a - y  (softmax + CE gradient simplifies nicely)
    let delta = new Array(outputSize);
    const aOut = as[this.numLayers];
    const zOut = zs[this.numLayers - 1];

    if (outputSize === 1) {
      delta[0] = (aOut[0] - target[0]) * tanhGrad(zOut[0]);
    } else {
      for (let i = 0; i < outputSize; i++) {
        delta[i] = aOut[i] - target[i];
      }
    }

    // Backprop through layers
    for (let l = this.numLayers - 1; l >= 0; l--) {
      const fanIn = this.layerSizes[l];
      const fanOut = this.layerSizes[l + 1];
      const aIn = as[l];
      const W = this.weights[l];
      const b = this.biases[l];

      // Gradient for W and b
      for (let i = 0; i < fanOut; i++) {
        b[i] -= learningRate * delta[i];
        const row = i * fanIn;
        for (let j = 0; j < fanIn; j++) {
          W[row + j] -= learningRate * delta[i] * aIn[j];
        }
      }

      // Propagate delta to previous layer (if not input layer)
      if (l > 0) {
        const prevZ = zs[l - 1];
        const newDelta = new Array(fanIn).fill(0);
        for (let j = 0; j < fanIn; j++) {
          let sum = 0;
          for (let i = 0; i < fanOut; i++) {
            sum += W[i * fanIn + j] * delta[i];
          }
          newDelta[j] = sum * reluGrad(prevZ[j]);
        }
        delta = newDelta;
      }
    }
  }

  getWeights() {
    return {
      layerSizes: this.layerSizes,
      weights: this.weights.map(w => Array.from(w)),
      biases: this.biases.map(b => Array.from(b)),
    };
  }

  setWeights(obj) {
    this.layerSizes = obj.layerSizes;
    this.numLayers = obj.layerSizes.length - 1;
    this.weights = obj.weights.map(w => new Float64Array(w));
    this.biases = obj.biases.map(b => new Float64Array(b));
  }

  save(filepath) {
    fs.writeFileSync(filepath, JSON.stringify(this.getWeights()), 'utf8');
  }

  load(filepath) {
    const obj = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    this.setWeights(obj);
  }
}

// ---

class PolicyNet extends NeuralNet {
  constructor() {
    super([9, 32, 6]);
  }

  // Sample action from softmax distribution
  // Returns { action: index, logProb: number }
  sampleAction(stateArray) {
    const probs = this.forward(stateArray);
    const r = Math.random();
    let cumulative = 0;
    let action = probs.length - 1;
    for (let i = 0; i < probs.length; i++) {
      cumulative += probs[i];
      if (r < cumulative) {
        action = i;
        break;
      }
    }
    const logProb = Math.log(Math.max(probs[action], 1e-10));
    return { action, logProb };
  }
}

// ---

const VALUE_SCALE = 1000;

class ValueNet extends NeuralNet {
  constructor() {
    super([9, 32, 1]);
  }

  // Returns scalar value (tanh output scaled by VALUE_SCALE)
  getValue(stateArray) {
    const out = this.forward(stateArray);
    return out[0] * VALUE_SCALE;
  }
}

// ---

module.exports = { NeuralNet, PolicyNet, ValueNet };
