# Super Mario Dumb Clone

A small browser-based Super Mario-style clone with a built-in AI mode and local learner.

## What is included

- Core game loop and rendering on `canvas`
- Mario movement, collisions, goombas, scoring, win/death states
- `AI Mode` toggle in the UI
- Browser-side online policy learning (updates while AI plays)
- Offline trainer scripts in `ai-learner/` for pretraining weights

## Project structure

- `index.html` - app entrypoint and AI toggle UI
- `game.js` - game state, loop, HUD, input wiring
- `mario.js` - Mario movement/physics/rendering
- `level.js` - level layout and tile collision
- `entities.js` - goombas, collisions, coin effects
- `ai-learner/ai-brain.js` - browser AI controller + online learning
- `ai-learner/train.cjs` - offline training script
- `ai-learner/sim.cjs` - simulation environment for training
- `ai-learner/net.cjs` - policy/value network implementation
- `ai-learner/mcts.cjs` - MCTS helper used by trainer
- `ai-learner/weights.json` - saved offline-trained weights

## Run the game

Use any static file server from project root.

Example:

```bash
npx serve .
```

Then open the served URL and start the game.

## Controls

- `ArrowLeft` / `ArrowRight`: move
- `ArrowUp` or `Space`: jump
- `Enter`: start/retry
- `AI Mode` button: toggle AI control

## AI mode behavior

When AI mode is ON:

- It attempts to load `ai-learner/weights.json`
- It plays episodes continuously (auto-restarts on death/win)
- It trains online after episodes using policy-gradient updates
- It persists learned policy to `localStorage` (`AIBrainPolicy_v1`)

Status bar fields:

- `Episode`: episodes played
- `Trained`: episodes used for updates
- `eps`: exploration rate
- `Last R`: last episode return
- `Best score`: best in-session score

## Offline training

Train from Node:

```bash
node ai-learner/train.cjs --episodes 200
```

Resume from existing weights:

```bash
node ai-learner/train.cjs --episodes 200 --resume
```

This writes `ai-learner/weights.json`, which browser AI mode can load.

## Notes

- If the AI seems unchanged after updates, hard-refresh the browser.
- Online-learned policy is stored in browser `localStorage`, not written back to `weights.json`.
