'use strict';

const { SimState } = require('./sim.cjs');
const ACTION_COUNT = SimState.ACTION_COUNT; // 6

// ─── MCTSNode ─────────────────────────────────────────────────────────────────

class MCTSNode {
  constructor(state, parent, action, prior) {
    this.state      = state;   // SimState clone
    this.parent     = parent;  // MCTSNode | null
    this.action     = action;  // action taken to reach this node
    this.prior      = prior;   // policy prior probability

    this.visits  = 0;
    this.value   = 0;          // cumulative value (sum, not mean)
    this.children = new Map(); // action -> MCTSNode
    this.isExpanded = false;
  }

  // UCB1 with prior: Q + cPuct * P * sqrt(N_parent) / (1 + n)
  ucbScore(cPuct = 1.5) {
    const Q = this.visits > 0 ? this.value / this.visits : 0;
    const parentVisits = this.parent ? this.parent.visits : 1;
    return Q + cPuct * this.prior * Math.sqrt(parentVisits) / (1 + this.visits);
  }

  // Create one child per action, priors from policy net
  expand(policyNet) {
    if (this.isExpanded) return;
    this.isExpanded = true;

    const obs   = this.state.getState();
    const probs = policyNet.forward(obs); // softmax array[6]

    for (let a = 0; a < ACTION_COUNT; a++) {
      const childState = this.state.clone();
      childState.step(a); // advance state by one action
      this.children.set(a, new MCTSNode(childState, this, a, probs[a]));
    }
  }

  // Walk up tree, accumulating value
  backup(value) {
    let node = this;
    while (node !== null) {
      node.visits += 1;
      node.value  += value;
      node = node.parent;
    }
  }
}

// ─── MCTS ─────────────────────────────────────────────────────────────────────

class MCTS {
  constructor(policyNet, valueNet, {
    numSimulations = 50,
    cPuct          = 1.5,
    maxRolloutDepth = 30,
  } = {}) {
    this.policyNet       = policyNet;
    this.valueNet        = valueNet;
    this.numSimulations  = numSimulations;
    this.cPuct           = cPuct;
    this.maxRolloutDepth = maxRolloutDepth;
  }

  // Returns normalized visit-count distribution (array of ACTION_COUNT floats)
  search(state) {
    const root = new MCTSNode(state.clone(), null, null, 1.0);

    for (let i = 0; i < this.numSimulations; i++) {
      this._simulate(root);
    }

    // Build visit distribution
    const visits = new Array(ACTION_COUNT).fill(0);
    for (const [action, child] of root.children) {
      visits[action] = child.visits;
    }

    const total = visits.reduce((s, v) => s + v, 0);
    return total > 0 ? visits.map(v => v / total) : visits.map(() => 1 / ACTION_COUNT);
  }

  // Selection → Expansion → Evaluation → Backup
  _simulate(root) {
    // ── Selection ──────────────────────────────────────────────────────────────
    let node = root;
    while (node.isExpanded && !node.state.done) {
      // Pick child with highest UCB score
      let bestScore = -Infinity;
      let bestChild = null;
      for (const child of node.children.values()) {
        const score = child.ucbScore(this.cPuct);
        if (score > bestScore) {
          bestScore = score;
          bestChild = child;
        }
      }
      if (bestChild === null) break;
      node = bestChild;
    }

    // ── Terminal check ─────────────────────────────────────────────────────────
    if (node.state.done) {
      node.backup(0);
      return;
    }

    // ── Expansion ──────────────────────────────────────────────────────────────
    node.expand(this.policyNet);

    // ── Evaluation ─────────────────────────────────────────────────────────────
    // Use value net (O(1)) when available; fall back to rollout otherwise
    let value;
    try {
      value = this.valueNet.getValue(node.state.getState());
      // Normalize to roughly [-1, 1] range (VALUE_SCALE is 1000 in net.cjs)
      value = Math.tanh(value / 1000);
    } catch (_) {
      value = simpleRollout(node.state, this.maxRolloutDepth, this.policyNet) / 1000;
      value = Math.tanh(value);
    }

    // ── Backup ─────────────────────────────────────────────────────────────────
    node.backup(value);
  }
}

// ─── simpleRollout ────────────────────────────────────────────────────────────

/**
 * Run `steps` forward from a cloned state using greedy (argmax) policy.
 * Returns total accumulated reward.
 */
function simpleRollout(state, steps, policyNet) {
  const s = state.clone();
  let totalReward = 0;

  for (let i = 0; i < steps; i++) {
    if (s.done) break;

    const obs   = s.getState();
    const probs = policyNet.forward(obs);

    // Greedy: pick argmax
    let bestAction = 0;
    let bestProb   = -Infinity;
    for (let a = 0; a < probs.length; a++) {
      if (probs[a] > bestProb) {
        bestProb   = probs[a];
        bestAction = a;
      }
    }

    const { reward } = s.step(bestAction);
    totalReward += reward;
  }

  return totalReward;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { MCTSNode, MCTS, simpleRollout };
