import { useEffect, useRef } from 'react';

/**
 * Pixel-art laser cutter from the side, flat black, as a busy indicator: the
 * head cuts through the plate, slides right and cuts again, three times. Then
 * the four loose pieces drop away one by one, a new plate is laid down from
 * left to right and the head drives back. Hard edges, no transparency; only
 * the beam and the sparks have colour. It runs while
 * `active` (laser on) and stands still otherwise.
 *
 * Sparks cool from white through yellow and orange to red, after Omarchy's
 * screensaver (TerminalTextEffects, LaserEtch). The line under it is a random
 * message every ~12 s, in a 3x5 pixel font.
 *
 * Drawn at low resolution and scaled up with image-rendering: pixelated.
 */

const W = 152;
const H = 60;
const INK = '#171717';
const PLATE = { x: 16, y: 38, w: 120, h: 6 };
const CUTS = [46, 76, 106];              // x of the three cuts
const HEAD_Y = 4;                        // top of the head
const NOZZLE_TIP = HEAD_Y + 19;
const TEXT_Y = H - 7;

const TICK_MS = 33;
const CUT_TICKS = 45;                    // time to cut through the plate
const MOVE_TICKS = 24;                   // slide to the next cut
const DROP_TICKS = 36;                   // the loose pieces fall away
const DROP_STAGGER = 5;                  // ticks between two pieces
const FILL_TICKS = 26;                   // a new plate is laid down
const FILL_STEP = 4;                     // ...in steps of this many px
const GRAVITY = 0.35;

const SPARK = ['#FFFFFF', '#FFE680', '#FF9A3C', '#E0561F', '#B3261E'];
const BEAM = ['#E0361F', '#FF6A4D'];

/** Slow start, slow stop. */
const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

interface Spark { x: number; y: number; vx: number; vy: number; age: number; life: number }

// Messages under the cutter, a random one every MESSAGE_TICKS.
// BUSY while the laser runs, IDLE otherwise.
const MESSAGE_TICKS = 365;               // ~12 s
const BUSY = [
  'LASERCUTTER IS BUSY',
  'CUTTING... PLEASE HOLD',
  'KEEP THE LID CLOSED',
  'STAY NEAR THE MACHINE WHILE IT CUTS',
  'CHECK YOUR SETTINGS BEFORE YOU START',
  "DON'T FORGET TO ASSIGN YOUR TIME",
  'LASERING IS MY PASSION',
  'BIGGEST LASERCUTTER IN LEUVEN*',
  'MEASURE TWICE, CUT ONCE',
  "DON'T STARE INTO THE BEAM",
  'SMELLS LIKE MDF IN HERE',
  'PEW PEW PEW',
  'NOW WITH 100% MORE LASER',
  'ONE DOES NOT SIMPLY UNPLUG A LASER',
  'PLYWOOD GO BRRRR',
  'I CAME, I SAW, I CUT',
  '404: MATERIAL NOT FOUND',
  'HOT STUFF COMING THROUGH',
  "FRICKIN' LASER BEAMS",
  'ACRYLIC? MORE LIKE ACRY-LIT',
];
const IDLE = [
  'LASERCUTTER IS AVAILABLE',
  'READY WHEN YOU ARE',
  'WAITING FOR A JOB...',
  'FEED ME PLYWOOD',
  'NO LASERS WERE HARMED TODAY',
  'THE BEAM IS TAKING A NAP',
];
// 3x5 glyphs, one string of 15 bits per character, row by row.
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111',
  '2': '110001010100111', '3': '110001010001110', '4': '101101111001001', '5': '111100110001110',
  '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110',
  '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010',
  "'": '010010000000000', '-': '000000111000000', '*': '000101010101000', ':': '000010000010000',
  '%': '101001010100101', ' ': '000000000000000',
};
const SCRAMBLE = 'ABCDEFGHKLMNPRSTUVWXYZ0123456789*?%';

function drawText(g: CanvasRenderingContext2D, text: string, revealed: number, tick: number) {
  const x0 = Math.round((W - text.length * 4 + 1) / 2);
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    const settled = i < revealed;
    if (!settled) {
      if (i > revealed + 3 || ch === ' ') continue;   // a short scrambling front, blank behind it
      ch = SCRAMBLE[(i * 7 + tick * 3) % SCRAMBLE.length];
    }
    const bits = FONT[ch] ?? FONT['?'];
    g.fillStyle = INK;
    for (let b = 0; b < 15; b++) {
      if (bits[b] === '1') g.fillRect(x0 + i * 4 + (b % 3), TEXT_Y + Math.floor(b / 3), 1, 1);
    }
  }
}

export default function LaserAnimation({ active, className }: { active: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d')!;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // The pieces between the cuts, as [x, width].
    const pieces: [number, number][] = [];
    [PLATE.x - 1, ...CUTS, PLATE.x + PLATE.w].reduce((from, to) => {
      pieces.push([from + 1, to - from - 1]);
      return to;
    });

    let phase: 'cut' | 'move' | 'drop' | 'fill' = 'cut';
    let phaseTick = 0;
    let cutIndex = 0;
    let kerfs = [0, 0, 0];                 // depth of each cut, 0..PLATE.h
    let headX = CUTS[0];
    let moveFrom = headX;
    let tick = 0;
    const sparks: Spark[] = [];

    let message = '';
    let messageAt = 0;
    let wasOn: boolean | null = null;
    const pick = (list: string[]) => {
      let next = message;
      while (next === message) next = list[Math.floor(Math.random() * list.length)];
      return next;
    };

    const spray = (x: number, y: number, down: boolean) => {
      for (let k = 0; k < 2; k++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        sparks.push({
          x, y,
          vx: side * (0.4 + Math.random() * 1.6),
          vy: down ? 0.5 + Math.random() : -(0.6 + Math.random() * 1.8),
          age: 0,
          life: 8 + Math.random() * 10,
        });
      }
    };

    const advance = () => {
      phaseTick++;
      if (phase === 'cut') {
        const depth = Math.min(PLATE.h, Math.ceil((phaseTick / CUT_TICKS) * PLATE.h));
        kerfs[cutIndex] = depth;
        spray(headX, PLATE.y + depth - 1, false);
        if (depth >= PLATE.h) spray(headX, PLATE.y + PLATE.h, true);   // through: sparks out the bottom
        if (phaseTick >= CUT_TICKS) {
          phase = cutIndex < CUTS.length - 1 ? 'move' : 'drop';
          phaseTick = 0;
          moveFrom = headX;
        }
      } else if (phase === 'move') {
        headX = moveFrom + (CUTS[cutIndex + 1] - moveFrom) * ease(Math.min(1, phaseTick / MOVE_TICKS));
        if (phaseTick >= MOVE_TICKS) { cutIndex++; phase = 'cut'; phaseTick = 0; }
      } else {
        // The head drives back while the pieces drop and the new plate goes down.
        const back = phase === 'drop' ? phaseTick : DROP_TICKS + phaseTick;
        headX = moveFrom + (CUTS[0] - moveFrom) * ease(Math.min(1, back / (DROP_TICKS + FILL_TICKS)));
        if (phase === 'drop' && phaseTick >= DROP_TICKS) {
          phase = 'fill';
          phaseTick = 0;
          kerfs = [0, 0, 0];
        } else if (phase === 'fill' && phaseTick >= FILL_TICKS) {
          cutIndex = 0;
          phase = 'cut';
          phaseTick = 0;
        }
      }
    };

    const frame = () => {
      tick++;
      const on = activeRef.current && !reduceMotion;
      if (on) advance();
      const beam = on && phase === 'cut';

      if (on !== wasOn || tick - messageAt >= MESSAGE_TICKS) {
        message = pick(on ? BUSY : IDLE);
        messageAt = tick;
        wasOn = on;
      }

      g.clearRect(0, 0, W, H);

      // Plate. Kerfs are gaps; dropping pieces fall right to left and vanish
      // above the text; the new plate is laid down left to right.
      g.fillStyle = INK;
      if (phase === 'drop') {
        pieces.forEach(([x, w], i) => {
          const t = Math.max(0, phaseTick - (pieces.length - 1 - i) * DROP_STAGGER);
          const y = PLATE.y + Math.round(0.5 * GRAVITY * t * t);
          if (y < TEXT_Y - PLATE.h - 2) g.fillRect(x, y, w, PLATE.h);
        });
      } else if (phase === 'fill') {
        const w = Math.round((PLATE.w * ease(Math.min(1, phaseTick / FILL_TICKS))) / FILL_STEP) * FILL_STEP;
        g.fillRect(PLATE.x, PLATE.y, w, PLATE.h);
      } else {
        g.fillRect(PLATE.x, PLATE.y, PLATE.w, PLATE.h);
        kerfs.forEach((depth, i) => { if (depth > 0) g.clearRect(CUTS[i], PLATE.y, 1, depth); });
      }

      // Head: body, then a nozzle narrowing to the tip.
      const hx = Math.round(headX);
      g.fillStyle = INK;
      g.fillRect(hx - 4, HEAD_Y, 9, 14);                     // body
      g.fillRect(hx - 2, HEAD_Y + 14, 5, 3);                 // nozzle
      g.fillRect(hx - 1, HEAD_Y + 17, 3, 2);                 // tip

      if (beam) {
        const depth = kerfs[cutIndex];
        g.fillStyle = BEAM[tick % 2];
        g.fillRect(hx, NOZZLE_TIP, 1, PLATE.y + depth - NOZZLE_TIP);
        g.fillStyle = SPARK[tick % 3];
        g.fillRect(hx - 1, PLATE.y + depth - 1, 3, 1);
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.vx *= 0.94;
        if (++p.age > p.life || p.y > TEXT_Y - 2) { sparks.splice(i, 1); continue; }
        g.fillStyle = SPARK[Math.min(SPARK.length - 1, Math.floor(p.age / 3))];
        g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }

      drawText(g, message, reduceMotion ? message.length : Math.floor((tick - messageAt) / 2), tick);
    };

    frame();
    const id = window.setInterval(frame, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className={className}
      style={{ imageRendering: 'pixelated', width: '100%', aspectRatio: `${W} / ${H}` }}
      aria-label="Animation of a laser cutter at work"
      role="img"
    />
  );
}
