'use strict';

const fs   = require('fs');
const path = require('path');

const { SimState }          = require('./sim.cjs');
const { PolicyNet, ValueNet } = require('./net.cjs');
const { MCTS }              = require('./mcts.cjs');

const ACTION_COUNT  = SimState.ACTION_COUNT; // 6
const WEIGHTS_PATH  = path.join(__dirname, 'weights.json');
const VALUE_SCALE   = 1000; // must match net.cjs

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let EPISODES = 200;
let RESUME   = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--episodes' && args[i + 1]) EPISODES = parseInt(args[++i], 10);
  if (args[i] === '--resume') RESUME = true;
}

// ─── Helper: sample from arbitrary probability distribution ───────────────────
function sampleFromDist(probs) {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < probs.length; i++) {
    cumulative += probs[i];
    if (r < cumulative) return i;
  }
  return probs.length - 1;
}

// ─── Episode collection ───────────────────────────────────────────────────────
// Returns { states, actions, rewards, totalReward, steps, win }
function collectEpisode(mcts, policyNet, episodeNum) {
  const state     = new SimState();
  const states    = [];   // Float32Array(9) per step
  const actions   = [];   // int per step
  const rewards   = [];   // float per step
  let totalReward = 0;
  let steps       = 0;
  const MAX_STEPS = 2000;

  while (!state.done && steps < MAX_STEPS) {
    const obs = state.getState();
    let action;

    if (episodeNum < 5) {
      // Early episodes: skip MCTS to warm up faster
      action = policyNet.sampleAction(obs).action;
    } else {
      // MCTS-guided: sample from visit-count distribution
      const visitDist = mcts.search(state);
      action = sampleFromDist(visitDist);
    }

    const { reward } = state.step(action);

    states.push(obs);
    actions.push(action);
    rewards.push(reward);
    totalReward += reward;
    steps++;
  }

  return { states, actions, rewards, totalReward, steps, win: state.win };
}

// ─── Compute discounted returns (gamma=0.99), then z-normalize ────────────────
// Returns { returns: number[], normalizedReturns: number[] }
function computeReturns(rewards, gamma = 0.99) {
  const n = rewards.length;
  const returns = new Array(n);
  let G = 0;
  for (let t = n - 1; t >= 0; t--) {
    G = rewards[t] + gamma * G;
    returns[t] = G;
  }

  const mean     = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std      = Math.sqrt(variance) + 1e-8;
  const normalizedReturns = returns.map(r => (r - mean) / std);

  return { returns, normalizedReturns };
}

// ─── Training step ────────────────────────────────────────────────────────────
function trainStep(policyNet, valueNet, episode, gamma = 0.99) {
  const { states, actions, rewards } = episode;
  const { returns, normalizedReturns } = computeReturns(rewards, gamma);

  const POLICY_LR = 0.001;
  const VALUE_LR  = 0.001;

  for (let t = 0; t < states.length; t++) {
    const obs       = states[t];
    const action    = actions[t];
    const normRet   = normalizedReturns[t];
    const actualRet = returns[t];

    // ── Policy: REINFORCE gradient ───────────────────────────────────────────
    // backward computes: delta = softmax(z) - target, then W -= lr * delta * x
    // With one-hot target and lr scaled by normRet:
    //   normRet > 0 → reinforce action (increase log-prob)
    //   normRet < 0 → discourage action (decrease log-prob)
    const policyTarget = new Array(ACTION_COUNT).fill(0);
    policyTarget[action] = 1;
    const effectivePolicyLR = POLICY_LR * normRet;
    if (Math.abs(effectivePolicyLR) > 1e-12) {
      policyNet.backward(obs, policyTarget, effectivePolicyLR);
    }

    // ── Value: MSE fit to normalized return (tanh-clamped to [-1, 1]) ────────
    // valueNet output is tanh(z), so target should live in (-1, 1).
    // We use tanh(actualReturn / VALUE_SCALE) to stay in that range while
    // preserving the sign and relative magnitude of returns.
    const valueTarget = [Math.tanh(actualRet / VALUE_SCALE)];
    valueNet.backward(obs, valueTarget, VALUE_LR);
  }
}

// ─── Weights I/O ──────────────────────────────────────────────────────────────
function saveWeights(policyNet, valueNet) {
  const obj = { policy: policyNet.getWeights(), value: valueNet.getWeights() };
  fs.writeFileSync(WEIGHTS_PATH, JSON.stringify(obj), 'utf8');
  process.stdout.write('  [saved weights.json]\n');
}

function loadWeights(policyNet, valueNet) {
  const obj = JSON.parse(fs.readFileSync(WEIGHTS_PATH, 'utf8'));
  policyNet.setWeights(obj.policy);
  valueNet.setWeights(obj.value);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const policyNet = new PolicyNet();
const valueNet  = new ValueNet();
const mcts      = new MCTS(policyNet, valueNet, { numSimulations: 20, maxRolloutDepth: 20 });

if (RESUME) {
  try {
    loadWeights(policyNet, valueNet);
    console.log('Resumed from weights.json');
  } catch (_) {
    console.log('No weights.json found — starting fresh');
  }
}

// Graceful Ctrl+C: save before exit
process.on('SIGINT', () => {
  console.log('\nInterrupted — saving weights...');
  saveWeights(policyNet, valueNet);
  process.exit(0);
});

console.log(`Training ${EPISODES} episodes  (MCTS sims=20, rolloutDepth=20)`);
const startTime = Date.now();

for (let ep = 0; ep < EPISODES; ep++) {
  const episode = collectEpisode(mcts, policyNet, ep);
  trainStep(policyNet, valueNet, episode);

  if (ep % 10 === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const flag    = episode.win ? ' WIN' : '';
    console.log(
      `ep=${String(ep).padStart(4)}  reward=${episode.totalReward.toFixed(1).padStart(8)}` +
      `  steps=${String(episode.steps).padStart(4)}${flag}  t=${elapsed}s`
    );
  }

  if ((ep + 1) % 50 === 0) {
    saveWeights(policyNet, valueNet);
  }
}

console.log('Training complete.');
saveWeights(policyNet, valueNet);
