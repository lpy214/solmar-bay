// Solmar Bay — every tuning number and colour in one place.
// The city is a fixed 3200x2400 world; the renderer shows a 1280x720 window of it through a
// camera that follows the player, so no rule below depends on the screen size.

export const WORLD = { width: 3200, height: 2400 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The logical window the renderer paints (1280x720), scaled to fit the browser window. */
export const VIEW = { width: 1280, height: 720 };

/** Road centre lines: the city is a grid of avenues and streets. */
export const ROADS_X = [400, 800, 1200, 1600, 2000, 2400, 2800];
export const ROADS_Y = [400, 800, 1200, 1600, 2000];
export const ROAD_WIDTH = 96;
export const LANE = 26;

/** The beach is the western strip; the harbour is the eastern strip. */
export const BEACH = { x0: 0, x1: 330 };
export const HARBOUR = { x0: 2880, x1: 3200 };
export const PARK = { x: 1240, y: 840, w: 320, h: 320 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 175,
  health: 100,
  punchRange: 42,
  punchDamage: 25,
  punchCooldown: 0.45,
  shootCooldown: 0.22,
  bulletSpeed: 720,
  bulletDamage: 34,
  invulnerable: 1.0,
};

export const CAR = {
  radius: 17,
  length: 46,
  width: 22,
  maxSpeed: 430,
  reverseMax: 130,
  accel: 320,
  brake: 520,
  drag: 0.55,
  turnRate: 2.6,
  health: 100,
};

export const TRAFFIC = { count: 14, minSpeed: 120, maxSpeed: 185, turnChance: 0.35 };
export const PEDS = { count: 26, minSpeed: 34, maxSpeed: 62 };

export const WANTED = {
  max: 5,
  decaySeconds: 22,
  steal: 1,
  hitPed: 1,
  shoot: 1,
  killCop: 1,
  bustedHold: 1.2,
};

export const POLICE = { maxSpeed: 400, ramDamage: 9, spawnDistance: 620 };

export const PICKUP = { health: 40, ammo: 24, cashValue: 60 };
export const SHOP = { healthCost: 50, healthAmount: 50, ammoCost: 30, ammoAmount: 24 };

export const MISSIONS = [
  { name: 'Hot Wheels', reward: 200 },
  { name: 'The Package', reward: 400, timeLimit: 90 },
  { name: 'Lay Low', reward: 500 },
  { name: 'Cash Grab', reward: 600 },
  { name: 'Harbour Heist', reward: 1000 },
];

export const PALETTE = {
  backdrop: '#0e1a24',
  grass: '#5f9e4e',
  grassDark: '#548c44',
  sand: '#e8d29a',
  sea: '#2e7fa8',
  seaDeep: '#1f6390',
  road: '#3a3f47',
  roadLine: '#d8c95a',
  sidewalk: '#9aa0a8',
  park: '#4c8a3f',
  building: '#b08968',
  buildingRoof: '#8a6a4f',
  building2: '#7d8aa0',
  building3: '#a08a7d',
  dock: '#6b7280',
  container: '#c25e3a',
  container2: '#3a7d9e',
  player: '#f2c94c',
  playerCar: '#e5534b',
  traffic: '#7fb3d5',
  police: '#2f6fd0',
  policeLight: '#ff3b30',
  ped: '#e8e4d8',
  bullet: '#ffe066',
  cash: '#4ade80',
  health: '#ff5d73',
  ammo: '#f2c94c',
  marker: '#ff4fd8',
  panel: '#101820',
  panelEdge: '#2a3a48',
  text: '#f2f5f7',
  muted: '#9fb0bd',
  star: '#ffd94a',
  danger: '#ff5d5d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best cash and the furthest mission reached are kept between visits. */
export const BEST_CASH_KEY = 'solmar-bay.best-cash';
export const MISSION_KEY = 'solmar-bay.mission';
