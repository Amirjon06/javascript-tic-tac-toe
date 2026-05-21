'use strict';

// ─── Constants ─────────────────────────────────────────

const PLAYERS = Object.freeze({ X: 'X', O: 'O' });
const MODES = Object.freeze({ FRIEND: 'friend', AI: 'ai' });

const AI_PLAYER = PLAYERS.O;
const HUMAN_PLAYER = PLAYERS.X;

const AI_THINK_DELAY_MS = 420;
const CONFETTI_DELAY_MS = 280;
const THEME_STORAGE_KEY = 'ttt-theme';

const WIN_COMBINATIONS = Object.freeze([
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],

  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],

  [0, 4, 8],
  [2, 4, 6],
]);

// ─── State ─────────────────────────────────────────────

let state = {
  mode: null,
  board: Array(9).fill(null),
  currentPlayer: PLAYERS.X,
  scores: { X: 0, O: 0 },
  winner: null,
  winningCells: [],
  isDraw: false,
  isGameOver: false,
  isAiThinking: false,
  justWon: false,
};

// ─── DOM References ───────────────────────────────────

const dom = {
  modeScreen: document.getElementById('mode-screen'),
  gameScreen: document.getElementById('game-screen'),

  modeFriendBtn: document.getElementById('mode-friend'),
  modeAiBtn: document.getElementById('mode-ai'),

  modeLabel: document.getElementById('mode-label'),

  board: document.getElementById('board'),
  cells: document.querySelectorAll('.cell'),

  statusMsg: document.getElementById('status-message'),

  scoreX: document.getElementById('score-x'),
  scoreO: document.getElementById('score-o'),

  labelX: document.getElementById('label-x'),
  labelO: document.getElementById('label-o'),

  restartBtn: document.getElementById('restart-btn'),
  resetScoreBtn: document.getElementById('reset-scores-btn'),
  changeModeBtn: document.getElementById('change-mode-btn'),
};

// ─── Screen Navigation ───────────────────────────────────────────────────────

function showModeScreen() {
  dom.modeScreen.classList.remove('is-hidden');
  dom.gameScreen.classList.add('is-hidden');
  dom.gameScreen.setAttribute('aria-hidden', 'true');
}

function showGameScreen() {
  dom.modeScreen.classList.add('is-hidden');
  dom.gameScreen.classList.remove('is-hidden');
  dom.gameScreen.setAttribute('aria-hidden', 'false');
}

function selectMode(mode) {
  state.mode   = mode;
  state.scores = { X: 0, O: 0 };

  if (mode === MODES.AI) {
    dom.labelX.textContent    = 'You';
    dom.labelO.textContent    = 'AI';
    dom.modeLabel.textContent = 'vs AI';
  } else {
    dom.labelX.textContent    = 'Player X';
    dom.labelO.textContent    = 'Player O';
    dom.modeLabel.textContent = 'Two Player';
  }

  restartGame();
  showGameScreen();
}

// ─── Theme Management ────────────────────────────────────────────────────────

/**
 * Apply a theme by setting data-theme on <html> and persisting to localStorage.
 * The CSS variable overrides in style.css do the rest automatically.
 *
 * @param {string} theme - 'dark' | 'light' | 'neon'
 */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  // Sync the active state on ALL .theme-btn elements (two sets: one per screen)
  document.querySelectorAll('.theme-btn').forEach((btn) => {
    const isActive = btn.dataset.theme === theme;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

// ─── SVG Mark Creation ───────────────────────────────────────────────────────

/**
 * These functions create SVG elements that match the CSS animation classes
 * already defined in style.css. The stroke-dashoffset trick works like this:
 *
 *   1. Set stroke-dasharray = full path length   (makes the stroke "exist")
 *   2. Set stroke-dashoffset = same length        (offsets it to invisible)
 *   3. Animate stroke-dashoffset to 0             (reveals it — looks "drawn")
 *
 * The path lengths were calculated from the SVG geometry:
 *   X lines: √((80-20)² + (80-20)²) ≈ 84.85 → 86 with margin
 *   O circle: 2π × 30 ≈ 188.5 → 189
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an animated X mark as an SVG element.
 * @returns {SVGElement}
 */
function createXMark() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.classList.add('mark', 'mark--x');
  svg.setAttribute('aria-hidden', 'true');

  // First diagonal: top-left → bottom-right
  const line1 = document.createElementNS(SVG_NS, 'line');
  line1.setAttribute('x1', '20'); line1.setAttribute('y1', '20');
  line1.setAttribute('x2', '80'); line1.setAttribute('y2', '80');
  line1.classList.add('mark__stroke', 'mark__stroke--1');

  // Second diagonal: top-right → bottom-left (delayed so strokes draw in sequence)
  const line2 = document.createElementNS(SVG_NS, 'line');
  line2.setAttribute('x1', '80'); line2.setAttribute('y1', '20');
  line2.setAttribute('x2', '20'); line2.setAttribute('y2', '80');
  line2.classList.add('mark__stroke', 'mark__stroke--2');

  svg.appendChild(line1);
  svg.appendChild(line2);
  return svg;
}

/**
 * Create an animated O mark as an SVG element.
 * The circle is rotated -90° in CSS so drawing starts at 12 o'clock.
 * @returns {SVGElement}
 */
function createOMark() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.classList.add('mark', 'mark--o');
  svg.setAttribute('aria-hidden', 'true');

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '50');
  circle.setAttribute('cy', '50');
  circle.setAttribute('r',  '30');
  circle.classList.add('mark__stroke');

  svg.appendChild(circle);
  return svg;
}

// ─── Confetti ────────────────────────────────────────────────────────────────

/**
 * Launch a confetti particle system on a dynamically-created canvas overlay.
 * The canvas is created, animated, then removed from the DOM when done.
 *
 * Design decisions:
 *   - Canvas is created/destroyed per-win rather than reused (simpler lifecycle)
 *   - pointer-events: none (set via CSS class) — never blocks board interaction
 *   - Checks prefers-reduced-motion — skips entirely if user has it on
 *   - Uses requestAnimationFrame for smooth, battery-friendly animation
 *   - Particles fade out in the final 35% of the animation duration
 */
function launchConfetti() {
  // Respect the user's accessibility preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  // Pull colors from both themes so they always look right
  const COLORS = ['#e8ff47', '#ff6b6b', '#6bc8ff', '#ff2d78', '#00ff88', '#ffffff', '#ffd700'];
  const COUNT   = 130;
  const DURATION = 3000; // ms

  const particles = Array.from({ length: COUNT }, () => ({
    x:      Math.random() * canvas.width,
    y:      Math.random() * canvas.height * -0.35, // spawn above viewport
    vx:     (Math.random() - 0.5) * 5,
    vy:     Math.random() * 3.5 + 1.5,
    size:   Math.random() * 7 + 4,
    color:  COLORS[Math.floor(Math.random() * COLORS.length)],
    angle:  Math.random() * Math.PI * 2,
    spin:   (Math.random() - 0.5) * 0.14,
    isRect: Math.random() > 0.4,
  }));

  let frameId;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const t = elapsed / DURATION; // 0 → 1 over the duration

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let anyVisible = false;

    particles.forEach((p) => {
      p.x     += p.vx;
      p.y     += p.vy;
      p.vy    += 0.09;   // gravity
      p.angle += p.spin;

      // Fade out in the final 35% of the animation
      const opacity = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1;

      if (p.y < canvas.height + 40) {
        anyVisible = true;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;

        if (p.isRect) {
          // Flat rectangular confetti strip
          ctx.fillRect(-p.size / 2, -p.size / 3.5, p.size, p.size / 2);
        } else {
          // Circular confetti dot (slightly squished for variety)
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size / 2, p.size / 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    });

    if (anyVisible && elapsed < DURATION) {
      frameId = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frameId);
      canvas.remove();
    }
  }

  frameId = requestAnimationFrame(tick);
}

// ─── AI — Minimax Algorithm ──────────────────────────────────────────────────

function scoreBoard(board, depth) {
  const result = checkWinner(board);
  if (result) return result.player === AI_PLAYER ? 10 - depth : depth - 10;
  return 0;
}

function minimax(board, depth, isMaximising) {
  const score = scoreBoard(board, depth);
  if (score !== 0) return score;
  if (isBoardFull(board)) return 0;

  if (isMaximising) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] !== null) continue;
      board[i] = AI_PLAYER;
      best = Math.max(best, minimax(board, depth + 1, false));
      board[i] = null;
    }
    return best;
  } else {
    let best = +Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] !== null) continue;
      board[i] = HUMAN_PLAYER;
      best = Math.min(best, minimax(board, depth + 1, true));
      board[i] = null;
    }
    return best;
  }
}

function getBestMove(board) {
  let bestScore = -Infinity;
  let bestMove  = -1;

  for (let i = 0; i < 9; i++) {
    if (board[i] !== null) continue;
    board[i] = AI_PLAYER;
    const score = minimax(board, 0, false);
    board[i] = null;
    if (score > bestScore) { bestScore = score; bestMove = i; }
  }

  return bestMove;
}

function scheduleAiMove() {
  state.isAiThinking = true;

  dom.statusMsg.textContent = 'AI is thinking...';
  dom.statusMsg.classList.remove(
    'status-message--x', 'status-message--o',
    'status-message--winner', 'status-message--draw'
  );
  dom.statusMsg.classList.add('status-message--o');

  setTimeout(() => {
    state.isAiThinking = false;
    handleMove(getBestMove([...state.board]));
  }, AI_THINK_DELAY_MS);
}

// ─── Game Logic ──────────────────────────────────────────────────────────────

function checkWinner(board) {
  for (const [a, b, c] of WIN_COMBINATIONS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { player: board[a], cells: [a, b, c] };
    }
  }
  return null;
}

function isBoardFull(board) {
  return board.every((cell) => cell !== null);
}

function handleMove(index) {
  if (state.board[index] !== null || state.isGameOver) return;

  state.board[index] = state.currentPlayer;

  const result = checkWinner(state.board);

  if (result) {
    state.winner      = result.player;
    state.winningCells = result.cells;
    state.isGameOver  = true;
    state.scores[result.player] += 1;
    state.justWon     = true;
  } else if (isBoardFull(state.board)) {
    state.isDraw     = true;
    state.isGameOver = true;
  } else {
    state.currentPlayer =
      state.currentPlayer === PLAYERS.X ? PLAYERS.O : PLAYERS.X;

    if (state.mode === MODES.AI && state.currentPlayer === AI_PLAYER) {
      render(index);
      scheduleAiMove();
      return;
    }
  }

  render(index);
}

function restartGame() {
  state.board         = Array(9).fill(null);
  state.currentPlayer = PLAYERS.X;
  state.winner        = null;
  state.winningCells  = [];
  state.isDraw        = false;
  state.isGameOver    = false;
  state.isAiThinking  = false;
  state.justWon       = false;

  render(null);
}

function resetScores() {
  state.scores = { X: 0, O: 0 };
  restartGame();
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function render(lastPlayedIndex) {
  renderBoard(lastPlayedIndex);
  renderStatus();
  renderScores();

  // Trigger confetti after a short pause so the winning-cell highlight
  // has time to render before the canvas appears on top
  if (state.justWon) {
    state.justWon = false;
    setTimeout(launchConfetti, CONFETTI_DELAY_MS);
  }
}

/**
 * Sync board cells to state.
 *
 * SVG marks are injected once per cell — we check for an existing .mark
 * before injecting to avoid re-triggering the draw animation on every render.
 * On restart (empty cell), innerHTML is cleared to remove old SVGs.
 */
function renderBoard(lastPlayedIndex) {
  dom.cells.forEach((cell, index) => {
    const value = state.board[index];

    cell.classList.remove('cell--x', 'cell--o', 'cell--taken', 'cell--winner', 'cell--placed');
    cell.setAttribute('aria-label', `Cell ${index + 1}${value ? ', ' + value : ''}`);

    if (value === PLAYERS.X) {
      cell.classList.add('cell--x', 'cell--taken');
      // Only inject SVG once — prevents re-animation on subsequent renders
      if (!cell.querySelector('.mark')) cell.appendChild(createXMark());
    } else if (value === PLAYERS.O) {
      cell.classList.add('cell--o', 'cell--taken');
      if (!cell.querySelector('.mark')) cell.appendChild(createOMark());
    } else {
      // Empty cell — remove any leftover SVG (happens on restart)
      cell.innerHTML = '';
    }

    if (index === lastPlayedIndex) cell.classList.add('cell--placed');
    if (state.winningCells.includes(index)) cell.classList.add('cell--winner');
  });

  dom.board.classList.toggle('board--inactive', state.isGameOver || state.isAiThinking);
}

function renderStatus() {
  const msg      = dom.statusMsg;
  const isAiMode = state.mode === MODES.AI;

  msg.classList.remove(
    'status-message--winner', 'status-message--draw',
    'status-message--x', 'status-message--o'
  );

  if (state.winner) {
    msg.textContent =
      isAiMode && state.winner === AI_PLAYER    ? 'AI wins!' :
      isAiMode && state.winner === HUMAN_PLAYER ? 'You win!' :
      `Player ${state.winner} wins!`;
    msg.classList.add('status-message--winner');
  } else if (state.isDraw) {
    msg.textContent = "It's a draw — well played.";
    msg.classList.add('status-message--draw');
  } else {
    msg.textContent =
      isAiMode && state.currentPlayer === AI_PLAYER    ? "AI's turn" :
      isAiMode && state.currentPlayer === HUMAN_PLAYER ? 'Your turn' :
      `Player ${state.currentPlayer}'s turn`;
    msg.classList.add(
      state.currentPlayer === PLAYERS.X ? 'status-message--x' : 'status-message--o'
    );
  }
}

function renderScores() {
  updateScoreElement(dom.scoreX, state.scores.X);
  updateScoreElement(dom.scoreO, state.scores.O);
}

function updateScoreElement(el, newScore) {
  const current = parseInt(el.textContent, 10);
  el.textContent = newScore;

  if (newScore > current) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    el.addEventListener('transitionend', () => el.classList.remove('bump'), { once: true });
  }
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

dom.modeFriendBtn.addEventListener('click', () => selectMode(MODES.FRIEND));
dom.modeAiBtn.addEventListener('click',     () => selectMode(MODES.AI));
dom.changeModeBtn.addEventListener('click', showModeScreen);

dom.board.addEventListener('click', (event) => {
  if (state.isAiThinking) return;

  const cell = event.target.closest('.cell');
  if (!cell) return;

  if (state.mode === MODES.AI && state.currentPlayer !== HUMAN_PLAYER) return;

  handleMove(parseInt(cell.dataset.index, 10));
});

dom.restartBtn.addEventListener('click',    restartGame);
dom.resetScoreBtn.addEventListener('click', resetScores);

// Theme buttons — event delegation on document so it catches both
// sets of buttons (mode screen header + game screen header)
document.addEventListener('click', (event) => {
  const btn = event.target.closest('.theme-btn');
  if (!btn) return;
  applyTheme(btn.dataset.theme);
});

// ─── Initialise ──────────────────────────────────────────────────────────────

// Load the saved theme preference, or default to dark
applyTheme(localStorage.getItem(THEME_STORAGE_KEY) ?? 'dark');

showModeScreen();
