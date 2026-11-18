// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 logical
// window is scaled to fit the browser window; inside it a camera follows the player through the
// 3200x2400 city, zooming out a little when driving. Flat shapes and canvas text: the HUD (cash,
// health, wanted stars, clock, mission objective), the minimap, and the title / pause /
// busted / wasted panels. Nothing here changes the world.

import {
  BEACH, CAR, FONT, HARBOUR, PALETTE, PARK, ROADS_X, ROADS_Y, ROAD_WIDTH, VIEW, WORLD,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const MINIMAP = { x: VIEW.width - 224, y: 16, w: 208, h: 156 };
const PANEL = { width: 780, top: 128, line: 32, bottom: 64 };

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    // Only override the baseline when the caller says so: the HUD sets 'top' once and the
    // helper must not silently reset it to 'alphabetic' (that clipped the cash and stars).
    if (baseline) context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawCity(state) {
    // Ground, sea and sand.
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    context.fillStyle = PALETTE.seaDeep;
    context.fillRect(0, 0, 240, WORLD.height);
    context.fillStyle = PALETTE.sea;
    context.fillRect(0, 0, 210, WORLD.height);
    context.fillStyle = PALETTE.sand;
    context.fillRect(240, 0, BEACH.x1 - 240, WORLD.height);
    context.fillStyle = PALETTE.seaDeep;
    context.fillRect(3120, 0, WORLD.width - 3120, WORLD.height);
    context.fillStyle = PALETTE.dock;
    context.fillRect(HARBOUR.x0, 0, 3120 - HARBOUR.x0, WORLD.height);
    // The park.
    context.fillStyle = PALETTE.park;
    context.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);

    // Sidewalks, then roads, then centre dashes.
    context.fillStyle = PALETTE.sidewalk;
    for (const rx of ROADS_X) context.fillRect(rx - ROAD_WIDTH / 2 - 10, 0, ROAD_WIDTH + 20, WORLD.height);
    for (const ry of ROADS_Y) context.fillRect(0, ry - ROAD_WIDTH / 2 - 10, WORLD.width, ROAD_WIDTH + 20);
    context.fillStyle = PALETTE.road;
    for (const rx of ROADS_X) context.fillRect(rx - ROAD_WIDTH / 2, 0, ROAD_WIDTH, WORLD.height);
    for (const ry of ROADS_Y) context.fillRect(0, ry - ROAD_WIDTH / 2, WORLD.width, ROAD_WIDTH);
    context.fillStyle = PALETTE.roadLine;
    for (const rx of ROADS_X) {
      for (let y = 0; y < WORLD.height; y += 64) context.fillRect(rx - 2, y, 4, 32);
    }
    for (const ry of ROADS_Y) {
      for (let x = 0; x < WORLD.width; x += 64) context.fillRect(x, ry - 2, 32, 4);
    }

    // Buildings and harbour containers.
    for (const solid of state.solids) {
      context.fillStyle = solid.color;
      context.fillRect(solid.x, solid.y, solid.w, solid.h);
      if (solid.kind === 'building') {
        context.fillStyle = 'rgba(0,0,0,0.18)';
        context.fillRect(solid.x + 6, solid.y + 6, solid.w - 12, solid.h - 12);
        context.fillStyle = 'rgba(255,255,255,0.10)';
        context.fillRect(solid.x + 6, solid.y + 6, solid.w - 12, 8);
      } else {
        context.fillStyle = 'rgba(255,255,255,0.14)';
        context.fillRect(solid.x + 3, solid.y + 3, solid.w - 6, 5);
      }
    }
    // Trees and palms.
    for (const tree of state.trees) {
      context.fillStyle = tree.palm ? '#3f7d3a' : '#2f6b2f';
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#6b4a2f';
      context.beginPath();
      context.arc(tree.x, tree.y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPickups(state) {
    const pulse = 1 + Math.sin(state.elapsed * 5) * 0.12;
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      const x = pickup.x;
      const y = pickup.y;
      context.save();
      context.translate(x, y);
      context.scale(pulse, pulse);
      if (pickup.kind === 'health') {
        context.fillStyle = PALETTE.health;
        context.fillRect(-9, -9, 18, 18);
        context.fillStyle = '#fff';
        context.fillRect(-2, -6, 4, 12);
        context.fillRect(-6, -2, 12, 4);
      } else if (pickup.kind === 'ammo') {
        context.fillStyle = PALETTE.ammo;
        context.fillRect(-9, -6, 18, 12);
        context.fillStyle = '#333';
        context.fillRect(-5, -9, 3, 6);
        context.fillRect(0, -9, 3, 6);
        context.fillRect(5, -9, 3, 6);
      } else {
        context.fillStyle = PALETTE.cash;
        context.beginPath();
        context.arc(0, 0, 10, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#12351f';
        text('$', 0, 5, 13, '#12351f', 'center', 'middle');
      }
      context.restore();
    }
  }

  function drawMissionTarget(state) {
    const target = state.missionTarget;
    if (!target || state.missionDone) return;
    const pulse = 1 + Math.sin(state.elapsed * 4) * 0.25;
    context.strokeStyle = PALETTE.marker;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.arc(target.x, target.y, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255,79,216,0.12)';
    context.beginPath();
    context.arc(target.x, target.y, 60 * pulse, 0, Math.PI * 2);
    context.fill();
  }

  function drawPed(ped) {
    context.save();
    context.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      context.rotate(Math.PI / 2);
      context.fillStyle = ped.color;
      context.beginPath();
      context.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      context.fill();
    } else {
      context.rotate(ped.angle);
      context.fillStyle = ped.color;
      context.beginPath();
      context.arc(0, 0, 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2b2b2b';
      context.beginPath();
      context.arc(6, 0, 4, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawCar(car, state) {
    const CAR_LENGTH = 46;
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    if (car.kind === 'wreck') {
      context.fillStyle = '#22252a';
      roundRect(-CAR_LENGTH / 2, -CAR.width / 2, CAR_LENGTH, CAR.width, 6);
      context.fill();
      context.fillStyle = 'rgba(120,120,120,0.6)';
      context.beginPath();
      context.arc(0, 0, 10 + Math.sin(state.elapsed * 3 + car.x) * 3, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    context.fillStyle = '#14161a';
    context.fillRect(-20, -13, 12, 5);
    context.fillRect(-20, 8, 12, 5);
    context.fillRect(8, -13, 12, 5);
    context.fillRect(8, 8, 12, 5);
    context.fillStyle = car.color;
    roundRect(-CAR_LENGTH / 2, -CAR.width / 2, CAR_LENGTH, CAR.width, 7);
    context.fill();
    context.fillStyle = 'rgba(20,30,40,0.75)';
    context.fillRect(-4, -8, 12, 16);
    context.fillStyle = 'rgba(255,255,255,0.25)';
    context.fillRect(14, -8, 5, 16);
    if (car.kind === 'police') {
      const on = Math.floor(car.sirenPhase) % 2 === 0;
      context.fillStyle = on ? '#ff3b30' : '#2f6fd0';
      context.fillRect(-16, -8, 8, 5);
      context.fillStyle = on ? '#2f6fd0' : '#ff3b30';
      context.fillRect(-16, 3, 8, 5);
    }
    context.restore();
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.inCar) return; // the car is drawn; the driver is inside it
    context.save();
    context.translate(player.x, player.y);
    if (player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0) context.globalAlpha = 0.35;
    context.rotate(player.angle);
    context.fillStyle = '#2b6cb0';
    context.beginPath();
    context.arc(0, 0, 13, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(0, 0, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#222';
    context.fillRect(8, -2, 14, 4);
    context.restore();
  }

  function drawWorld(state, screen) {
    const player = state.player;
    let camX = state.camera.x;
    let camY = state.camera.y;
    let zoom = player.inCar ? 0.82 : 1.0;
    if (screen === SCREEN_TITLE) {
      const t = state.elapsed * 0.12;
      camX = 1600 + Math.cos(t) * 620;
      camY = 1200 + Math.sin(t * 0.8) * 420;
      zoom = 0.72;
    }
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.save();
    context.translate(VIEW.width / 2 + shakeX, VIEW.height / 2 + shakeY);
    context.scale(zoom, zoom);
    context.translate(-camX, -camY);
    drawCity(state);
    drawPickups(state);
    drawMissionTarget(state);
    for (const ped of state.peds) drawPed(ped);
    for (const car of state.cars) drawCar(car, state);
    drawPlayer(state);
    context.fillStyle = PALETTE.bullet;
    for (const bullet of state.bullets) {
      context.beginPath();
      context.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
      context.fill();
    }
    for (const particle of state.particles) {
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    context.globalAlpha = 1;
    context.restore();
  }

  function drawMinimap(state) {
    const scaleX = MINIMAP.w / WORLD.width;
    const scaleY = MINIMAP.h / WORLD.height;
    const mx = (x) => MINIMAP.x + x * scaleX;
    const my = (y) => MINIMAP.y + y * scaleY;
    context.fillStyle = 'rgba(10,16,22,0.85)';
    context.fillRect(MINIMAP.x - 4, MINIMAP.y - 4, MINIMAP.w + 8, MINIMAP.h + 8);
    context.fillStyle = '#2e7fa8';
    context.fillRect(MINIMAP.x, MINIMAP.y, 240 * scaleX, MINIMAP.h);
    context.fillStyle = '#2e7fa8';
    context.fillRect(mx(3120), MINIMAP.y, MINIMAP.w - 3120 * scaleX, MINIMAP.h);
    context.fillStyle = '#3a3f47';
    for (const rx of ROADS_X) context.fillRect(mx(rx - 8), MINIMAP.y, 16 * scaleX, MINIMAP.h);
    for (const ry of ROADS_Y) context.fillRect(MINIMAP.x, my(ry - 8), MINIMAP.w, 16 * scaleY);
    context.fillStyle = '#4c8a3f';
    context.fillRect(mx(PARK.x), my(PARK.y), PARK.w * scaleX, PARK.h * scaleY);
    if (state.missionTarget && !state.missionDone) {
      const pulse = 3 + Math.sin(state.elapsed * 5) * 1.5;
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(mx(state.missionTarget.x), my(state.missionTarget.y), pulse + 2, 0, Math.PI * 2);
      context.fill();
    }
    if (state.missionIndex === 3) {
      context.fillStyle = PALETTE.cash;
      for (const pickup of state.pickups) {
        if (pickup.active && pickup.kind === 'cash') {
          context.beginPath();
          context.arc(mx(pickup.x), my(pickup.y), 2.5, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    context.fillStyle = '#ffd94a';
    for (const car of state.cars) {
      if (car.kind === 'traffic') {
        context.fillRect(mx(car.x) - 1.5, my(car.y) - 1.5, 3, 3);
      }
    }
    const flash = Math.floor(state.elapsed * 4) % 2 === 0;
    for (const car of state.cars) {
      if (car.kind === 'police') {
        context.fillStyle = flash ? '#ff3b30' : '#2f6fd0';
        context.beginPath();
        context.arc(mx(car.x), my(car.y), 3.5, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.fillStyle = '#fff';
    context.beginPath();
    context.arc(mx(state.player.x), my(state.player.y), 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#fff';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(mx(state.player.x), my(state.player.y), 4, 0, Math.PI * 2);
    context.stroke();
  }

  function drawHud(state, objective) {
    const player = state.player;
    context.textBaseline = 'top';
    // Cash and health, top left.
    text(`$${player.cash}`, 20, 16, 30, PALETTE.cash, 'left');
    context.fillStyle = 'rgba(10,16,22,0.7)';
    context.fillRect(20, 52, 220, 16);
    context.fillStyle = player.health > 30 ? '#4ade80' : '#ff5d5d';
    context.fillRect(20, 52, 220 * Math.max(0, player.health / 100), 16);
    text(`HP ${Math.ceil(player.health)}`, 24, 54, 12, '#fff', 'left');
    text(`Ammo ${player.ammo}`, 20, 74, 18, PALETTE.ammo, 'left');
    // Wanted stars and clock, top centre.
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    text(stars, VIEW.width / 2, 14, 30, PALETTE.star, 'center');
    const hours = Math.floor(state.clockMinutes / 60) % 24;
    const minutes = Math.floor(state.clockMinutes % 60);
    const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    text(clock, VIEW.width / 2, 50, 20, PALETTE.text, 'center');
    drawMinimap(state);
    // Mission objective, bottom left.
    context.fillStyle = 'rgba(10,16,22,0.75)';
    context.fillRect(16, VIEW.height - 96, 480, 80);
    context.fillStyle = PALETTE.marker;
    context.fillRect(16, VIEW.height - 96, 5, 80);
    text(state.missionDone ? 'Free roam' : `Mission ${state.missionIndex + 1}/5 — ${state.missionName}`, 32, VIEW.height - 88, 17, PALETTE.text, 'left');
    text(objective, 32, VIEW.height - 62, 16, PALETTE.muted, 'left');
    // Driving speed and shop hints, bottom right.
    if (player.inCar) {
      text(`${Math.round(Math.abs(player.inCar.speed) * 0.36)} km/h`, VIEW.width - 20, VIEW.height - 44, 26, PALETTE.text, 'right');
    }
    text('H heal $50 · J ammo $30 · E car · P pause', VIEW.width - 20, VIEW.height - 20, 14, PALETTE.muted, 'right');
    // Toast, centre top.
    if (state.toast) {
      context.fillStyle = 'rgba(10,16,22,0.8)';
      const w = Math.min(640, 24 + state.toast.length * 9);
      context.fillRect((VIEW.width - w) / 2, 92, w, 34);
      text(state.toast, VIEW.width / 2, 100, 18, PALETTE.text, 'center');
    }
    // Mission briefing, centre.
    if (state.briefing) {
      drawPanel(state.briefing.title, state.briefing.lines, 'Get ready…');
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, VIEW.width / 2, y + 74, 44, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 34, 22, PALETTE.cash, 'center');
  }

  const TITLE_LINES = [
    'Dante Vega is back in Solmar Bay — broke, on foot, and out of options.',
    'Steal cars, outrun the patrols, and pull five jobs for the crew.',
    'WASD move · Mouse aim · Click / Space to shoot · F to punch',
    'E steal a car · H health $50 · J ammo $30 · P pause · M mute',
    '',
  ];
  const PAUSED_LINES = ['The bay will wait for you.'];
  const BUSTED_LINES = ['The patrols caught up with you.'];
  const WASTED_LINES = ['Solmar Bay was too much, this time.'];

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, info) {
    const objective = info && info.objective ? info.objective : '';
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawWorld(state, screen);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[4] = `Best cash: $${best} · Progress saves in this browser`;
      drawPanel('SOLMAR BAY', TITLE_LINES, 'Press Enter or click to start');
      return;
    }
    drawHud(state, objective);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      const busted = info && info.overReason === 'busted';
      drawPanel(
        busted ? 'BUSTED' : 'WASTED',
        [busted ? BUSTED_LINES[0] : WASTED_LINES[0], `Cash kept: $${state.player.cash} · Best cash: $${best}`],
        'Press Enter or click to play again',
      );
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
