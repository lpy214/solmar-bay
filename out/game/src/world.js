// Solmar Bay's rules and state, with no drawing and no browser in it: the city grid, the
// player's car and foot movement, traffic and pedestrian AI, police chases, the wanted level,
// combat, pickups, particles and the five-mission story. step() advances one fixed step and
// returns what happened as bit flags, so the caller can react (sound, announcements) without
// the world knowing about screens or audio. The city layout is built once from the seed; reset()
// only restarts the dynamic state, so the same seed always gives the same city.

import {
  BEACH, CAR, HARBOUR, MISSIONS, PARK, PICKUP, PLAYER, POLICE, ROADS_X, ROADS_Y, ROAD_WIDTH,
  LANE, PEDS, SHOP, STEP, TRAFFIC, WANTED, WORLD,
} from './config.js';
import { pick, range } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_SHOT = 2;
export const EVENT_CRASH = 4;
export const EVENT_PICKUP = 8;
export const EVENT_MISSION = 16;
export const EVENT_BUSTED = 32;
export const EVENT_WASTED = 64;
export const EVENT_CRIME = 128;
export const EVENT_PUNCH = 256;

const TAU = Math.PI * 2;
const CAR_COLORS = ['#7fb3d5', '#d5a37f', '#8fd07f', '#c9c9c9', '#b07fd5', '#d57f7f', '#7fd5c9'];
const PED_COLORS = ['#e8e4d8', '#d8a37f', '#7fa8d5', '#c9d57f', '#d57fb0', '#8a8f96'];
const BUILDING_COLORS = ['#b08968', '#7d8aa0', '#a08a7d', '#8a9a7d', '#9a7d8a'];

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Circle vs rectangle: push the circle out and return the push vector and how deep it was. */
function circleRectPush(circle, rect) {
  const cx = clamp(circle.x, rect.x, rect.x + rect.w);
  const cy = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - cx;
  const dy = circle.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= circle.radius * circle.radius) return { x: 0, y: 0, depth: 0 };
  const d = Math.sqrt(d2) || 0.001;
  const push = circle.radius - d;
  const px = (dx / d) * push;
  const py = (dy / d) * push;
  circle.x += px;
  circle.y += py;
  return { x: px, y: py, depth: push };
}

function nearestRoad(value, roads) {
  let best = roads[0];
  for (const road of roads) if (Math.abs(road - value) < Math.abs(best - value)) best = road;
  return best;
}

export function createWorld(random) {
  // ---- the city, built once from the seed -------------------------------------
  const solids = [];
  const trees = [];
  for (let ix = 0; ix < ROADS_X.length - 1; ix += 1) {
    for (let iy = 0; iy < ROADS_Y.length - 1; iy += 1) {
      const x0 = ROADS_X[ix] + ROAD_WIDTH / 2 + 16;
      const x1 = ROADS_X[ix + 1] - ROAD_WIDTH / 2 - 16;
      const y0 = ROADS_Y[iy] + ROAD_WIDTH / 2 + 16;
      const y1 = ROADS_Y[iy + 1] - ROAD_WIDTH / 2 - 16;
      if (x0 < BEACH.x1 || x1 > HARBOUR.x0) continue; // beach and harbour blocks stay open
      if (x0 >= PARK.x && x0 < PARK.x + PARK.w && y0 >= PARK.y && y0 < PARK.y + PARK.h) {
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: range(random, PARK.x + 20, PARK.x + PARK.w - 20), y: range(random, PARK.y + 20, PARK.y + PARK.h - 20), r: range(random, 10, 18) });
        }
        continue; // the park block is green, no buildings
      }
      const bw = x1 - x0;
      const bh = y1 - y0;
      const color = pick(random, BUILDING_COLORS);
      if (random() < 0.45) {
        solids.push({ x: x0 + 8, y: y0 + 8, w: bw * 0.42, h: bh - 16, color, kind: 'building' });
        solids.push({ x: x0 + bw * 0.56, y: y0 + 8, w: bw * 0.4, h: bh - 16, color: pick(random, BUILDING_COLORS), kind: 'building' });
      } else {
        solids.push({ x: x0 + bw * 0.12, y: y0 + bh * 0.14, w: bw * 0.76, h: bh * 0.72, color, kind: 'building' });
      }
    }
  }
  // Harbour containers, in rows along the docks.
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      if (random() < 0.25) continue;
      solids.push({
        x: 2920 + col * 42, y: 480 + row * 340 + range(random, -20, 20),
        w: 34, h: 120, color: pick(random, ['#c25e3a', '#3a7d9e', '#7d9e3a', '#9e8a3a']), kind: 'container',
      });
    }
  }
  // Palm trees along the beach promenade.
  for (let y = 200; y < WORLD.height; y += 160) {
    trees.push({ x: 300 + range(random, -14, 14), y: y + range(random, -30, 30), r: 12, palm: true });
  }

  // ---- dynamic state -----------------------------------------------------------
  const player = {
    x: 560, y: 560, angle: 0, health: PLAYER.health, cash: 0, ammo: 24,
    inCar: null, punchTimer: 0, shootTimer: 0, invuln: 0, moving: false,
    radius: PLAYER.radius, // collideSolids reads circle.radius: without it the push is NaN
  };
  const cars = [];
  const peds = [];
  const bullets = [];
  const particles = [];
  const pickups = [];
  const state = {
    player, cars, peds, bullets, particles, pickups, solids, trees,
    wanted: 0, wantedTimer: 0, bustedTimer: 0, busted: false, wasted: false,
    missionIndex: 0, missionStage: 0, missionTimer: 0, missionCollected: 0,
    missionTarget: null, missionDone: false, missionName: '',
    briefing: null, briefingTimer: 0, toast: null, toastTimer: 0,
    clockMinutes: 9 * 60, elapsed: 0, attract: false,
    camera: { x: 560, y: 560 }, shake: 0, cashEarned: 0, policeTimer: 0,
  };

  function addParticles(x, y, count, color, speed, life) {
    for (let i = 0; i < count; i += 1) {
      if (particles.length > 420) return;
      const a = random() * TAU;
      const s = range(random, speed * 0.3, speed);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: range(random, life * 0.5, life), maxLife: life, color, size: range(random, 2, 5) });
    }
  }

  function spawnCar(kind, x, y, angle) {
    const car = {
      x, y, angle, speed: 0, health: CAR.health, kind, driver: 'none',
      color: kind === 'police' ? '#2f6fd0' : pick(random, CAR_COLORS),
      axis: 'x', road: nearestRoad(y, ROADS_Y), dir: random() < 0.5 ? 1 : -1,
      turnCooldown: 0, stuckTimer: 0, radius: CAR.radius, sirenPhase: random() * TAU,
    };
    if (kind === 'traffic') {
      car.driver = 'ai';
      car.speed = range(random, TRAFFIC.minSpeed, TRAFFIC.maxSpeed);
      car.axis = random() < 0.5 ? 'x' : 'y';
      if (car.axis === 'x') {
        car.road = pick(random, ROADS_Y);
        car.y = car.road + LANE * car.dir;
      } else {
        car.road = pick(random, ROADS_X);
        car.x = car.road + LANE * car.dir;
      }
      car.angle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    cars.push(car);
    return car;
  }

  function spawnPed(x, y) {
    const road = pick(random, ROADS_X);
    const px = x ?? road + (ROAD_WIDTH / 2 + 14) * (random() < 0.5 ? 1 : -1);
    const py = y ?? range(random, 200, WORLD.height - 200);
    peds.push({
      x: px, y: py, angle: random() * TAU, speed: range(random, PEDS.minSpeed, PEDS.maxSpeed),
      state: 'walk', timer: range(random, 0, 3), tx: px, ty: py,
      color: pick(random, PED_COLORS), radius: 11,
    });
  }

  function addPickup(kind, x, y) {
    pickups.push({ kind, x, y, active: true, respawn: 0 });
  }

  function addWanted(amount) {
    if (state.wanted >= WANTED.max) return;
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    state.wantedTimer = 0;
  }

  function setToast(text, seconds) {
    state.toast = text;
    state.toastTimer = seconds || 3;
  }

  function missionObjective() {
    switch (state.missionIndex) {
      case 0: return 'Steal a car — walk up to one and press E';
      case 1: return `Deliver the package to the harbour — ${Math.ceil(state.missionTimer)}s left`;
      case 2: return 'Lay low — lose the heat until the stars are gone';
      case 3: return `Collect the cash drops — ${state.missionCollected} / 6`;
      case 4: return state.missionStage === 0
        ? 'Harbour heist — grab the loot at the docks'
        : 'Harbour heist — reach the beach escape point';
      default: return 'Solmar Bay is yours — free roam';
    }
  }

  function startMission(index) {
    state.missionIndex = index;
    state.missionStage = 0;
    state.missionCollected = 0;
    state.missionTimer = MISSIONS[index].timeLimit || 0;
    state.missionName = MISSIONS[index].name;
    if (index === 1) state.missionTarget = { x: 2960, y: 620 };
    else if (index === 2) {
      // The delivery put the whole bay on alert: three stars to lose.
      state.wanted = 3;
      state.wantedTimer = 0;
      state.missionTarget = null;
    } else if (index === 3) {
      state.missionTarget = null;
      const spots = [[700, 1500], [1500, 500], [2300, 1100], [1100, 1900], [2600, 1800], [1800, 900]];
      for (const [x, y] of spots) addPickup('cash', x, y);
    } else if (index === 4) state.missionTarget = { x: 3000, y: 1500 };
    else state.missionTarget = null;
    const briefings = [
      ['Hot Wheels', 'Dante Vega is back in Solmar Bay, broke and on foot.', 'The crew needs wheels. Take any car on the street.'],
      ['The Package', 'A sealed package, a harbour buyer, and a clock that hates you.', 'Drive it east to the docks before time runs out.'],
      ['Lay Low', 'That delivery put every patrol car in the bay on your tail.', 'Stay out of trouble until the heat dies down.'],
      ['Cash Grab', 'The crew stashed six cash drops around the city.', 'Pick them all up. Cops hate a rich man on foot.'],
      ['Harbour Heist', 'One last job: the harbour warehouse, then vanish.', 'Grab the loot, then reach the beach escape point.'],
    ];
    state.briefing = { title: briefings[index][0], lines: [briefings[index][1], briefings[index][2]] };
    state.briefingTimer = 4.5;
  }

  function completeMission() {
    const reward = MISSIONS[state.missionIndex].reward;
    player.cash += reward;
    state.cashEarned += reward;
    setToast(`${state.missionName} complete — +$${reward}`, 4);
    state.missionIndex += 1;
    if (state.missionIndex >= MISSIONS.length) {
      state.missionDone = true;
      state.missionTarget = null;
      setToast('Story complete — Solmar Bay is yours', 5);
      return EVENT_MISSION;
    }
    startMission(state.missionIndex);
    return EVENT_MISSION;
  }

  function reset() {
    player.x = 560; player.y = 560; player.angle = 0;
    player.health = PLAYER.health; player.cash = 0; player.ammo = 24;
    player.inCar = null; player.punchTimer = 0; player.shootTimer = 0; player.invuln = 0;
    cars.length = 0; peds.length = 0; bullets.length = 0; particles.length = 0; pickups.length = 0;
    state.wanted = 0; state.wantedTimer = 0; state.bustedTimer = 0;
    state.busted = false; state.wasted = false; state.missionDone = false;
    state.clockMinutes = 9 * 60; state.elapsed = 0; state.shake = 0; state.cashEarned = 0;
    state.camera.x = 560; state.camera.y = 560;
    spawnCar('parked', 660, 620, 0);
    spawnCar('parked', 720, 560, Math.PI / 2);
    spawnCar('parked', 560, 700, Math.PI);
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnCar('traffic');
    for (let i = 0; i < PEDS.count; i += 1) spawnPed();
    addPickup('health', 1000, 1000);
    addPickup('health', 2200, 1400);
    addPickup('ammo', 1400, 1800);
    addPickup('ammo', 2400, 600);
    addPickup('cash', 900, 1900);
    addPickup('cash', 2100, 900);
    startMission(0);
  }

  function collideSolids(circle) {
    let hit = { x: 0, y: 0, depth: 0 };
    for (const solid of solids) {
      const push = circleRectPush(circle, solid);
      if (push.depth > 0) {
        hit.x += push.x;
        hit.y += push.y;
        hit.depth = Math.max(hit.depth, push.depth);
      }
    }
    circle.x = clamp(circle.x, 20, WORLD.width - 20);
    circle.y = clamp(circle.y, 20, WORLD.height - 20);
    return hit;
  }

  function updateTrafficCar(car, dt) {
    if (car.kind !== 'traffic') return;
    car.turnCooldown = Math.max(0, car.turnCooldown - dt);
    const speed = car.speed;
    if (car.axis === 'x') {
      car.x += car.dir * speed * dt;
      car.y = car.road + LANE * car.dir;
      for (const rx of ROADS_X) {
        if (Math.abs(car.x - rx) < speed * dt + 2 && car.turnCooldown === 0 && random() < TRAFFIC.turnChance) {
          car.axis = 'y'; car.road = rx; car.dir = random() < 0.5 ? 1 : -1;
          car.x = rx + LANE * car.dir; car.turnCooldown = 1.5;
          break;
        }
      }
      car.angle = car.dir > 0 ? 0 : Math.PI;
      if (car.x < -60) car.x = WORLD.width + 40;
      if (car.x > WORLD.width + 60) car.x = -40;
    } else {
      car.y += car.dir * speed * dt;
      car.x = car.road + LANE * car.dir;
      for (const ry of ROADS_Y) {
        if (Math.abs(car.y - ry) < speed * dt + 2 && car.turnCooldown === 0 && random() < TRAFFIC.turnChance) {
          car.axis = 'x'; car.road = ry; car.dir = random() < 0.5 ? 1 : -1;
          car.y = ry + LANE * car.dir; car.turnCooldown = 1.5;
          break;
        }
      }
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (car.y < -60) car.y = WORLD.height + 40;
      if (car.y > WORLD.height + 60) car.y = -40;
    }
    // Gentle separation so traffic does not stack on one lane.
    for (const other of cars) {
      if (other === car || other.kind === 'parked') continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d > 0.01 && d < 44) {
        const push = (44 - d) / 2;
        const nx = (car.x - other.x) / d;
        const ny = (car.y - other.y) / d;
        car.x += nx * push; car.y += ny * push;
      }
    }
  }

  function updatePoliceCar(car, dt, events) {
    const target = player.inCar || player;
    const desired = Math.atan2(target.y - car.y, target.x - car.x);
    const diff = angleDiff(car.angle, desired);
    const turn = clamp(diff, -2.4 * dt, 2.4 * dt);
    car.angle += turn;
    car.speed = Math.min(POLICE.maxSpeed, car.speed + 300 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.sirenPhase += dt * 6;
    const hit = collideSolids(car);
    if (hit.depth > 0) car.speed *= 0.45;
    // Ram the player: on foot it hurts and builds the busted timer; in a car it crunches metal.
    const d = dist(car.x, car.y, target.x, target.y);
    if (d < CAR.radius + 16) {
      if (player.inCar) {
        const impact = Math.abs(car.speed);
        if (impact > 120) {
          player.inCar.health -= POLICE.ramDamage;
          state.shake = Math.max(state.shake, 6);
          addParticles(car.x, car.y, 8, '#ffd94a', 180, 0.4);
          events.value |= EVENT_CRASH;
          car.speed *= -0.3;
        }
      } else {
        state.bustedTimer += dt;
        if (player.invuln === 0) {
          player.health -= POLICE.ramDamage * dt * 3;
          player.invuln = 0.4;
        }
        if (state.bustedTimer > WANTED.bustedHold) {
          state.busted = true;
          events.value |= EVENT_BUSTED;
        }
      }
    } else {
      state.bustedTimer = Math.max(0, state.bustedTimer - dt * 2);
    }
    if (car.health <= 0) {
      car.kind = 'wreck';
      car.speed = 0;
      addParticles(car.x, car.y, 40, '#ff7a3a', 260, 0.9);
      addParticles(car.x, car.y, 20, '#555', 120, 1.4);
      state.shake = Math.max(state.shake, 10);
      events.value |= EVENT_CRASH;
    }
  }

  function updatePed(ped, dt) {
    if (ped.state === 'down') {
      ped.timer -= dt;
      if (ped.timer <= 0) { ped.state = 'flee'; ped.timer = 4; }
      return;
    }
    const threat = player.inCar || player;
    const dThreat = dist(ped.x, ped.y, threat.x, threat.y);
    if (ped.state === 'walk' && dThreat < 130 && (player.inCar || state.wanted > 0)) {
      ped.state = 'flee'; ped.timer = 3;
    }
    if (ped.state === 'flee') {
      ped.timer -= dt;
      const away = Math.atan2(ped.y - threat.y, ped.x - threat.x);
      ped.angle = away;
      ped.x += Math.cos(away) * ped.speed * 1.7 * dt;
      ped.y += Math.sin(away) * ped.speed * 1.7 * dt;
      if (ped.timer <= 0) ped.state = 'walk';
    } else {
      ped.timer -= dt;
      const d = dist(ped.x, ped.y, ped.tx, ped.ty);
      if (d < 12 || ped.timer <= 0) {
        const road = pick(random, ROADS_X);
        ped.tx = road + (ROAD_WIDTH / 2 + 14) * (random() < 0.5 ? 1 : -1);
        ped.ty = range(random, 200, WORLD.height - 200);
        ped.timer = range(random, 6, 14);
      } else {
        ped.angle = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
    }
    ped.x = clamp(ped.x, 20, WORLD.width - 20);
    ped.y = clamp(ped.y, 20, WORLD.height - 20);
    // The player's car running a pedestrian over is a crime.
    if (player.inCar && dist(ped.x, ped.y, player.inCar.x, player.inCar.y) < CAR.radius + ped.radius) {
      if (ped.state !== 'down') {
        ped.state = 'down'; ped.timer = 3.5;
        addWanted(WANTED.hitPed);
        addParticles(ped.x, ped.y, 12, '#ff5d5d', 160, 0.6);
        state.shake = Math.max(state.shake, 5);
        return 'crime';
      }
    }
    return null;
  }

  function updatePlayerCar(car, controls, dt, events) {
    const throttle = (controls.up ? 1 : 0) - (controls.down ? 1 : 0);
    const steer = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    if (throttle > 0) car.speed += CAR.accel * dt;
    else if (throttle < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.6) * dt;
    else car.speed -= car.speed * CAR.drag * dt;
    car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
    const speedFactor = clamp(Math.abs(car.speed) / CAR.maxSpeed, 0, 1);
    // A car that is barely moving can still swing its nose around (arcade handling): the turn
    // rate keeps a high floor at low speed instead of vanishing, so a slow 90-degree turn
    // stays inside the road instead of arcing wide into the buildings on the corner.
    const turnFactor = 0.5 + 0.5 * speedFactor;
    car.angle += steer * CAR.turnRate * turnFactor * Math.sign(car.speed) * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Skid marks and smoke when steering hard at speed.
    if (Math.abs(steer) > 0 && Math.abs(car.speed) > 260) {
      addParticles(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 1, '#333a40', 30, 0.5);
    }
    const hit = collideSolids(car);
    if (hit.depth > 0) {
      // Heading into the wall costs speed (and hurts at pace); sliding along it barely does.
      const intoWall = Math.cos(car.angle) * hit.x + Math.sin(car.angle) * hit.y < 0;
      if (Math.abs(car.speed) > 140 && intoWall) {
        car.health -= Math.abs(car.speed) * 0.04;
        player.health -= Math.abs(car.speed) * 0.02;
        state.shake = Math.max(state.shake, 7);
        addParticles(car.x, car.y, 10, '#ffd94a', 200, 0.5);
        events.value |= EVENT_CRASH;
        car.speed *= -0.35;
      } else if (intoWall && hit.depth > 3) {
        car.speed *= 0.6;
      } else {
        // A graze (or sliding along a wall) barely slows the car.
        car.speed *= 0.96;
      }
    }
    // Car-to-car crunch.
    for (const other of cars) {
      if (other === car || other.kind === 'parked') continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d > 0.01 && d < CAR.radius * 2) {
        const nx = (car.x - other.x) / d;
        const ny = (car.y - other.y) / d;
        const overlap = CAR.radius * 2 - d;
        car.x += nx * overlap / 2; car.y += ny * overlap / 2;
        other.x -= nx * overlap / 2; other.y -= ny * overlap / 2;
        const impact = Math.abs(car.speed - other.speed);
        if (impact > 160) {
          car.health -= impact * 0.03;
          other.health -= impact * 0.03;
          state.shake = Math.max(state.shake, 5);
          addParticles(car.x, car.y, 8, '#ffd94a', 180, 0.4);
          events.value |= EVENT_CRASH;
          car.speed *= 0.5;
        }
      }
    }
    if (car.health <= 0) {
      car.kind = 'wreck';
      car.speed = 0;
      addParticles(car.x, car.y, 40, '#ff7a3a', 260, 0.9);
      player.health -= 15;
      player.inCar = null;
      player.x = car.x + 40;
      player.y = car.y;
      state.shake = Math.max(state.shake, 12);
      events.value |= EVENT_CRASH;
      setToast('Your car is wrecked', 3);
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
  }

  function updatePlayerFoot(controls, dt, events) {
    const mx = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    const my = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);
    const len = Math.hypot(mx, my) || 1;
    player.moving = mx !== 0 || my !== 0;
    player.x += (mx / len) * PLAYER.walkSpeed * dt * (player.moving ? 1 : 0);
    player.y += (my / len) * PLAYER.walkSpeed * dt * (player.moving ? 1 : 0);
    player.angle = Math.atan2(controls.aimY - player.y, controls.aimX - player.x);
    collideSolids(player);
    if (player.punchTimer > 0) player.punchTimer -= dt;
    if (player.shootTimer > 0) player.shootTimer -= dt;
    if (player.invuln > 0) player.invuln -= dt;

    if (controls.shoot && player.shootTimer <= 0) {
      if (player.ammo > 0) {
        player.ammo -= 1;
        player.shootTimer = PLAYER.shootCooldown;
        const a = player.angle;
        bullets.push({ x: player.x + Math.cos(a) * 20, y: player.y + Math.sin(a) * 20, vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed, life: 1.1 });
        addParticles(player.x + Math.cos(a) * 24, player.y + Math.sin(a) * 24, 4, '#ffe066', 120, 0.2);
        events.value |= EVENT_SHOT;
      } else if (player.punchTimer <= 0) {
        doPunch(events);
      }
    }
    if (controls.punch && player.punchTimer <= 0) doPunch(events);

    if (controls.enter) {
      let best = null;
      let bestD = 78;
      for (const car of cars) {
        if (car.kind === 'wreck') continue;
        const d = dist(player.x, player.y, car.x, car.y);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (best) {
        if (best.kind === 'traffic') {
          best.driver = 'player';
          best.kind = 'player';
          addWanted(WANTED.steal);
          setToast('Car stolen — the heat is on', 3);
          events.value |= EVENT_CRIME;
        } else {
          best.kind = 'player';
          best.driver = 'player';
        }
        best.speed = 0;
        player.inCar = best;
        events.value |= EVENT_CRIME; // entering any car counts as the steal for mission 1's check
        if (state.missionIndex === 0) events.value |= completeMission();
      }
    }
    // Pickups on foot.
    for (const pickup of pickups) {
      if (!pickup.active) continue;
      if (dist(player.x, player.y, pickup.x, pickup.y) < 34) {
        pickup.active = false;
        pickup.respawn = 30;
        if (pickup.kind === 'health') player.health = Math.min(PLAYER.health, player.health + PICKUP.health);
        else if (pickup.kind === 'ammo') player.ammo += PICKUP.ammo;
        else if (pickup.kind === 'cash') {
          player.cash += PICKUP.cashValue;
          state.cashEarned += PICKUP.cashValue;
          if (state.missionIndex === 3) {
            state.missionCollected += 1;
            if (state.missionCollected >= 6) events.value |= completeMission();
          }
        }
        addParticles(pickup.x, pickup.y, 10, '#4ade80', 120, 0.5);
        events.value |= EVENT_PICKUP;
      }
    }
  }

  function doPunch(events) {
    player.punchTimer = PLAYER.punchCooldown;
    events.value |= EVENT_PUNCH;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const d = dist(player.x, player.y, ped.x, ped.y);
      if (d < PLAYER.punchRange) {
        ped.state = 'down'; ped.timer = 3;
        addWanted(WANTED.hitPed);
        addParticles(ped.x, ped.y, 8, '#ff5d5d', 140, 0.5);
        events.value |= EVENT_CRIME;
      }
    }
    for (const car of cars) {
      if (car.kind !== 'police') continue;
      if (dist(player.x, player.y, car.x, car.y) < PLAYER.punchRange + 14) {
        car.health -= PLAYER.punchDamage;
        events.value |= EVENT_CRIME;
      }
    }
  }

  function updateBullets(dt, events) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.x > WORLD.width || b.y < 0 || b.y > WORLD.height;
      if (!dead) {
        for (const solid of solids) {
          if (b.x > solid.x && b.x < solid.x + solid.w && b.y > solid.y && b.y < solid.y + solid.h) {
            addParticles(b.x, b.y, 5, '#ffd94a', 120, 0.3);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const ped of peds) {
          if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < ped.radius + 4) {
            ped.state = 'down'; ped.timer = 4;
            addWanted(WANTED.shoot);
            addParticles(b.x, b.y, 10, '#ff5d5d', 150, 0.5);
            events.value |= EVENT_CRIME;
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of cars) {
          if (car.kind === 'player' || car.kind === 'parked') continue;
          if (dist(b.x, b.y, car.x, car.y) < CAR.radius) {
            car.health -= PLAYER.bulletDamage;
            addParticles(b.x, b.y, 6, '#ffd94a', 140, 0.3);
            if (car.kind === 'police') addWanted(WANTED.shoot);
            dead = true;
            break;
          }
        }
      }
      if (dead) bullets.splice(i, 1);
    }
  }

  function updateMissions(dt, events) {
    if (state.missionDone) return;
    if (state.missionIndex === 1) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) {
        state.missionTimer = MISSIONS[1].timeLimit;
        setToast('Too slow — the buyer walked. Try again', 3);
        return;
      }
      if (state.missionTarget && dist(player.x, player.y, state.missionTarget.x, state.missionTarget.y) < 80) {
        events.value |= completeMission();
      }
    } else if (state.missionIndex === 4 && state.missionStage === 0) {
      if (state.missionTarget && dist(player.x, player.y, state.missionTarget.x, state.missionTarget.y) < 80) {
        state.missionStage = 1;
        state.missionTarget = { x: 200, y: 1200 };
        addWanted(4 - state.wanted > 0 ? 4 - state.wanted : 0);
        state.wanted = Math.max(state.wanted, 4);
        setToast('Loot grabbed — lose the cops and reach the beach', 4);
        events.value |= EVENT_MISSION;
      }
    } else if (state.missionIndex === 4 && state.missionStage === 1) {
      if (state.missionTarget && dist(player.x, player.y, state.missionTarget.x, state.missionTarget.y) < 90) {
        events.value |= completeMission();
      }
    }
  }

  function updateWanted(dt) {
    if (state.wanted > 0) {
      state.wantedTimer += dt;
      if (state.wantedTimer >= WANTED.decaySeconds) {
        state.wanted -= 1;
        state.wantedTimer = 0;
        if (state.wanted === 0) setToast('The heat is off', 3);
      }
    }
    // Keep the right number of patrol cars on the street.
    const want = Math.min(state.wanted, 4);
    let have = 0;
    for (const car of cars) if (car.kind === 'police') have += 1;
    state.policeTimer -= dt;
    if (have < want && state.policeTimer <= 0) {
      state.policeTimer = 2;
      for (let tries = 0; tries < 10; tries += 1) {
        const road = pick(random, ROADS_X);
        const x = road + LANE;
        const y = range(random, 300, WORLD.height - 300);
        if (dist(x, y, player.x, player.y) > 420 && dist(x, y, player.x, player.y) < 900) {
          const cop = spawnCar('police', x, y, 0);
          cop.speed = 200;
          break;
        }
      }
    }
    // Cops that fall far behind give up and leave.
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const car = cars[i];
      if (car.kind === 'police' && dist(car.x, car.y, player.x, player.y) > 1500) cars.splice(i, 1);
    }
  }

  /**
   * One fixed step. `controls` is the frame's input (null in attract mode). With `harmless`
   * set (the title screen's backdrop) traffic and pedestrians move but nothing can hurt the
   * player and no mission runs.
   */
  function step(dt, controls, harmless) {
    const events = { value: 0 };
    state.elapsed += dt;
    state.clockMinutes += dt; // one game minute per real second
    if (state.toastTimer > 0) {
      state.toastTimer -= dt;
      if (state.toastTimer <= 0) state.toast = null;
    }
    if (state.briefingTimer > 0) {
      state.briefingTimer -= dt;
      if (state.briefingTimer <= 0) state.briefing = null;
      return 0; // the briefing holds the world still
    }
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (const pickup of pickups) {
      if (!pickup.active) {
        pickup.respawn -= dt;
        if (pickup.respawn <= 0) pickup.active = true;
      }
    }
    for (const car of cars) {
      if (car.kind === 'traffic') updateTrafficCar(car, dt);
    }
    for (const ped of peds) {
      const result = updatePed(ped, dt);
      if (result === 'crime') events.value |= EVENT_CRIME;
    }
    if (harmless) {
      state.camera.x += (player.x - state.camera.x) * 0.02;
      state.camera.y += (player.y - state.camera.y) * 0.02;
      return 0;
    }

    if (controls) {
      if (player.inCar) {
        if (controls.enter) {
          const car = player.inCar;
          car.kind = 'parked';
          car.driver = 'none';
          car.speed *= 0.3;
          player.inCar = null;
          player.x = car.x + 42;
          player.y = car.y + 10;
        } else {
          updatePlayerCar(player.inCar, controls, dt, events);
        }
      } else {
        updatePlayerFoot(controls, dt, events);
      }
      if (controls.buyHealth && player.cash >= SHOP.healthCost && player.health < PLAYER.health) {
        player.cash -= SHOP.healthCost;
        player.health = Math.min(PLAYER.health, player.health + SHOP.healthAmount);
        events.value |= EVENT_PICKUP;
        setToast('Patched up — -$50', 2);
      }
      if (controls.buyAmmo && player.cash >= SHOP.ammoCost) {
        player.cash -= SHOP.ammoCost;
        player.ammo += SHOP.ammoAmount;
        events.value |= EVENT_PICKUP;
        setToast('Ammo restocked — -$30', 2);
      }
    }

    updateBullets(dt, events);
    for (const car of cars) {
      if (car.kind === 'police') updatePoliceCar(car, dt, events);
      else if (car.kind === 'wreck') { /* wrecks sit still and smoke */ }
    }
    updateWanted(dt);
    updateMissions(dt, events);

    // Mission 3 completes the moment the heat reaches zero.
    if (state.missionIndex === 2 && state.wanted === 0 && !state.missionDone) {
      events.value |= completeMission();
    }

    // Camera follows the player (or the car) smoothly; shake decays.
    const focus = player.inCar || player;
    state.camera.x += (focus.x - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (focus.y - state.camera.y) * Math.min(1, dt * 5);
    state.shake = Math.max(0, state.shake - dt * 22);

    if (player.health <= 0 && !state.wasted) {
      state.wasted = true;
      events.value |= EVENT_WASTED;
    }
    if (state.busted) events.value |= EVENT_BUSTED;
    return events.value;
  }

  reset();
  return {
    state,
    reset,
    step,
    startMission,
    missionObjective,
    addWanted,
    setToast,
  };
}
