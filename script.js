'use strict';

const PLAYERS = Object.freeze({ X: 'X', O: 'O' });
const MODES   = Object.freeze({ FRIEND: 'friend', AI: 'ai' });
const THEMES  = ['dark', 'neon', 'light'];
const AI_PLAYER   = PLAYERS.O;
const HUMAN_PLAYER = PLAYERS.X;
const AI_DELAY    = 480;
const THEME_KEY   = 'ttt-theme';

const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

const MSG = {
  win:  { titles: ['You won.','Nice.','AI defeated.','Clean win.'], subs: ['Sharp finish.','The AI never saw it coming.','You\'re getting good at this.','Dominant.'], icon: '🏆' },
  lose: { titles: ['Defeated.','Oops.','Not this time.','Rough one.'], subs: ['The AI cooked you.','Better luck next round.','It read every move.','You\'ll get it.'], icon: '😤' },
  draw: { titles: ['Draw.','Even match.','Stalemate.'], subs: ['Nobody wins this round.','Perfectly balanced.','Too close to call.'], icon: '🤝' },
};

let state = {
  mode: null, difficulty: null,
  board: Array(9).fill(null),
  currentPlayer: PLAYERS.X,
  scores: { X: 0, O: 0 },
  winner: null, winningCells: [],
  isDraw: false, isGameOver: false, isAiThinking: false,
};

const dom = {
  html:         document.documentElement,
  bgCanvas:     document.getElementById('bg-canvas'),
  modeScreen:   document.getElementById('mode-screen'),
  gameScreen:   document.getElementById('game-screen'),
  stepModes:    document.getElementById('step-modes'),
  stepDiff:     document.getElementById('step-difficulty'),
  modeFriendBtn:document.getElementById('mode-friend'),
  modeAiBtn:    document.getElementById('mode-ai'),
  backBtn:      document.getElementById('back-btn'),
  gameBadge:    document.getElementById('game-badge'),
  board:        document.getElementById('board'),
  cells:        document.querySelectorAll('.cell'),
  statusMsg:    document.getElementById('status-message'),
  scoreX:       document.getElementById('score-x'),
  scoreO:       document.getElementById('score-o'),
  labelX:       document.getElementById('label-x'),
  labelO:       document.getElementById('label-o'),
  restartBtn:   document.getElementById('restart-btn'),
  resetScoreBtn:document.getElementById('reset-scores-btn'),
  changeModeBtn:document.getElementById('change-mode-btn'),
  themeBtns:    document.querySelectorAll('.theme-btn'),
  modal:        document.getElementById('modal'),
  modalCard:    document.getElementById('modal-card'),
  modalIcon:    document.getElementById('modal-icon'),
  modalTitle:   document.getElementById('modal-title'),
  modalSub:     document.getElementById('modal-sub'),
  modalActions: document.getElementById('modal-actions'),
};

// ── Particles ────────────────────────────────────────────────────────────────

function initParticles() {
  const canvas = dom.bgCanvas;
  const ctx = canvas.getContext('2d');
  let pts = [];

  function mkPt(rndY = false) {
    return {
      x:   Math.random() * canvas.width,
      y:   rndY ? Math.random() * canvas.height : canvas.height + 8,
      r:   Math.random() * 1.3 + 0.4,
      vx:  (Math.random() - 0.5) * 0.22,
      vy:  -(Math.random() * 0.32 + 0.1),
      op:  Math.random() * 0.32 + 0.07,
    };
  }

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    pts = Array.from({ length: 48 }, () => mkPt(true));
  }
  resize();
  window.addEventListener('resize', resize);

  function getColor() {
    const t = dom.html.getAttribute('data-theme');
    if (t === 'light') return '20,15,10';
    if (t === 'neon')  return '160,255,210';
    return '255,255,255';
  }

  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const col = getColor();
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.y < -6) Object.assign(p, mkPt(false));
      if (p.x < -6) p.x = canvas.width + 6;
      if (p.x > canvas.width + 6) p.x = -6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col},${p.op})`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  })();
}

// ── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(t) {
  if (!THEMES.includes(t)) return;
  dom.html.setAttribute('data-theme', t);
  dom.themeBtns.forEach(b => b.classList.toggle('theme-btn--active', b.dataset.theme === t));
  try { localStorage.setItem(THEME_KEY, t); } catch {}
}

function loadTheme() {
  let t = 'dark';
  try { t = localStorage.getItem(THEME_KEY) || 'dark'; } catch {}
  applyTheme(t);
}

// ── Screen & step transitions ────────────────────────────────────────────────

function transition(from, to, cb) {
  if (from && !from.classList.contains('is-hidden')) {
    from.classList.add('screen-exit');
    setTimeout(() => {
      from.classList.add('is-hidden');
      from.classList.remove('screen-exit');
      revealScreen(to, cb);
    }, 260);
  } else {
    revealScreen(to, cb);
  }
}

function revealScreen(el, cb) {
  el.classList.remove('is-hidden');
  el.classList.add('screen-enter');
  setTimeout(() => { el.classList.remove('screen-enter'); cb?.(); }, 380);
}

function showModeScreen() {
  // Reset steps to initial state
  dom.stepDiff.classList.add('is-hidden');
  dom.stepDiff.classList.remove('step-exit','step-enter','step-enter-bk');
  dom.stepModes.classList.remove('is-hidden','step-exit','step-enter','step-enter-bk');
  transition(dom.gameScreen, dom.modeScreen);
}

function showGameScreen() {
  transition(dom.modeScreen, dom.gameScreen);
}

function showStep(incoming, outgoing, enterClass) {
  outgoing.classList.add('step-exit');
  setTimeout(() => {
    outgoing.classList.add('is-hidden');
    outgoing.classList.remove('step-exit');
    incoming.classList.remove('is-hidden');
    incoming.classList.add(enterClass);
    setTimeout(() => incoming.classList.remove(enterClass), 280);
  }, 220);
}

// ── Mode & difficulty selection ──────────────────────────────────────────────

function selectMode(mode) {
  if (mode === MODES.FRIEND) {
    state.mode = MODES.FRIEND;
    state.difficulty = null;
    state.scores = { X: 0, O: 0 };
    dom.labelX.textContent  = 'Player X';
    dom.labelO.textContent  = 'Player O';
    dom.gameBadge.textContent = 'vs Friend';
    restartGame();
    showGameScreen();
  } else {
    showStep(dom.stepDiff, dom.stepModes, 'step-enter');
  }
}

function selectDifficulty(diff) {
  state.mode = MODES.AI;
  state.difficulty = diff;
  state.scores = { X: 0, O: 0 };
  dom.labelX.textContent = 'You';
  dom.labelO.textContent = 'AI';
  dom.gameBadge.textContent = `vs AI · ${cap(diff)}`;
  restartGame();
  showGameScreen();
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── AI ───────────────────────────────────────────────────────────────────────

function getAiMove(board) {
  if (state.difficulty === 'easy')       return randomMove(board);
  if (state.difficulty === 'medium')     return mediumMove(board);
  return bestMove(board);
}

function randomMove(board) {
  const empty = board.reduce((a, v, i) => (v === null ? [...a, i] : a), []);
  return empty[Math.floor(Math.random() * empty.length)];
}

function mediumMove(board) {
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = AI_PLAYER;
    if (checkWin(board)) { board[i] = null; return i; }
    board[i] = null;
  }
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = HUMAN_PLAYER;
    if (checkWin(board)) { board[i] = null; return i; }
    board[i] = null;
  }
  if (!board[4]) return 4;
  return randomMove(board);
}

function scoreBoard(board, depth) {
  const r = checkWin(board);
  if (r) return r.player === AI_PLAYER ? 10 - depth : depth - 10;
  return 0;
}

function minimax(board, depth, isMax) {
  const s = scoreBoard(board, depth);
  if (s) return s;
  if (board.every(Boolean)) return 0;
  if (isMax) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = AI_PLAYER;
      best = Math.max(best, minimax(board, depth + 1, false));
      board[i] = null;
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = HUMAN_PLAYER;
      best = Math.min(best, minimax(board, depth + 1, true));
      board[i] = null;
    }
    return best;
  }
}

function bestMove(board) {
  let best = -Infinity, move = -1;
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = AI_PLAYER;
    const s = minimax(board, 0, false);
    board[i] = null;
    if (s > best) { best = s; move = i; }
  }
  return move;
}

function scheduleAi() {
  state.isAiThinking = true;
  dom.statusMsg.textContent = 'AI is thinking...';
  dom.statusMsg.className = 'status-message status-message--o';
  setTimeout(() => {
    state.isAiThinking = false;
    handleMove(getAiMove([...state.board]));
  }, AI_DELAY);
}

// ── Modal ────────────────────────────────────────────────────────────────────

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function nextDiff() {
  const order = ['easy','medium','impossible'];
  const i = order.indexOf(state.difficulty);
  return i >= 0 && i < 2 ? order[i + 1] : null;
}

function showModal(outcome) {
  const m = MSG[outcome];
  dom.modalActions.innerHTML = '';

  if (outcome === 'friend_win') {
    dom.modalIcon.textContent  = '🎉';
    dom.modalTitle.textContent = `Player ${state.winner} wins!`;
    dom.modalSub.textContent   = 'Well played.';
  } else {
    dom.modalIcon.textContent  = m.icon;
    dom.modalTitle.textContent = pick(m.titles);
    dom.modalSub.textContent   = pick(m.subs);
  }

  const btns = [];
  const nd = nextDiff();

  if (outcome === 'win' && nd) {
    btns.push({ label: `Try ${cap(nd)}`, cls: 'primary', fn: () => upgradeAndRestart(nd) });
    btns.push({ label: 'Play Again', cls: 'secondary', fn: () => hideModal(() => restartGame()) });
  } else if (outcome === 'lose') {
    btns.push({ label: 'Try Again', cls: 'primary', fn: () => hideModal(() => restartGame()) });
  } else if (outcome === 'draw') {
    btns.push({ label: 'Rematch', cls: 'primary', fn: () => hideModal(() => restartGame()) });
  } else {
    btns.push({ label: 'Play Again', cls: 'primary', fn: () => hideModal(() => restartGame()) });
  }

  btns.push({ label: 'Menu', cls: 'ghost', fn: () => hideModal(() => { state.scores = { X: 0, O: 0 }; showModeScreen(); }) });

  btns.forEach(({ label, cls, fn }) => {
    const btn = document.createElement('button');
    btn.className = `modal-btn modal-btn--${cls}`;
    btn.textContent = label;
    btn.addEventListener('click', fn);
    dom.modalActions.appendChild(btn);
  });

  dom.modal.classList.remove('is-hidden');
}

function hideModal(cb) {
  dom.modalCard.classList.add('modal-out');
  dom.modal.classList.add('modal-out');
  setTimeout(() => {
    dom.modal.classList.add('is-hidden');
    dom.modal.classList.remove('modal-out');
    dom.modalCard.classList.remove('modal-out');
    cb?.();
  }, 220);
}

function upgradeAndRestart(diff) {
  state.difficulty = diff;
  state.scores = { X: 0, O: 0 };
  dom.gameBadge.textContent = `vs AI · ${cap(diff)}`;
  hideModal(() => restartGame());
}

// ── Game logic ───────────────────────────────────────────────────────────────

function checkWin(board) {
  for (const [a, b, c] of WINS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c])
      return { player: board[a], cells: [a, b, c] };
  }
  return null;
}

function handleMove(index) {
  if (state.board[index] !== null || state.isGameOver) return;

  state.board[index] = state.currentPlayer;
  const result = checkWin(state.board);

  if (result) {
    state.winner = result.player;
    state.winningCells = result.cells;
    state.isGameOver = true;
    state.scores[result.player] += 1;
  } else if (state.board.every(Boolean)) {
    state.isDraw = true;
    state.isGameOver = true;
  } else {
    state.currentPlayer = state.currentPlayer === PLAYERS.X ? PLAYERS.O : PLAYERS.X;
    if (state.mode === MODES.AI && state.currentPlayer === AI_PLAYER) {
      render(index);
      scheduleAi();
      return;
    }
  }

  render(index);

  if (state.isGameOver) {
    if (state.winner) launchConfetti(state.winner);
    setTimeout(() => {
      if (state.mode === MODES.AI) {
        if (state.winner === HUMAN_PLAYER) showModal('win');
        else if (state.winner === AI_PLAYER) showModal('lose');
        else showModal('draw');
      } else {
        showModal(state.isDraw ? 'draw' : 'friend_win');
      }
    }, state.winner ? 900 : 700);
  }
}

function restartGame() {
  state.board = Array(9).fill(null);
  state.currentPlayer = PLAYERS.X;
  state.winner = null; state.winningCells = [];
  state.isDraw = false; state.isGameOver = false; state.isAiThinking = false;
  render(null);
}

function resetScores() { state.scores = { X: 0, O: 0 }; restartGame(); }

// ── SVG marks ────────────────────────────────────────────────────────────────

function createMark(player) {
  const NS  = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('mark', `mark--${player.toLowerCase()}`);

  if (player === PLAYERS.X) {
    [[20,20,80,80],[80,20,20,80]].forEach(([x1,y1,x2,y2], idx) => {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1);
      l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.classList.add('mark__stroke', idx === 0 ? 'mark__stroke--1' : 'mark__stroke--2');
      svg.appendChild(l);
    });
  } else {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx','50'); c.setAttribute('cy','50'); c.setAttribute('r','30');
    c.classList.add('mark__stroke');
    svg.appendChild(c);
  }
  return svg;
}

// ── Confetti ─────────────────────────────────────────────────────────────────

function launchConfetti(winner) {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const pal = { X: ['#ff6b6b','#ff8e8e','#e8ff47','#fff'], O: ['#6bc8ff','#4ab5f5','#e8ff47','#fff'] };
  const cols = pal[winner] ?? [...pal.X,...pal.O];
  const ox = canvas.width / 2, oy = canvas.height * 0.42;

  const pts = Array.from({ length: 120 }, () => ({
    x: ox + (Math.random()-.5)*80, y: oy,
    vx: (Math.random()-.5)*16, vy: -(Math.random()*14+4),
    rot: Math.random()*360, rv: (Math.random()-.5)*14,
    col: cols[Math.floor(Math.random()*cols.length)],
    w: Math.random()*11+5, h: Math.random()*5+3,
    dot: Math.random() > 0.4, op: 1,
  }));

  const DUR = 2600; let t0 = null;

  (function frame(ts) {
    if (!t0) t0 = ts;
    const prog = Math.min((ts - t0) / DUR, 1);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pts) {
      p.vy += 0.42; p.vx *= 0.992;
      p.x += p.vx; p.y += p.vy; p.rot += p.rv;
      p.op = prog < 0.6 ? 1 : 1 - ((prog - 0.6) / 0.4);
      if (p.y > canvas.height + 20) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.op);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.col;
      if (p.dot) { ctx.beginPath(); ctx.arc(0, 0, p.w/2, 0, Math.PI*2); ctx.fill(); }
      else ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    }
    prog < 1 ? requestAnimationFrame(frame) : canvas.remove();
  })();
}

// ── Rendering ────────────────────────────────────────────────────────────────

function render(last) { renderBoard(last); renderStatus(); renderScores(); }

function renderBoard(last) {
  dom.cells.forEach((cell, i) => {
    const v = state.board[i];
    cell.classList.remove('cell--winner', 'cell--placed');
    if (!v) {
      cell.classList.remove('cell--x', 'cell--o', 'cell--taken');
      cell.querySelector('.mark')?.remove();
    } else if (!cell.querySelector('.mark')) {
      cell.classList.add(v === PLAYERS.X ? 'cell--x' : 'cell--o', 'cell--taken');
      cell.appendChild(createMark(v));
      cell.setAttribute('aria-label', `Cell ${i + 1}, ${v}`);
    }
    if (i === last) cell.classList.add('cell--placed');
    if (state.winningCells.includes(i)) cell.classList.add('cell--winner');
  });
  dom.board.classList.toggle('board--inactive', state.isGameOver || state.isAiThinking);
}

function renderStatus() {
  const msg = dom.statusMsg;
  const ai  = state.mode === MODES.AI;
  msg.className = 'status-message';
  if (state.winner) {
    msg.textContent = ai && state.winner === AI_PLAYER ? 'AI wins!' : ai ? 'You win!' : `Player ${state.winner} wins!`;
    msg.classList.add('status-message--winner');
  } else if (state.isDraw) {
    msg.textContent = "It's a draw.";
    msg.classList.add('status-message--draw');
  } else {
    msg.textContent = ai && state.currentPlayer === AI_PLAYER ? "AI's turn" : ai ? 'Your turn' : `Player ${state.currentPlayer}'s turn`;
    msg.classList.add(state.currentPlayer === PLAYERS.X ? 'status-message--x' : 'status-message--o');
  }
}

function renderScores() { updateScore(dom.scoreX, state.scores.X); updateScore(dom.scoreO, state.scores.O); }

function updateScore(el, n) {
  const cur = parseInt(el.textContent, 10);
  el.textContent = n;
  if (n > cur) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    el.addEventListener('transitionend', () => el.classList.remove('bump'), { once: true });
  }
}

// ── Events ───────────────────────────────────────────────────────────────────

dom.modeFriendBtn.addEventListener('click', () => selectMode(MODES.FRIEND));
dom.modeAiBtn.addEventListener('click',     () => selectMode(MODES.AI));
dom.backBtn.addEventListener('click',       () => showStep(dom.stepModes, dom.stepDiff, 'step-enter-bk'));

document.querySelectorAll('[data-diff]').forEach(btn =>
  btn.addEventListener('click', () => selectDifficulty(btn.dataset.diff))
);

dom.board.addEventListener('click', e => {
  if (state.isAiThinking) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  if (state.mode === MODES.AI && state.currentPlayer !== HUMAN_PLAYER) return;
  handleMove(parseInt(cell.dataset.index, 10));
});

dom.restartBtn.addEventListener('click',    restartGame);
dom.resetScoreBtn.addEventListener('click', resetScores);
dom.changeModeBtn.addEventListener('click', showModeScreen);
dom.themeBtns.forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.theme)));

// ── Init ─────────────────────────────────────────────────────────────────────

initParticles();
loadTheme();
dom.modeScreen.classList.add('screen-enter');
setTimeout(() => dom.modeScreen.classList.remove('screen-enter'), 400);
