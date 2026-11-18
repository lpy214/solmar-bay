// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens: title, play, paused and game over (busted or wasted).
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.
import { BEST_CASH_KEY, MISSION_KEY, STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION, EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT,
  EVENT_WASTED,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
window.__world = world; // debug handle: lets a test page read the world state
const renderer = createRenderer(canvas);
const audio = createAudio();

function readNumber(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveNumber(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const info = { objective: world.missionObjective() };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, info);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readNumber(BEST_CASH_KEY);
  let bestMission = readNumber(MISSION_KEY);
  let overReason = 'wasted';
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  /** Turn the mouse's logical position into the world point it aims at, through the camera. */
  function worldAim() {
    const mouse = input.mouse();
    const player = world.state.player;
    const zoom = player.inCar ? 0.82 : 1.0;
    const camera = world.state.camera;
    return {
      x: camera.x + (mouse.x - VIEW.width / 2) / zoom,
      y: camera.y + (mouse.y - VIEW.height / 2) / zoom,
    };
  }

  function buildControls() {
    const movement = input.movement();
    const edges = input.takeEdges();
    const aim = worldAim();
    return {
      up: movement.up,
      down: movement.down,
      left: movement.left,
      right: movement.right,
      aimX: aim.x,
      aimY: aim.y,
      shoot: input.shooting(),
      punch: edges.punch,
      enter: edges.enter,
      buyHealth: edges.buyHealth,
      buyAmmo: edges.buyAmmo,
    };
  }

  function saveProgress() {
    const cash = world.state.player.cash;
    if (cash > best) {
      best = cash;
      saveNumber(BEST_CASH_KEY, best);
    }
    if (world.state.missionIndex > bestMission) {
      bestMission = world.state.missionIndex;
      saveNumber(MISSION_KEY, bestMission);
    }
  }

  function startGame() {
    world.reset();
    audio.unlock();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Steal a car to start the first mission.');
  }

  function endGame(reason) {
    overReason = reason;
    screen = SCREEN_OVER;
    saveProgress();
    audio.busted();
    announce(reason === 'busted'
      ? `Busted. Cash kept $${world.state.player.cash}. Best $${best}.`
      : `Wasted. Cash kept $${world.state.player.cash}. Best $${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      audio.unlock();
      audio.click();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function react(events) {
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_CRASH) audio.crash(0.6);
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISSION) {
      audio.mission();
      saveProgress();
    }
    if (events & EVENT_BUSTED) endGame('busted');
    else if (events & EVENT_WASTED) endGame('wasted');
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null, true);
      return;
    }
    const events = world.step(STEP, buildControls(), false);
    react(events);
    const player = world.state.player;
    audio.setEngine(player.inCar ? Math.abs(player.inCar.speed) / 430 : 0);
    audio.setSiren(world.state.wanted > 0, STEP);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, {
      objective: world.missionObjective(),
      overReason,
    });
  }

  // Leaving the tab pauses a running game rather than letting the patrols close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
