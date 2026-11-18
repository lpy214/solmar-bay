// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot that
// plans a route along the road grid and drives it (steering toward the next intersection,
// slowing for sharp turns), so the frame is what a short game really looks like and the same
// seed always gives the same frame.

import { ROADS_X, ROADS_Y, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const DRIVE_SECONDS = 8;
const CHASE_SECONDS = 14;
const MISSION_SECONDS = 8;

function nearestRoad(value, roads) {
  let best = roads[0];
  for (const road of roads) if (Math.abs(road - value) < Math.abs(best - value)) best = road;
  return best;
}

/** Waypoints along the road grid from (fromX, fromY) to (toX, toY): nearest intersection,
// then along the grid to the intersection nearest the target, then the target itself. */
function planRoute(fromX, fromY, toX, toY) {
  const ax = nearestRoad(fromX, ROADS_X);
  const ay = nearestRoad(fromY, ROADS_Y);
  const bx = nearestRoad(toX, ROADS_X);
  const by = nearestRoad(toY, ROADS_Y);
  return [
    { x: ax, y: ay },
    { x: bx, y: ay },
    { x: bx, y: by },
    { x: toX, y: toY },
  ];
}

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Driving controls for a car chasing a waypoint list; advances the waypoint when reached. */
function makeDriver() {
  let waypoints = [];
  let index = 0;
  let stuckTime = 0;
  let reverseTime = 0;
  return {
    setRoute(points) {
      waypoints = points;
      index = 0;
      stuckTime = 0;
      reverseTime = 0;
    },
    controls(car, dt) {
      const start = index === 0 ? waypoints[0] : waypoints[index - 1];
      const end = waypoints[Math.min(index, waypoints.length - 1)];
      const dx = end.x - car.x;
      const dy = end.y - car.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 70) index = Math.min(index + 1, waypoints.length - 1);
      // Pure pursuit: aim at a point 130 ahead along the current road segment, so the car
      // rejoins the road's centreline instead of grinding along a building's edge.
      const segX = end.x - start.x;
      const segY = end.y - start.y;
      const segLen2 = segX * segX + segY * segY || 1;
      const segLen = Math.sqrt(segLen2);
      let t = ((car.x - start.x) * segX + (car.y - start.y) * segY) / segLen2;
      t = Math.max(0, Math.min(1, t));
      const aimX = start.x + segX * t + (segX / segLen) * 130;
      const aimY = start.y + segY * t + (segY / segLen) * 130;
      const desired = Math.atan2(aimY - car.y, aimX - car.x);
      const diff = angleDiff(car.angle, desired);
      const speed = car.speed;
      const aim = {
        aimX: car.x + Math.cos(car.angle) * 100,
        aimY: car.y + Math.sin(car.angle) * 100,
        shoot: false, punch: false, enter: false, buyHealth: false, buyAmmo: false,
      };
      // Stuck against a wall or a patrol car: back out for a moment, steering the nose the
      // same way (steering inverts while reversing).
      if (reverseTime > 0) {
        reverseTime -= dt;
        return { ...aim, up: false, down: true, left: diff > 0, right: diff <= 0 };
      }
      if (Math.abs(speed) < 30) {
        stuckTime += dt;
        if (stuckTime > 1.2) {
          stuckTime = 0;
          reverseTime = 0.9;
          return { ...aim, up: false, down: true, left: diff > 0, right: diff <= 0 };
        }
      } else {
        stuckTime = 0;
      }
      const controls = { ...aim, up: false, down: false, left: false, right: false };
      // Slow for the corner, and never rush a turn while facing the wrong way: hold the
      // speed down until the nose is roughly on the road, so a 90-degree turn stays inside
      // the road instead of arcing wide into the buildings on the corner.
      if (distance < 130 && Math.abs(speed) > 60) {
        controls.down = true;
      } else if (Math.abs(diff) > 0.55) {
        controls.up = Math.abs(speed) < 110;
      } else {
        controls.up = true;
      }
      if (diff > 0.05) controls.right = true;
      else if (diff < -0.05) controls.left = true;
      return controls;
    },
  };
}

/** Put the player in a car parked on a road, ready to drive. */
function putPlayerInCar(world, x, y, angle) {
  const state = world.state;
  const car = state.cars.find((c) => c.kind === 'parked');
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  car.kind = 'player';
  car.driver = 'player';
  car.color = '#e5534b'; // the player's car stands out from traffic
  state.player.inCar = car;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  state.camera.x = x;
  state.camera.y = y;
}

/** Clear the mission briefing so the world steps instead of holding still for it. */
function clearBriefing(world) {
  world.state.briefing = null;
  world.state.briefingTimer = 0;
}

/**
 * Set `world` to the named scene (start, drive, chase or mission; any other name is start) and
 * return the screen to draw over it and the best cash to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  clearBriefing(world);
  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, null, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }

  if (name === 'drive') {
    putPlayerInCar(world, 400, 2000, -Math.PI / 2);
    world.startMission(1);
    clearBriefing(world);
    const driver = makeDriver();
    driver.setRoute(planRoute(400, 2000, 2960, 620));
    for (let index = 0; index < DRIVE_SECONDS / STEP; index += 1) {
      const car = state.player.inCar;
      if (!car) break;
      world.step(STEP, driver.controls(car, STEP), false);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'chase') {
    putPlayerInCar(world, 1600, 1200, 0);
    // Lay Low: three stars and the patrols already on the tail, which is what this shot is.
    world.startMission(2);
    clearBriefing(world);
    const driver = makeDriver();
    driver.setRoute(planRoute(1600, 1200, 2400, 400));
    let replan = 0;
    for (let index = 0; index < CHASE_SECONDS / STEP; index += 1) {
      const car = state.player.inCar;
      if (!car) break;
      replan -= STEP;
      if (replan <= 0) {
        // Flee away from the nearest patrol car, but only when one is close: replanning on
        // every pass would keep turning the car around instead of letting it drive.
        let nearest = null;
        let nearestD = Infinity;
        for (const other of state.cars) {
          if (other.kind !== 'police') continue;
          const d = Math.hypot(other.x - car.x, other.y - car.y);
          if (d < nearestD) { nearestD = d; nearest = other; }
        }
        if (nearest && nearestD < 420) {
          const away = Math.atan2(car.y - nearest.y, car.x - nearest.x);
          const tx = Math.max(300, Math.min(2900, car.x + Math.cos(away) * 900));
          const ty = Math.max(300, Math.min(2100, car.y + Math.sin(away) * 900));
          driver.setRoute(planRoute(car.x, car.y, tx, ty));
        }
        replan = 2;
      }
      world.step(STEP, driver.controls(car, STEP), false);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }

  // mission: the package delivery, driving toward the harbour marker — still in progress,
  // so the shot starts far enough out that the car cannot reach the docks in the time given.
  putPlayerInCar(world, 400, 1600, 0);
  world.startMission(1);
  clearBriefing(world);
  const driver = makeDriver();
  driver.setRoute(planRoute(400, 1600, 2960, 620));
  for (let index = 0; index < MISSION_SECONDS / STEP; index += 1) {
    const car = state.player.inCar;
    if (!car) break;
    world.step(STEP, driver.controls(car, STEP), false);
  }
  return { screen: SCREEN_PLAY, best: 0 };
}
