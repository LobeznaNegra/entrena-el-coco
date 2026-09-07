
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.disableVerticalSwipes(); } catch (_) {}
}

const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

const LEVELS = {
  easy:   { label:"Fácil",   clues:46, emoji:"🟢" },
  medium: { label:"Medio",   clues:36, emoji:"🟡" },
  hard:   { label:"Difícil", clues:30, emoji:"🟠" },
  expert: { label:"Experto", clues:26, emoji:"🔴" }
};

const homeScreen = document.getElementById("homeScreen");
const gameScreen = document.getElementById("gameScreen");
const finishScreen = document.getElementById("finishScreen");
const board = document.getElementById("board");
const timerEl = document.getElementById("timer");
const mistakesEl = document.getElementById("mistakes");
const difficultyEl = document.getElementById("difficulty");
const gameTitle = document.getElementById("gameTitle");
const messageEl = document.getElementById("message");
const pauseOverlay = document.getElementById("pauseOverlay");
const notesBtn = document.getElementById("notesBtn");

let game = null;
let timerId = null;

function haptic(type="light") {
  try {
    if (!tg?.HapticFeedback) return;
    if (type === "selection") tg.HapticFeedback.selectionChanged();
    else if (type === "success" || type === "error") tg.HapticFeedback.notificationOccurred(type);
    else tg.HapticFeedback.impactOccurred(type);
  } catch (_) {}
}

function seededRandom(seed) {
  let x = seed >>> 0;
  return () => {
    x += 0x6D2B79F5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i=0; i<s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffled(arr, rnd) {
  const a = [...arr];
  for (let i=a.length-1; i>0; i--) {
    const j = Math.floor(rnd()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function transformedSolution(seed) {
  const rnd = seededRandom(seed);
  let grid = SOLUTION.split("").map(Number);

  // Permuta dígitos: conserva una solución válida.
  const nums = shuffled([1,2,3,4,5,6,7,8,9], rnd);
  const map = {};
  [1,2,3,4,5,6,7,8,9].forEach((n,i)=>map[n]=nums[i]);
  grid = grid.map(n=>map[n]);

  // Permuta filas dentro de bandas y bandas completas.
  let rows = [0,1,2,3,4,5,6,7,8];
  const bands = shuffled([0,1,2], rnd);
  rows = bands.flatMap(b => shuffled([b*3,b*3+1,b*3+2], rnd));

  // Permuta columnas dentro de pilas y pilas completas.
  const stacks = shuffled([0,1,2], rnd);
  const cols = stacks.flatMap(s => shuffled([s*3,s*3+1,s*3+2], rnd));

  const out = [];
  for (const r of rows) for (const c of cols) out.push(grid[r*9+c]);
  return out;
}

function makePuzzle(levelKey, seed) {
  const clues = LEVELS[levelKey].clues;
  const rnd = seededRandom(seed ^ 0xA53C9E1);
  const solution = transformedSolution(seed);
  const puzzle = [...solution];
  const indices = shuffled([...Array(81).keys()], rnd);

  // Eliminación simétrica para que el tablero se vea más "de sudoku".
  const removeTarget = 81 - clues;
  const removed = new Set();
  for (const i of indices) {
    if (removed.size >= removeTarget) break;
    const j = 80 - i;
    for (const k of [i,j]) {
      if (removed.size < removeTarget && !removed.has(k)) {
        removed.add(k);
        puzzle[k] = 0;
      }
    }
  }
  return { puzzle, solution };
}

function dailySeed() {
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  return hashString("daily-"+key);
}

function randomSeed() {
  return (Date.now() ^ Math.floor(Math.random()*0xffffffff)) >>> 0;
}

function emptyNotes() {
  return Array.from({length:81},()=>new Set());
}

function saveGame() {
  if (!game) return;
  const serial = {
    ...game,
    notes: game.notes.map(s=>[...s]),
    history: game.history.slice(-100)
  };
  localStorage.setItem("coco_sudoku_game", JSON.stringify(serial));
}

function restoreGame() {
  try {
    const raw = localStorage.getItem("coco_sudoku_game");
    if (!raw) return false;
    const g = JSON.parse(raw);
    if (!g || g.finished) return false;
    g.notes = g.notes.map(a=>new Set(a));
    game = g;
    showGame();
    return true;
  } catch (_) { return false; }
}

function startGame(levelKey, isDaily=false, forcedSeed=null) {
  const seed = forcedSeed ?? (isDaily ? dailySeed() : randomSeed());
  const { puzzle, solution } = makePuzzle(levelKey, seed);

  game = {
    levelKey, isDaily, seed,
    puzzle, solution,
    state:[...puzzle],
    notes:emptyNotes(),
    selected:null,
    mistakes:0,
    seconds:0,
    hints:3,
    noteMode:false,
    paused:false,
    finished:false,
    history:[]
  };
  saveGame();
  showGame();
}

function showGame() {
  homeScreen.classList.add("hidden");
  finishScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  gameTitle.textContent = game.isDaily ? "Sudoku del día" : "Sudoku";
  difficultyEl.textContent = `${LEVELS[game.levelKey].emoji} ${LEVELS[game.levelKey].label}`;
  mistakesEl.textContent = `Errores: ${game.mistakes}`;
  notesBtn.classList.toggle("active", !!game.noteMode);
  pauseOverlay.classList.toggle("hidden", !game.paused);
  messageEl.textContent = `💡 Pistas disponibles: ${game.hints}`;
  render();
  updateTimer();
  restartTimer();
}

function showHome() {
  stopTimer();
  gameScreen.classList.add("hidden");
  finishScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
}

function rowOf(i){ return Math.floor(i/9); }
function colOf(i){ return i%9; }
function boxOf(i){ return Math.floor(rowOf(i)/3)*3 + Math.floor(colOf(i)/3); }

function render() {
  board.innerHTML = "";
  const selectedValue = game.selected !== null ? game.state[game.selected] : 0;

  game.state.forEach((value,i)=>{
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    if (game.puzzle[i] !== 0) b.classList.add("given");
    if (game.selected === i) b.classList.add("selected");

    if (game.selected !== null && game.selected !== i) {
      if (rowOf(i)===rowOf(game.selected) || colOf(i)===colOf(game.selected) || boxOf(i)===boxOf(game.selected)) {
        b.classList.add("related");
      }
    }
    if (selectedValue && value === selectedValue && i !== game.selected) b.classList.add("same");

    if (value) {
      b.textContent = value;
      if (game.puzzle[i] === 0 && value !== game.solution[i]) b.classList.add("wrong");
    } else if (game.notes[i].size) {
      const ng = document.createElement("div");
      ng.className = "notes-grid";
      for (let n=1;n<=9;n++) {
        const s = document.createElement("span");
        s.textContent = game.notes[i].has(n) ? n : "";
        ng.appendChild(s);
      }
      b.appendChild(ng);
    }

    b.addEventListener("click",()=>{
      if (game.paused || game.finished) return;
      game.selected = i;
      haptic("selection");
      render();
      saveGame();
    });
    board.appendChild(b);
  });
}

function pushHistory(index) {
  game.history.push({
    index,
    value:game.state[index],
    notes:[...game.notes[index]]
  });
}

function placeNumber(n) {
  if (!game || game.paused || game.finished || game.selected===null) return;
  const i = game.selected;
  if (game.puzzle[i] !== 0) return;

  pushHistory(i);

  if (game.noteMode) {
    if (game.state[i] !== 0) game.state[i] = 0;
    if (game.notes[i].has(n)) game.notes[i].delete(n);
    else game.notes[i].add(n);
    haptic("selection");
  } else {
    game.notes[i].clear();
    game.state[i] = n;
    if (n !== game.solution[i]) {
      game.mistakes++;
      mistakesEl.textContent = `Errores: ${game.mistakes}`;
      haptic("error");
    } else {
      removeNoteFromPeers(i,n);
      haptic("light");
    }
  }
  render();
  saveGame();
  checkCompletion();
}

function removeNoteFromPeers(index, n) {
  for (let i=0;i<81;i++) {
    if (rowOf(i)===rowOf(index) || colOf(i)===colOf(index) || boxOf(i)===boxOf(index)) {
      game.notes[i].delete(n);
    }
  }
}

function erase() {
  if (!game || game.paused || game.selected===null) return;
  const i = game.selected;
  if (game.puzzle[i] !== 0) return;
  pushHistory(i);
  game.state[i] = 0;
  game.notes[i].clear();
  render(); saveGame();
}

function undo() {
  if (!game || game.paused || !game.history.length) return;
  const prev = game.history.pop();
  game.state[prev.index] = prev.value;
  game.notes[prev.index] = new Set(prev.notes);
  game.selected = prev.index;
  render(); saveGame();
}

function hint() {
  if (!game || game.paused || game.hints<=0) return;
  let candidates = [];
  for (let i=0;i<81;i++) if (game.state[i] !== game.solution[i] && game.puzzle[i]===0) candidates.push(i);
  if (!candidates.length) return;
  const i = game.selected!==null && candidates.includes(game.selected) ? game.selected : candidates[Math.floor(Math.random()*candidates.length)];
  pushHistory(i);
  game.state[i] = game.solution[i];
  game.notes[i].clear();
  game.selected = i;
  game.hints--;
  messageEl.textContent = game.hints ? `💡 Pistas disponibles: ${game.hints}` : "💡 Ya no quedan pistas.";
  haptic("light");
  render(); saveGame(); checkCompletion();
}

function checkBoard() {
  if (!game || game.paused) return;
  const wrong = game.state.some((v,i)=>v!==0 && v!==game.solution[i]);
  const empty = game.state.some(v=>v===0);
  if (wrong) {
    messageEl.textContent = "❌ Hay alguna casilla incorrecta.";
    haptic("error");
  } else if (empty) {
    messageEl.textContent = "✅ Todo correcto por ahora. Aún faltan casillas.";
  } else checkCompletion();
}

function checkCompletion() {
  if (!game.state.every((v,i)=>v===game.solution[i])) return;
  game.finished = true;
  stopTimer();
  saveGame();
  localStorage.removeItem("coco_sudoku_game");
  document.getElementById("finalTime").textContent = formatTime(game.seconds);
  document.getElementById("finalMistakes").textContent = game.mistakes;
  document.getElementById("finalLevel").textContent = LEVELS[game.levelKey].label;
  gameScreen.classList.add("hidden");
  finishScreen.classList.remove("hidden");
  haptic("success");
}

function formatTime(total) {
  const m=String(Math.floor(total/60)).padStart(2,"0");
  const s=String(total%60).padStart(2,"0");
  return `${m}:${s}`;
}

function updateTimer(){ if (game) timerEl.textContent = formatTime(game.seconds); }
function stopTimer(){ if (timerId) clearInterval(timerId); timerId=null; }
function restartTimer(){
  stopTimer();
  timerId=setInterval(()=>{
    if (game && !game.paused && !game.finished) {
      game.seconds++;
      updateTimer();
      if (game.seconds % 5 === 0) saveGame();
    }
  },1000);
}

function togglePause(force=null) {
  if (!game || game.finished) return;
  game.paused = force===null ? !game.paused : force;
  pauseOverlay.classList.toggle("hidden", !game.paused);
  saveGame();
}

document.querySelectorAll("[data-level]").forEach(btn=>{
  btn.addEventListener("click",()=>startGame(btn.dataset.level,false));
});

document.getElementById("dailyBtn").addEventListener("click",()=>startGame("medium",true));
document.querySelectorAll("[data-num]").forEach(btn=>btn.addEventListener("click",()=>placeNumber(Number(btn.dataset.num))));
document.getElementById("eraseBtn").addEventListener("click",erase);
document.getElementById("undoBtn").addEventListener("click",undo);
document.getElementById("hintBtn").addEventListener("click",hint);
document.getElementById("checkBtn").addEventListener("click",checkBoard);
document.getElementById("notesBtn").addEventListener("click",()=>{
  if (!game) return;
  game.noteMode=!game.noteMode;
  notesBtn.classList.toggle("active",game.noteMode);
  haptic("selection"); saveGame();
});
document.getElementById("pauseBtn").addEventListener("click",()=>togglePause());
document.getElementById("resumeBtn").addEventListener("click",()=>togglePause(false));
document.getElementById("backBtn").addEventListener("click",showHome);
document.getElementById("newBtn").addEventListener("click",()=>{
  if (!game) return;
  startGame(game.levelKey,game.isDaily,game.isDaily ? dailySeed() : null);
});
document.getElementById("playAgainBtn").addEventListener("click",()=>{
  startGame(game?.levelKey || "medium",false);
});
document.getElementById("homeBtn").addEventListener("click",showHome);

document.addEventListener("visibilitychange",()=>{
  if (document.hidden && game && !game.finished) togglePause(true);
});

const startParam = tg?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get("startapp");
if (startParam === "sudoku") {
  if (!restoreGame()) showHome();
} else {
  if (!restoreGame()) showHome();
}
