// Keyboard and pointer input. Held keys give movement and driving; one-shot presses (steal a
// car, punch, buy, pause, start) are queued as flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. The mouse position is reported in
// the renderer's 1280x720 logical coordinates, so the loop can turn it into a world aim point
// through the camera.

import { VIEW } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let edges = { enter: false, punch: false, buyHealth: false, buyAmmo: false };
  let mouseDown = false;
  let spaceHeld = false;
  const mouse = { x: VIEW.width / 2, y: VIEW.height / 2 };

  function logicalFromClient(clientX, clientY) {
    const scale = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
    const offsetX = (window.innerWidth - VIEW.width * scale) / 2;
    const offsetY = (window.innerHeight - VIEW.height * scale) / 2;
    mouse.x = (clientX - offsetX) / scale;
    mouse.y = (clientY - offsetY) / scale;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (CONFIRM.has(event.code)) {
      if (event.code === 'Space') spaceHeld = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'KeyE') {
      if (!event.repeat) edges.enter = true;
    } else if (event.code === 'KeyF') {
      if (!event.repeat) edges.punch = true;
    } else if (event.code === 'KeyH') {
      if (!event.repeat) edges.buyHealth = true;
    } else if (event.code === 'KeyJ') {
      if (!event.repeat) edges.buyAmmo = true;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (event.code === 'Space') spaceHeld = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    spaceHeld = false;
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    logicalFromClient(event.clientX, event.clientY);
  });
  canvas.addEventListener('pointerdown', (event) => {
    logicalFromClient(event.clientX, event.clientY);
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  return {
    /** Held movement keys, for walking and for driving. */
    movement() {
      return { up: held.up, down: held.down, left: held.left, right: held.right };
    },
    /** The mouse position in logical (1280x720) coordinates. */
    mouse() {
      return { x: mouse.x, y: mouse.y };
    },
    /** True while the mouse button or Space is held: hold to shoot. */
    shooting() {
      return mouseDown || spaceHeld;
    },
    /** The one-shot presses since the last call, cleared as they are read. */
    takeEdges() {
      const taken = edges;
      edges = { enter: false, punch: false, buyHealth: false, buyAmmo: false };
      return taken;
    },
    /** The one-shot screen actions since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
