
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

const mainMenuScreen = document.getElementById("mainMenuScreen");
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
  mainMenuScreen.classList.add("hidden");
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

function hideAllScreens() {
  document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
}
function showMainMenu() {
  stopTimer();
  hideAllScreens();
  mainMenuScreen.classList.remove("hidden");
}
function showHome() {
  stopTimer();
  hideAllScreens();
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
  if (!document.hidden) return;
  if (game && !game.finished) togglePause(true);
  if (wg) toggleWordPause(true);
  if (pairsGame && !pairsGame.finished) togglePairsPause(true);
  if (mathGame && !mathGame.finished) toggleMathPause(true);
});



// ---------- MEMORIA FOTOGRÁFICA ----------
const memoryHomeScreen = document.getElementById("memoryHomeScreen");
const memoryObserveScreen = document.getElementById("memoryObserveScreen");
const memoryQuestionScreen = document.getElementById("memoryQuestionScreen");
const memoryFinishScreen = document.getElementById("memoryFinishScreen");

const MEMORY_LEVELS = {
  easy:{label:"Fácil", count:8, seconds:15},
  medium:{label:"Medio", count:12, seconds:12},
  hard:{label:"Difícil", count:16, seconds:10},
  expert:{label:"Experto", count:20, seconds:8}
};

const OBJECTS = [
  ["🍎","manzana"],["🚗","coche"],["🐶","perro"],["🌻","girasol"],["🎸","guitarra"],
  ["☕","taza"],["🔑","llave"],["🎈","globo"],["📚","libros"],["🕶️","gafas"],
  ["🍓","fresa"],["🦋","mariposa"],["⌚","reloj"],["⚽","balón"],["🕯️","vela"],
  ["🎁","regalo"],["🐱","gato"],["🍋","limón"],["✂️","tijeras"],["🧸","osito"],
  ["🌙","luna"],["🍕","pizza"],["🚲","bicicleta"],["🎩","sombrero"],["📷","cámara"],
  ["💎","diamante"],["🐸","rana"],["🍦","helado"],["✈️","avión"],["🎨","paleta"]
];

let mem = null;
let memTimer = null;

function showMemoryHome() {
  stopTimer();
  hideAllScreens();
  memoryHomeScreen.classList.remove("hidden");
}

function shuffleMemory(a) {
  const x=[...a];
  for(let i=x.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [x[i],x[j]]=[x[j],x[i]]; }
  return x;
}

function startMemory(levelKey) {
  const cfg=MEMORY_LEVELS[levelKey];
  const chosen=shuffleMemory(OBJECTS).slice(0,cfg.count);
  mem={levelKey, chosen, score:0, q:0, questions:[], remaining:cfg.seconds};
  buildMemoryQuestions();
  hideAllScreens();
  memoryObserveScreen.classList.remove("hidden");
  renderMemoryScene();
  document.getElementById("memoryCountdown").textContent=mem.remaining;
  clearInterval(memTimer);
  memTimer=setInterval(()=>{
    mem.remaining--;
    document.getElementById("memoryCountdown").textContent=mem.remaining;
    if(mem.remaining<=0){
      clearInterval(memTimer);
      showMemoryQuestion();
    }
  },1000);
}

function renderMemoryScene() {
  const scene=document.getElementById("memoryScene");
  scene.innerHTML="";
  mem.chosen.forEach((obj,i)=>{
    const d=document.createElement("div");
    d.className="memory-object";
    d.innerHTML=`<span>${obj[0]}</span><small>${i+1}</small>`;
    scene.appendChild(d);
  });
}

function buildMemoryQuestions() {
  const present=mem.chosen.map(x=>x[1]);
  const absent=OBJECTS.filter(x=>!present.includes(x[1]));
  const qs=[];

  // 1: objeto presente
  let correct=mem.chosen[Math.floor(Math.random()*mem.chosen.length)];
  let opts=shuffleMemory([correct,...shuffleMemory(absent).slice(0,3)]);
  qs.push({text:"¿Cuál de estos objetos aparecía en la escena?", correct:correct[1], options:opts.map(x=>`${x[0]} ${x[1]}`)});

  // 2: objeto ausente
  correct=absent[Math.floor(Math.random()*absent.length)];
  opts=shuffleMemory([correct,...shuffleMemory(mem.chosen).slice(0,3)]);
  qs.push({text:"¿Cuál de estos objetos NO aparecía?", correct:correct[1], options:opts.map(x=>`${x[0]} ${x[1]}`)});

  // 3: posición aproximada
  const pos=Math.floor(Math.random()*mem.chosen.length);
  correct=mem.chosen[pos];
  const distract=shuffleMemory(mem.chosen.filter((_,i)=>i!==pos)).slice(0,3);
  opts=shuffleMemory([correct,...distract]);
  qs.push({text:`¿Qué objeto ocupaba la posición número ${pos+1}?`, correct:correct[1], options:opts.map(x=>`${x[0]} ${x[1]}`)});

  // 4: primer objeto
  correct=mem.chosen[0];
  opts=shuffleMemory([correct,...shuffleMemory(mem.chosen.slice(1)).slice(0,3)]);
  qs.push({text:"¿Cuál era el primer objeto de la escena?", correct:correct[1], options:opts.map(x=>`${x[0]} ${x[1]}`)});

  // 5: recuento
  const count=mem.chosen.length;
  const nums=shuffleMemory([...new Set([count, Math.max(4,count-2), count+2, count+4])]).slice(0,4);
  qs.push({text:"¿Cuántos objetos había en total?", correct:String(count), options:nums.map(String)});
  mem.questions=qs;
}

function showMemoryQuestion() {
  hideAllScreens();
  memoryQuestionScreen.classList.remove("hidden");
  const q=mem.questions[mem.q];
  document.getElementById("memoryQuestionNumber").textContent=`Pregunta ${mem.q+1} de ${mem.questions.length}`;
  document.getElementById("memoryScore").textContent=`${mem.score} punto${mem.score===1?"":"s"}`;
  document.getElementById("memoryQuestion").textContent=q.text;
  document.getElementById("memoryFeedback").textContent="";
  const answers=document.getElementById("memoryAnswers");
  answers.innerHTML="";
  q.options.forEach(label=>{
    const b=document.createElement("button");
    b.className="memory-answer";
    b.textContent=label;
    b.addEventListener("click",()=>answerMemory(b,label,q));
    answers.appendChild(b);
  });
}

function normalizedAnswer(label) {
  const bits=label.trim().split(" ");
  return bits.length>1 ? bits.slice(1).join(" ") : label.trim();
}

function answerMemory(button,label,q) {
  const buttons=[...document.querySelectorAll(".memory-answer")];
  buttons.forEach(b=>b.disabled=true);
  const ans=normalizedAnswer(label);
  const ok=ans===q.correct || label===q.correct;
  if(ok){ mem.score++; button.classList.add("correct"); haptic("success"); document.getElementById("memoryFeedback").textContent="✅ ¡Correcto!"; }
  else {
    button.classList.add("wrong"); haptic("error");
    const right=buttons.find(b=>normalizedAnswer(b.textContent)===q.correct || b.textContent===q.correct);
    if(right) right.classList.add("correct");
    document.getElementById("memoryFeedback").textContent=`❌ La respuesta correcta era: ${q.correct}.`;
  }
  setTimeout(()=>{
    mem.q++;
    if(mem.q<mem.questions.length) showMemoryQuestion();
    else finishMemory();
  },900);
}

function finishMemory() {
  hideAllScreens();
  memoryFinishScreen.classList.remove("hidden");
  const pct=Math.round(mem.score/mem.questions.length*100);
  document.getElementById("memoryFinalScore").textContent=`${mem.score}/${mem.questions.length}`;
  document.getElementById("memoryFinalLevel").textContent=MEMORY_LEVELS[mem.levelKey].label;
  document.getElementById("memoryPercent").textContent=`${pct}%`;
  let title="¡A entrenar ese coco!";
  let text="Cada partida ayuda a afinar la atención y la memoria.";
  if(pct===100){title="¡Memoria de elefante! 🐘"; text="Has recordado absolutamente todo.";}
  else if(pct>=80){title="¡Memoria afiladísima! 🔥"; text="Casi no se te escapa una.";}
  else if(pct>=60){title="¡Muy buena memoria! 👏"; text="Buen nivel de atención visual.";}
  document.getElementById("memoryResultTitle").textContent=title;
  document.getElementById("memoryResultText").textContent=text;
}

document.getElementById("openSudokuBtn").addEventListener("click",showHome);
document.getElementById("openMemoryBtn").addEventListener("click",showMemoryHome);
document.getElementById("sudokuMenuBack").addEventListener("click",showMainMenu);
document.getElementById("memoryMenuBack").addEventListener("click",showMainMenu);
document.querySelectorAll("[data-memory-level]").forEach(b=>b.addEventListener("click",()=>startMemory(b.dataset.memoryLevel)));
document.getElementById("memoryAgainBtn").addEventListener("click",()=>startMemory(mem?.levelKey || "medium"));
document.getElementById("memoryHomeBtn").addEventListener("click",showMainMenu);



// ---------- SOPA DE LETRAS ----------
const wordHomeScreen=document.getElementById("wordHomeScreen");
const wordGameScreen=document.getElementById("wordGameScreen");
const wordFinishScreen=document.getElementById("wordFinishScreen");

const WORD_LEVELS={
  easy:{label:"Fácil",emoji:"🟢",size:8,count:5},
  medium:{label:"Medio",emoji:"🟡",size:10,count:7},
  hard:{label:"Difícil",emoji:"🟠",size:12,count:9},
  expert:{label:"Experto",emoji:"🔴",size:13,count:11}
};

const WORD_THEMES=[
  {name:"Naturaleza", words:["BOSQUE","LUNA","FLOR","NUBE","RIO","MONTE","MAR","ROCA","HOJA","SOL","NIEVE","PLAYA"]},
  {name:"Animales", words:["LOBO","GATO","PERRO","RANA","OSO","TIGRE","CEBRA","PANDA","FOCA","LINCE","PUMA","MONO"]},
  {name:"Espacio", words:["LUNA","MARTE","ORBITA","COMETA","ASTRO","SOL","NAVE","COSMOS","VENUS","SATURNO","GALAXIA","METEORO"]},
  {name:"Cocina", words:["TAZA","HORNO","PLATO","VASO","TENEDOR","SOPA","ARROZ","PASTA","PAN","SAL","ACEITE","FRUTA"]},
  {name:"Viajes", words:["TREN","AVION","MAPA","HOTEL","PLAYA","RUTA","MALETA","BARCO","TAXI","VIAJE","FARO","PUERTO"]}
];

let wg=null, wordTimerId=null, dragStart=null, dragCurrent=[];

function showWordHome(){ stopWordTimer(); hideAllScreens(); wordHomeScreen.classList.remove("hidden"); }

function cleanWord(w){ return w.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase(); }

function generateWordSearch(levelKey){
  const cfg=WORD_LEVELS[levelKey];
  const theme=WORD_THEMES[Math.floor(Math.random()*WORD_THEMES.length)];
  const candidates=shuffleMemory(theme.words.map(cleanWord).filter(w=>w.length<=cfg.size));
  const selected=candidates.slice(0,cfg.count);
  const grid=Array.from({length:cfg.size},()=>Array(cfg.size).fill(""));
  const placements=[];
  const dirs=[[0,1],[1,0],[1,1],[1,-1],[-1,1],[0,-1],[-1,0],[-1,-1]];

  for(const word of selected){
    let placed=false;
    for(let attempt=0;attempt<400 && !placed;attempt++){
      const [dr,dc]=dirs[Math.floor(Math.random()*dirs.length)];
      const r=Math.floor(Math.random()*cfg.size), c=Math.floor(Math.random()*cfg.size);
      const er=r+dr*(word.length-1), ec=c+dc*(word.length-1);
      if(er<0||er>=cfg.size||ec<0||ec>=cfg.size) continue;
      let ok=true;
      for(let k=0;k<word.length;k++){
        const ch=grid[r+dr*k][c+dc*k];
        if(ch && ch!==word[k]) {ok=false;break;}
      }
      if(!ok) continue;
      const cells=[];
      for(let k=0;k<word.length;k++){
        grid[r+dr*k][c+dc*k]=word[k];
        cells.push((r+dr*k)*cfg.size+(c+dc*k));
      }
      placements.push({word,cells});
      placed=true;
    }
  }
  const letters="ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
  for(let r=0;r<cfg.size;r++) for(let c=0;c<cfg.size;c++) if(!grid[r][c]) grid[r][c]=letters[Math.floor(Math.random()*letters.length)];
  return {cfg,theme,grid,placements};
}

function startWordGame(levelKey){
  const gen=generateWordSearch(levelKey);
  wg={levelKey,...gen,found:new Set(),seconds:0,paused:false};
  hideAllScreens(); wordGameScreen.classList.remove("hidden");
  document.getElementById("wordTheme").textContent=wg.theme.name;
  document.getElementById("wordLevel").textContent=`${wg.cfg.emoji} ${wg.cfg.label}`;
  renderWordBoard(); renderWordList(); updateWordStatus(); restartWordTimer();
}

function renderWordBoard(){
  const b=document.getElementById("wordBoard");
  b.innerHTML=""; b.style.gridTemplateColumns=`repeat(${wg.cfg.size},1fr)`;
  wg.grid.flat().forEach((ch,i)=>{
    const d=document.createElement("div"); d.className="word-cell"; d.dataset.index=i; d.textContent=ch;
    b.appendChild(d);
  });
  b.onpointerdown=e=>{
    if(wg.paused) return;
    const cell=e.target.closest(".word-cell"); if(!cell)return;
    e.preventDefault(); dragStart=Number(cell.dataset.index); dragCurrent=[dragStart];
    try{b.setPointerCapture(e.pointerId)}catch(_){}
    paintDrag();
  };
  b.onpointermove=e=>{
    if(dragStart===null||wg.paused)return;
    const el=document.elementFromPoint(e.clientX,e.clientY);
    const cell=el?.closest?.(".word-cell"); if(!cell)return;
    const end=Number(cell.dataset.index);
    dragCurrent=lineCells(dragStart,end,wg.cfg.size);
    paintDrag();
  };
  b.onpointerup=()=>finishDrag();
  b.onpointercancel=()=>finishDrag();
}

function lineCells(a,b,size){
  const ar=Math.floor(a/size), ac=a%size, br=Math.floor(b/size), bc=b%size;
  const rd=br-ar, cd=bc-ac;
  if(!(rd===0 || cd===0 || Math.abs(rd)===Math.abs(cd))) return [a];
  const len=Math.max(Math.abs(rd),Math.abs(cd))+1;
  const sr=Math.sign(rd), sc=Math.sign(cd), out=[];
  for(let k=0;k<len;k++) out.push((ar+sr*k)*size+(ac+sc*k));
  return out;
}

function paintDrag(){
  document.querySelectorAll(".word-cell").forEach(c=>c.classList.remove("selecting"));
  dragCurrent.forEach(i=>document.querySelector(`.word-cell[data-index="${i}"]`)?.classList.add("selecting"));
  paintFound();
}

function paintFound(){
  document.querySelectorAll(".word-cell").forEach(c=>c.classList.remove("found"));
  wg.placements.filter(p=>wg.found.has(p.word)).forEach(p=>p.cells.forEach(i=>document.querySelector(`.word-cell[data-index="${i}"]`)?.classList.add("found")));
}

function finishDrag(){
  if(dragStart===null)return;
  const selected=[...dragCurrent];
  const match=wg.placements.find(p=>{
    if(wg.found.has(p.word)) return false;
    const same=p.cells.length===selected.length && p.cells.every((x,i)=>x===selected[i]);
    const rev=p.cells.length===selected.length && [...p.cells].reverse().every((x,i)=>x===selected[i]);
    return same||rev;
  });
  if(match){ wg.found.add(match.word); haptic("success"); renderWordList(); updateWordStatus(); }
  else if(selected.length>1) haptic("error");
  dragStart=null; dragCurrent=[];
  document.querySelectorAll(".word-cell").forEach(c=>c.classList.remove("selecting"));
  paintFound();
  if(wg.found.size===wg.placements.length) finishWordGame();
}

function renderWordList(){
  const el=document.getElementById("wordList"); el.innerHTML="";
  wg.placements.forEach(p=>{
    const s=document.createElement("span"); s.className="word-chip"+(wg.found.has(p.word)?" found":""); s.textContent=p.word; el.appendChild(s);
  });
}
function updateWordStatus(){
  document.getElementById("wordTimer").textContent=formatTime(wg.seconds);
  document.getElementById("wordFoundCount").textContent=`${wg.found.size}/${wg.placements.length}`;
}
function stopWordTimer(){ if(wordTimerId)clearInterval(wordTimerId); wordTimerId=null; }
function restartWordTimer(){
  stopWordTimer(); wordTimerId=setInterval(()=>{if(wg&&!wg.paused){wg.seconds++;updateWordStatus();}},1000);
}
function toggleWordPause(force=null){
  if(!wg)return; wg.paused=force===null?!wg.paused:force;
  document.getElementById("wordPauseOverlay").classList.toggle("hidden",!wg.paused);
}
function finishWordGame(){
  stopWordTimer(); hideAllScreens(); wordFinishScreen.classList.remove("hidden");
  document.getElementById("wordFinalTime").textContent=formatTime(wg.seconds);
  document.getElementById("wordFinalFound").textContent=`${wg.found.size}/${wg.placements.length}`;
  document.getElementById("wordFinalLevel").textContent=wg.cfg.label;
  haptic("success");
}

document.getElementById("openWordSearchBtn").addEventListener("click",showWordHome);
document.getElementById("wordMenuBack").addEventListener("click",showMainMenu);
document.querySelectorAll("[data-word-level]").forEach(b=>b.addEventListener("click",()=>startWordGame(b.dataset.wordLevel)));
document.getElementById("wordBackBtn").addEventListener("click",showWordHome);
document.getElementById("wordPauseBtn").addEventListener("click",()=>toggleWordPause());
document.getElementById("wordResumeBtn").addEventListener("click",()=>toggleWordPause(false));
document.getElementById("wordAgainBtn").addEventListener("click",()=>startWordGame(wg?.levelKey||"medium"));
document.getElementById("wordHomeBtn").addEventListener("click",showMainMenu);



// ---------- MEMORIZA LAS PAREJAS ----------
const pairsHomeScreen = document.getElementById("pairsHomeScreen");
const pairsGameScreen = document.getElementById("pairsGameScreen");
const pairsFinishScreen = document.getElementById("pairsFinishScreen");

const PAIRS_LEVELS = {
  easy:   {label:"Fácil",   emoji:"🟢", pairs:6,  columns:3},
  medium: {label:"Medio",   emoji:"🟡", pairs:8,  columns:4},
  hard:   {label:"Difícil", emoji:"🟠", pairs:12, columns:4},
  expert: {label:"Experto", emoji:"🔴", pairs:15, columns:5}
};

const PAIRS_SYMBOLS = [
  "🐺","🦋","🌻","🌙","🍓","🎸","🐱","🚀","💎","🍕",
  "🦊","🌈","🐸","🍋","⚽","🎁","🌵","🍄","🧸","⭐",
  "🐼","🍉","🎨","🪐","🔥","🌸","🦄","🥝","🎈","🐬",
  "🍀","🦜","🍒","🎧","🛸","🧁","🐢","🌊","🔮","🪻"
];

let pairsGame = null;
let pairsTimerId = null;
let pairsMismatchTimer = null;

function showPairsHome() {
  stopPairsTimer();
  clearTimeout(pairsMismatchTimer);
  hideAllScreens();
  pairsHomeScreen.classList.remove("hidden");
}

function startPairsGame(levelKey) {
  const cfg = PAIRS_LEVELS[levelKey];
  const symbols = shuffleMemory(PAIRS_SYMBOLS).slice(0, cfg.pairs);
  const cards = shuffleMemory([...symbols, ...symbols]).map((symbol, id) => ({
    id, symbol, flipped:false, matched:false
  }));
  pairsGame = {
    levelKey, cfg, cards, first:null, second:null,
    lock:false, attempts:0, found:0, seconds:0, paused:false, finished:false
  };
  clearTimeout(pairsMismatchTimer);
  hideAllScreens();
  pairsGameScreen.classList.remove("hidden");
  document.getElementById("pairsLevel").textContent = `${cfg.emoji} ${cfg.label}`;
  document.getElementById("pairsMessage").textContent = "Toca dos tarjetas para buscar una pareja.";
  renderPairsBoard();
  updatePairsStatus();
  restartPairsTimer();
}

function renderPairsBoard() {
  const board = document.getElementById("pairsBoard");
  board.innerHTML = "";
  board.style.gridTemplateColumns = `repeat(${pairsGame.cfg.columns}, minmax(0,1fr))`;
  board.className = `pairs-board pairs-${pairsGame.levelKey}`;

  pairsGame.cards.forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pair-card";
    button.setAttribute("aria-label", card.flipped || card.matched ? `Tarjeta ${card.symbol}` : "Tarjeta boca abajo");
    if (card.flipped || card.matched) button.classList.add("flipped");
    if (card.matched) button.classList.add("matched");
    button.innerHTML = `
      <span class="pair-card-inner">
        <span class="pair-face pair-back"><span>🧠</span></span>
        <span class="pair-face pair-front"><span>${card.symbol}</span></span>
      </span>`;
    button.addEventListener("click", () => flipPairCard(index));
    board.appendChild(button);
  });
}

function flipPairCard(index) {
  if (!pairsGame || pairsGame.paused || pairsGame.finished || pairsGame.lock) return;
  const card = pairsGame.cards[index];
  if (card.flipped || card.matched) return;

  card.flipped = true;
  haptic("selection");

  if (pairsGame.first === null) {
    pairsGame.first = index;
    renderPairsBoard();
    return;
  }

  pairsGame.second = index;
  pairsGame.attempts++;
  pairsGame.lock = true;
  renderPairsBoard();
  updatePairsStatus();

  const firstIndex = pairsGame.first;
  const secondIndex = pairsGame.second;
  const first = pairsGame.cards[firstIndex];
  const second = pairsGame.cards[secondIndex];

  if (first.symbol === second.symbol) {
    first.matched = true;
    second.matched = true;
    pairsGame.found++;
    pairsGame.first = null;
    pairsGame.second = null;
    pairsGame.lock = false;
    document.getElementById("pairsMessage").textContent = "✅ ¡Pareja encontrada!";
    haptic("success");
    renderPairsBoard();
    updatePairsStatus();
    if (pairsGame.found === pairsGame.cfg.pairs) finishPairsGame();
    return;
  }

  document.getElementById("pairsMessage").textContent = "❌ No son iguales. Memoriza dónde estaban.";
  haptic("error");
  pairsMismatchTimer = setTimeout(() => {
    if (!pairsGame || pairsGame.finished) return;
    const a = pairsGame.cards[firstIndex];
    const b = pairsGame.cards[secondIndex];
    if (a && !a.matched) a.flipped = false;
    if (b && !b.matched) b.flipped = false;
    pairsGame.first = null;
    pairsGame.second = null;
    pairsGame.lock = false;
    renderPairsBoard();
    document.getElementById("pairsMessage").textContent = "Toca dos tarjetas para buscar una pareja.";
  }, 850);
}

function updatePairsStatus() {
  if (!pairsGame) return;
  document.getElementById("pairsTimer").textContent = formatTime(pairsGame.seconds);
  document.getElementById("pairsAttempts").textContent = `Intentos: ${pairsGame.attempts}`;
  document.getElementById("pairsFound").textContent = `${pairsGame.found}/${pairsGame.cfg.pairs}`;
}

function stopPairsTimer() {
  if (pairsTimerId) clearInterval(pairsTimerId);
  pairsTimerId = null;
}

function restartPairsTimer() {
  stopPairsTimer();
  pairsTimerId = setInterval(() => {
    if (pairsGame && !pairsGame.paused && !pairsGame.finished) {
      pairsGame.seconds++;
      updatePairsStatus();
    }
  }, 1000);
}

function togglePairsPause(force=null) {
  if (!pairsGame || pairsGame.finished) return;
  pairsGame.paused = force === null ? !pairsGame.paused : force;
  document.getElementById("pairsPauseOverlay").classList.toggle("hidden", !pairsGame.paused);
}

function finishPairsGame() {
  pairsGame.finished = true;
  stopPairsTimer();
  clearTimeout(pairsMismatchTimer);
  hideAllScreens();
  pairsFinishScreen.classList.remove("hidden");
  document.getElementById("pairsFinalTime").textContent = formatTime(pairsGame.seconds);
  document.getElementById("pairsFinalAttempts").textContent = pairsGame.attempts;
  document.getElementById("pairsFinalLevel").textContent = pairsGame.cfg.label;

  const extra = pairsGame.attempts - pairsGame.cfg.pairs;
  let title = "¡Todas encontradas! 🏆";
  let text = "Has completado el tablero. Cada partida entrena memoria visual y espacial.";
  if (extra === 0) {
    title = "¡Memoria perfecta! 🤯";
    text = "Has encontrado todas las parejas sin fallar ni una sola vez.";
  } else if (extra <= Math.ceil(pairsGame.cfg.pairs * 0.5)) {
    title = "¡Memoria afiladísima! 🔥";
    text = "Has necesitado muy pocos intentos extra para completar todas las parejas.";
  }
  document.getElementById("pairsResultTitle").textContent = title;
  document.getElementById("pairsResultText").textContent = text;
  haptic("success");
}

document.getElementById("openPairsBtn").addEventListener("click", showPairsHome);
document.getElementById("pairsMenuBack").addEventListener("click", showMainMenu);
document.querySelectorAll("[data-pairs-level]").forEach(b => b.addEventListener("click", () => startPairsGame(b.dataset.pairsLevel)));
document.getElementById("pairsBackBtn").addEventListener("click", showPairsHome);
document.getElementById("pairsPauseBtn").addEventListener("click", () => togglePairsPause());
document.getElementById("pairsResumeBtn").addEventListener("click", () => togglePairsPause(false));
document.getElementById("pairsAgainBtn").addEventListener("click", () => startPairsGame(pairsGame?.levelKey || "medium"));
document.getElementById("pairsHomeBtn").addEventListener("click", showMainMenu);


// ---------- DESAFÍO MATEMÁTICO ----------
const mathHomeScreen = document.getElementById("mathHomeScreen");
const mathGameScreen = document.getElementById("mathGameScreen");
const mathFinishScreen = document.getElementById("mathFinishScreen");

const MATH_LEVELS = {
  easy:   {label:"Fácil",   emoji:"🟢"},
  medium: {label:"Medio",   emoji:"🟡"},
  hard:   {label:"Difícil", emoji:"🟠"},
  expert: {label:"Experto", emoji:"🔴"}
};

let mathGame = null;
let mathTimerId = null;

function mathRand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function mathPick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function makeMathOptions(correct, spread=5) {
  const values = new Set([correct]);
  const offsets = [1,2,3,4,5,6,8,10,12,15,20];
  let guard = 0;
  while (values.size < 4 && guard < 100) {
    guard++;
    const delta = mathPick(offsets.slice(0, Math.max(4, Math.min(offsets.length, spread+3))));
    const sign = Math.random() < .5 ? -1 : 1;
    let v = correct + sign*delta;
    if (v < 0) v = correct + delta;
    values.add(v);
  }
  return shuffleMemory([...values]);
}

function mathChallenge(type,prompt,answer,explanation,spread=5){
  return {type,prompt,answer,explanation,options:makeMathOptions(answer,spread)};
}

function genEasyMath() {
  const generators = [
    () => {
      const a=mathRand(4,25), b=mathRand(3,20), add=Math.random()<.6;
      const answer=add?a+b:a-b;
      if (!add && answer<0) return mathChallenge("OPERACIÓN",`${b} + ${a} = ?`,a+b,`Sumamos ${b} + ${a}. El resultado es ${a+b}.`);
      return mathChallenge("OPERACIÓN",`${a} ${add?"+":"−"} ${b} = ?`,answer,`${add?"Sumamos":"Restamos"} ${a} ${add?"+":"−"} ${b}. El resultado es ${answer}.`);
    },
    () => {
      const start=mathRand(1,12), step=mathRand(2,6), seq=[0,1,2,3].map(i=>start+i*step), answer=start+4*step;
      return mathChallenge("SERIE NUMÉRICA",`${seq.join(" · ")} · ?`,answer,`La serie aumenta de ${step} en ${step}. Después de ${seq[3]} viene ${answer}.`);
    },
    () => {
      const x=mathRand(2,18), add=mathRand(3,12), total=x+add;
      return mathChallenge("NÚMERO QUE FALTA",`? + ${add} = ${total}`,x,`Buscamos el número que, sumado a ${add}, da ${total}: ${total} − ${add} = ${x}.`);
    },
    () => {
      const a=mathRand(2,9), mult=mathRand(2,5), answer=a*mult;
      return mathChallenge("RELACIÓN",`${a} → ${answer}\n${a+1} → ${(a+1)*mult}\n${a+2} → ?`,(a+2)*mult,`La regla es multiplicar cada número por ${mult}. ${a+2} × ${mult} = ${(a+2)*mult}.`,7);
    }
  ];
  return mathPick(generators)();
}

function genMediumMath() {
  const generators = [
    () => {
      const start=mathRand(2,8), mult=mathPick([2,3]), seq=[start,start*mult,start*mult**2,start*mult**3], answer=start*mult**4;
      return mathChallenge("SERIE NUMÉRICA",`${seq.join(" · ")} · ?`,answer,`Cada número se multiplica por ${mult}. ${seq[3]} × ${mult} = ${answer}.`,12);
    },
    () => {
      const a=mathRand(3,10), b=mathRand(2,7), c=mathRand(2,9), answer=a*b+c;
      return mathChallenge("OPERACIÓN ENCADENADA",`${a} × ${b} + ${c} = ?`,answer,`Primero multiplicamos: ${a} × ${b} = ${a*b}. Después sumamos ${c}: ${a*b} + ${c} = ${answer}.`,10);
    },
    () => {
      const mult=mathRand(2,5), add=mathRand(1,8), x=mathRand(3,9), answer=x*mult+add;
      return mathChallenge("DESCUBRE LA REGLA",`2 → ${2*mult+add}\n4 → ${4*mult+add}\n${x} → ?`,answer,`La regla es × ${mult} y después + ${add}. ${x} × ${mult} + ${add} = ${answer}.`,10);
    },
    () => {
      const n=mathRand(2,5), seq=[n,n+1,n+2,n+3].map(x=>x*x), answer=(n+4)**2;
      return mathChallenge("PATRÓN DE CUADRADOS",`${seq.join(" · ")} · ?`,answer,`Son cuadrados consecutivos: ${n}², ${n+1}², ${n+2}², ${n+3}²... El siguiente es ${n+4}² = ${answer}.`,15);
    }
  ];
  return mathPick(generators)();
}

function genHardMath() {
  const generators = [
    () => {
      const start=mathRand(1,8), first=mathRand(2,5); let cur=start, step=first; const seq=[cur];
      for(let i=0;i<4;i++){cur+=step;seq.push(cur);step+=2;}
      const answer=cur+step;
      return mathChallenge("DIFERENCIAS CRECIENTES",`${seq.join(" · ")} · ?`,answer,`Se suma ${first}, luego ${first+2}, ${first+4}, ${first+6} y después ${first+8}. Por eso ${cur} + ${step} = ${answer}.`,15);
    },
    () => {
      const start=mathRand(2,7); let a=start; const seq=[a];
      for(let i=0;i<4;i++){ a = i%2===0 ? a*2 : a+3; seq.push(a); }
      const answer=a*2;
      return mathChallenge("PATRÓN ALTERNADO",`${seq.join(" · ")} · ?`,answer,`La regla alterna ×2 y +3. Tras ${seq[4]} vuelve a tocar ×2: ${seq[4]} × 2 = ${answer}.`,15);
    },
    () => {
      const x=mathRand(4,9), answer=x*x+x;
      return mathChallenge("RELACIÓN NUMÉRICA",`3 → 12\n5 → 30\n${x} → ?`,answer,`Cada número se multiplica por el siguiente: n × (n + 1). ${x} × ${x+1} = ${answer}.`,18);
    },
    () => {
      const a=mathRand(4,9), b=mathRand(2,5), c=mathRand(3,8), answer=(a+b)*c;
      return mathChallenge("PARÉNTESIS",`(${a} + ${b}) × ${c} = ?`,answer,`Primero resolvemos el paréntesis: ${a} + ${b} = ${a+b}. Luego ${a+b} × ${c} = ${answer}.`,15);
    }
  ];
  return mathPick(generators)();
}

function genExpertMath() {
  const generators = [
    () => {
      const start=mathRand(1,5), d1=mathRand(2,4), inc=mathRand(2,3); let cur=start, diff=d1; const seq=[cur];
      for(let i=0;i<5;i++){cur+=diff;seq.push(cur);diff+=inc;}
      const answer=cur+diff;
      return mathChallenge("SEGUNDAS DIFERENCIAS",`${seq.join(" · ")} · ?`,answer,`Los saltos aumentan siempre en ${inc}: ${d1}, ${d1+inc}, ${d1+2*inc}... El siguiente salto es ${diff}, así que ${cur} + ${diff} = ${answer}.`,20);
    },
    () => {
      const base=mathRand(2,5), plus=mathRand(1,6); const vals=[base,base+1,base+2,base+3]; const seq=vals.map(n=>n*n+plus); const n=base+4, answer=n*n+plus;
      return mathChallenge("PATRÓN CUADRÁTICO",`${seq.join(" · ")} · ?`,answer,`Cada término sigue n² + ${plus}. El siguiente usa ${n}: ${n}² + ${plus} = ${answer}.`,20);
    },
    () => {
      const mult=mathRand(2,4), add=mathRand(2,8), x=mathRand(6,11), answer=x*mult+add;
      return mathChallenge("FUNCIÓN NUMÉRICA",`2 → ${2*mult+add}\n5 → ${5*mult+add}\n8 → ${8*mult+add}\n${x} → ?`,answer,`La misma regla se aplica siempre: × ${mult} y + ${add}. ${x} × ${mult} + ${add} = ${answer}.`,15);
    },
    () => {
      const a=mathRand(3,7), b=mathRand(2,6), c=mathRand(2,5), d=mathRand(1,8); const answer=a*b+c*d;
      return mathChallenge("OPERACIONES COMBINADAS",`${a} × ${b} + ${c} × ${d} = ?`,answer,`Primero las multiplicaciones: ${a}×${b}=${a*b} y ${c}×${d}=${c*d}. Después sumamos: ${a*b} + ${c*d} = ${answer}.`,20);
    }
  ];
  return mathPick(generators)();
}

function generateMathQuestion(levelKey) {
  if (levelKey === "easy") return genEasyMath();
  if (levelKey === "medium") return genMediumMath();
  if (levelKey === "hard") return genHardMath();
  return genExpertMath();
}

function buildMathQuestions(levelKey) {
  return Array.from({length:10},()=>generateMathQuestion(levelKey));
}

function showMathHome() {
  stopMathTimer();
  hideAllScreens();
  mathHomeScreen.classList.remove("hidden");
}

function startMathGame(levelKey) {
  const cfg=MATH_LEVELS[levelKey];
  mathGame={levelKey,cfg,questions:buildMathQuestions(levelKey),q:0,score:0,errors:0,streak:0,bestStreak:0,seconds:0,paused:false,answered:false,finished:false};
  hideAllScreens();
  mathGameScreen.classList.remove("hidden");
  document.getElementById("mathLevel").textContent=`${cfg.emoji} ${cfg.label}`;
  renderMathQuestion();
  updateMathStatus();
  restartMathTimer();
}

function renderMathQuestion() {
  const q=mathGame.questions[mathGame.q];
  mathGame.answered=false;
  document.getElementById("mathQuestionNumber").textContent=mathGame.q+1;
  document.getElementById("mathType").textContent=q.type;
  document.getElementById("mathPrompt").textContent=q.prompt;
  const answers=document.getElementById("mathAnswers");
  answers.innerHTML="";
  q.options.forEach(value=>{
    const b=document.createElement("button");
    b.type="button";
    b.className="math-answer";
    b.textContent=value;
    b.addEventListener("click",()=>answerMath(b,value,q));
    answers.appendChild(b);
  });
  document.getElementById("mathFeedback").classList.add("hidden");
  document.getElementById("mathNextBtn").textContent=mathGame.q===9 ? "Ver resultado 🏆" : "Siguiente reto ›";
}

function answerMath(button,value,q) {
  if (!mathGame || mathGame.paused || mathGame.answered) return;
  mathGame.answered=true;
  const buttons=[...document.querySelectorAll(".math-answer")];
  buttons.forEach(b=>b.disabled=true);
  const ok=Number(value)===Number(q.answer);
  if(ok){
    mathGame.score++;
    mathGame.streak++;
    mathGame.bestStreak=Math.max(mathGame.bestStreak,mathGame.streak);
    button.classList.add("correct");
    document.getElementById("mathFeedbackTitle").textContent="✅ ¡Correcto!";
    haptic("success");
  } else {
    mathGame.errors++;
    mathGame.streak=0;
    button.classList.add("wrong");
    const right=buttons.find(b=>Number(b.textContent)===Number(q.answer));
    if(right) right.classList.add("correct");
    document.getElementById("mathFeedbackTitle").textContent=`❌ La respuesta era ${q.answer}`;
    haptic("error");
  }
  document.getElementById("mathExplanation").textContent=q.explanation;
  document.getElementById("mathFeedback").classList.remove("hidden");
  updateMathStatus();
}

function nextMathQuestion() {
  if (!mathGame || !mathGame.answered) return;
  if (mathGame.q>=9) { finishMathGame(); return; }
  mathGame.q++;
  renderMathQuestion();
}

function updateMathStatus() {
  if(!mathGame)return;
  document.getElementById("mathTimer").textContent=formatTime(mathGame.seconds);
  document.getElementById("mathScore").textContent=`✅ ${mathGame.score}/10`;
  document.getElementById("mathStreak").textContent=mathGame.streak;
  document.getElementById("mathErrors").textContent=mathGame.errors;
}

function stopMathTimer(){ if(mathTimerId)clearInterval(mathTimerId); mathTimerId=null; }
function restartMathTimer(){
  stopMathTimer();
  mathTimerId=setInterval(()=>{
    if(mathGame && !mathGame.paused && !mathGame.finished){ mathGame.seconds++; updateMathStatus(); }
  },1000);
}

function toggleMathPause(force=null){
  if(!mathGame || mathGame.finished)return;
  mathGame.paused=force===null?!mathGame.paused:force;
  document.getElementById("mathPauseOverlay").classList.toggle("hidden",!mathGame.paused);
}

function finishMathGame() {
  mathGame.finished=true;
  stopMathTimer();
  hideAllScreens();
  mathFinishScreen.classList.remove("hidden");
  document.getElementById("mathFinalScore").textContent=`${mathGame.score}/10`;
  document.getElementById("mathFinalErrors").textContent=mathGame.errors;
  document.getElementById("mathFinalStreak").textContent=mathGame.bestStreak;
  document.getElementById("mathFinalTime").textContent=formatTime(mathGame.seconds);

  let title="¡Buen entrenamiento! 🧠";
  let text=`Has completado el nivel ${mathGame.cfg.label}. Sigue entrenando para reconocer los patrones cada vez más rápido.`;
  if(mathGame.score===10){ title="¡Coco matemático perfecto! 🤯"; text=`10 de 10 en nivel ${mathGame.cfg.label}. No se te ha escapado ni un reto.`; }
  else if(mathGame.score>=8){ title="¡Razonamiento afiladísimo! 🔥"; text=`${mathGame.score} de 10 en nivel ${mathGame.cfg.label}. Muy buena lectura de patrones y operaciones.`; }
  else if(mathGame.score>=6){ title="¡Buen coco calculador! 👏"; text=`${mathGame.score} de 10 en nivel ${mathGame.cfg.label}. Buen trabajo de lógica numérica.`; }
  document.getElementById("mathResultTitle").textContent=title;
  document.getElementById("mathResultText").textContent=text;
  haptic("success");
}

document.getElementById("openMathBtn").addEventListener("click",showMathHome);
document.getElementById("mathMenuBack").addEventListener("click",showMainMenu);
document.querySelectorAll("[data-math-level]").forEach(b=>b.addEventListener("click",()=>startMathGame(b.dataset.mathLevel)));
document.getElementById("mathBackBtn").addEventListener("click",showMathHome);
document.getElementById("mathPauseBtn").addEventListener("click",()=>toggleMathPause());
document.getElementById("mathResumeBtn").addEventListener("click",()=>toggleMathPause(false));
document.getElementById("mathNextBtn").addEventListener("click",nextMathQuestion);
document.getElementById("mathAgainBtn").addEventListener("click",()=>startMathGame(mathGame?.levelKey||"medium"));
document.getElementById("mathHomeBtn").addEventListener("click",showMainMenu);


// ---------- ARMA EL PUZZLE ----------
const puzzleHomeScreen=document.getElementById("puzzleHomeScreen");
const puzzlePreviewScreen=document.getElementById("puzzlePreviewScreen");
const puzzleGameScreen=document.getElementById("puzzleGameScreen");
const puzzleFinishScreen=document.getElementById("puzzleFinishScreen");

const PUZZLE_LEVELS={
  easy:{label:"Fácil",emoji:"🟢",size:3,preview:6},
  medium:{label:"Medio",emoji:"🟡",size:4,preview:5},
  hard:{label:"Difícil",emoji:"🟠",size:5,preview:4},
  expert:{label:"Experto",emoji:"🔴",size:6,preview:3}
};

function svgData(svg){
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\n\s*/g," "))}`;
}

const PUZZLE_IMAGES=[
  {name:"Montañas al atardecer",image:svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6b4fd8"/><stop offset=".55" stop-color="#e88972"/><stop offset="1" stop-color="#ffd28a"/></linearGradient><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#27304f"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="800" height="800" fill="url(#s)"/><circle cx="610" cy="190" r="72" fill="#ffe7a6" opacity=".95"/><path d="M0 560 155 360 280 505 410 305 560 500 690 385 800 530V800H0Z" fill="url(#m)"/><path d="M0 640 180 515 340 635 535 455 800 650V800H0Z" fill="#172033" opacity=".92"/><path d="M0 690Q200 625 400 690T800 680V800H0Z" fill="#405b75"/><path d="M0 730Q180 680 360 730T800 715V800H0Z" fill="#27485f"/><g fill="#fff" opacity=".8"><circle cx="95" cy="125" r="5"/><circle cx="180" cy="82" r="4"/><circle cx="325" cy="145" r="4"/><circle cx="735" cy="90" r="5"/></g></svg>`)},
  {name:"Noche cósmica",image:svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><radialGradient id="g" cx="55%" cy="40%" r="70%"><stop stop-color="#40338f"/><stop offset=".55" stop-color="#15153c"/><stop offset="1" stop-color="#070914"/></radialGradient></defs><rect width="800" height="800" fill="url(#g)"/><g fill="#fff"><circle cx="85" cy="115" r="5"/><circle cx="150" cy="245" r="3"/><circle cx="235" cy="80" r="4"/><circle cx="315" cy="180" r="6"/><circle cx="420" cy="90" r="3"/><circle cx="535" cy="150" r="5"/><circle cx="690" cy="105" r="4"/><circle cx="730" cy="280" r="6"/><circle cx="95" cy="420" r="4"/><circle cx="220" cy="560" r="5"/><circle cx="655" cy="620" r="5"/><circle cx="525" cy="715" r="4"/></g><circle cx="415" cy="420" r="145" fill="#6ed6ff"/><circle cx="370" cy="375" r="36" fill="#8be6ff" opacity=".6"/><path d="M245 450c105 40 238 48 358-8" fill="none" stroke="#f6a4ff" stroke-width="34" stroke-linecap="round" opacity=".72"/><path d="M218 430c130 78 315 92 455 6" fill="none" stroke="#f1d3ff" stroke-width="8" opacity=".8"/><circle cx="625" cy="300" r="35" fill="#ffbf69"/><circle cx="180" cy="670" r="24" fill="#ef78b7"/></svg>`)},
  {name:"Flores de colores",image:svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#193b3d"/><stop offset="1" stop-color="#0b2024"/></linearGradient></defs><rect width="800" height="800" fill="url(#b)"/><g stroke="#5cab79" stroke-width="14" stroke-linecap="round"><path d="M170 800Q210 520 250 280"/><path d="M405 800Q390 540 415 250"/><path d="M650 800Q610 545 590 330"/></g><g><g transform="translate(245 265)"><g fill="#ff8fb1"><ellipse rx="46" ry="92" transform="rotate(0) translate(0 -55)"/><ellipse rx="46" ry="92" transform="rotate(72) translate(0 -55)"/><ellipse rx="46" ry="92" transform="rotate(144) translate(0 -55)"/><ellipse rx="46" ry="92" transform="rotate(216) translate(0 -55)"/><ellipse rx="46" ry="92" transform="rotate(288) translate(0 -55)"/></g><circle r="48" fill="#ffd166"/></g><g transform="translate(425 245)"><g fill="#8b7cff"><ellipse rx="42" ry="82" transform="rotate(0) translate(0 -50)"/><ellipse rx="42" ry="82" transform="rotate(72) translate(0 -50)"/><ellipse rx="42" ry="82" transform="rotate(144) translate(0 -50)"/><ellipse rx="42" ry="82" transform="rotate(216) translate(0 -50)"/><ellipse rx="42" ry="82" transform="rotate(288) translate(0 -50)"/></g><circle r="43" fill="#ffe08a"/></g><g transform="translate(590 330)"><g fill="#ffb45f"><ellipse rx="38" ry="76" transform="rotate(0) translate(0 -46)"/><ellipse rx="38" ry="76" transform="rotate(72) translate(0 -46)"/><ellipse rx="38" ry="76" transform="rotate(144) translate(0 -46)"/><ellipse rx="38" ry="76" transform="rotate(216) translate(0 -46)"/><ellipse rx="38" ry="76" transform="rotate(288) translate(0 -46)"/></g><circle r="40" fill="#6a3c1e"/></g></g><g fill="#7fd59a"><ellipse cx="190" cy="555" rx="55" ry="24" transform="rotate(-25 190 555)"/><ellipse cx="470" cy="525" rx="58" ry="25" transform="rotate(30 470 525)"/><ellipse cx="620" cy="610" rx="52" ry="22" transform="rotate(-20 620 610)"/></g></svg>`)},
  {name:"Faro junto al mar",image:svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#67c8ea"/><stop offset="1" stop-color="#d8f2f7"/></linearGradient></defs><rect width="800" height="800" fill="url(#sky)"/><circle cx="650" cy="145" r="70" fill="#ffe98d"/><path d="M0 490Q170 450 330 495T800 485V800H0Z" fill="#2f9fc3"/><path d="M0 550Q180 505 360 550T800 540" fill="none" stroke="#bfeafa" stroke-width="18" opacity=".8"/><path d="M0 635Q220 585 440 635T800 620" fill="none" stroke="#a9e0f4" stroke-width="14" opacity=".7"/><path d="M485 485 555 485 585 720 455 720Z" fill="#f8f4e8"/><path d="M482 505H558L566 570H474Z" fill="#df5c5c"/><rect x="485" y="440" width="70" height="55" rx="7" fill="#323a4d"/><polygon points="470,442 520,402 570,442" fill="#b23f49"/><rect x="510" y="455" width="22" height="25" fill="#ffe88a"/><path d="M430 720Q520 645 615 720Z" fill="#5c6d5b"/><g fill="#fff"><path d="M120 220q28-28 56 0q28-28 56 0q-28-12-56 10q-28-22-56-10Z"/><path d="M245 315q22-22 44 0q22-22 44 0q-22-9-44 8q-22-17-44-8Z"/></g></svg>`)},
  {name:"Bosque y luna",image:svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#172a46"/><stop offset="1" stop-color="#09141c"/></linearGradient></defs><rect width="800" height="800" fill="url(#n)"/><circle cx="580" cy="170" r="95" fill="#e9ecce"/><circle cx="620" cy="145" r="95" fill="#172a46"/><g fill="#204634"><polygon points="110,690 225,330 340,690"/><polygon points="260,720 390,275 520,720"/><polygon points="455,700 575,355 695,700"/><polygon points="590,735 690,410 790,735"/></g><g fill="#2d6243"><polygon points="20,740 125,420 230,740"/><polygon points="345,755 465,410 585,755"/></g><rect y="700" width="800" height="100" fill="#0a1a18"/><path d="M70 730Q190 665 315 728T560 722T790 715" fill="none" stroke="#416e73" stroke-width="18" opacity=".55"/><g fill="#fff" opacity=".8"><circle cx="95" cy="120" r="4"/><circle cx="210" cy="185" r="3"/><circle cx="350" cy="105" r="5"/><circle cx="740" cy="130" r="4"/></g></svg>`)},
  {name:"Formas geométricas",image:svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#101827"/><circle cx="155" cy="155" r="115" fill="#ff6b8a"/><rect x="315" y="70" width="210" height="210" rx="28" fill="#6c63ff" transform="rotate(12 420 175)"/><polygon points="650,65 780,285 520,285" fill="#ffd166"/><rect x="80" y="400" width="230" height="230" rx="115" fill="#41d3bd"/><polygon points="430,355 575,430 550,595 390,620 320,480" fill="#ff934f"/><circle cx="665" cy="580" r="120" fill="#57a9ff"/><circle cx="665" cy="580" r="55" fill="#101827"/><path d="M85 740H715" stroke="#f7f7fb" stroke-width="18" stroke-linecap="round" opacity=".55"/></svg>`)}
];

let puzzleGame=null, puzzleTimerId=null, puzzlePreviewTimerId=null, puzzlePeekTimerId=null;

function showPuzzleHome(){
  stopPuzzleTimer(); stopPuzzlePreviewTimer();
  hideAllScreens(); puzzleHomeScreen.classList.remove("hidden");
}

function stopPuzzlePreviewTimer(){ if(puzzlePreviewTimerId)clearInterval(puzzlePreviewTimerId); puzzlePreviewTimerId=null; }

function startPuzzle(levelKey){
  const cfg=PUZZLE_LEVELS[levelKey];
  const pic=PUZZLE_IMAGES[Math.floor(Math.random()*PUZZLE_IMAGES.length)];
  const total=cfg.size*cfg.size;
  puzzleGame={levelKey,cfg,pic,order:[...Array(total).keys()],selected:null,moves:0,seconds:0,paused:false,finished:false,previewRemaining:cfg.preview};
  shufflePuzzleOrder();
  hideAllScreens(); puzzlePreviewScreen.classList.remove("hidden");
  document.getElementById("puzzlePreviewName").textContent=pic.name;
  document.getElementById("puzzlePreviewImage").style.backgroundImage=`url("${pic.image}")`;
  document.getElementById("puzzleCountdown").textContent=puzzleGame.previewRemaining;
  stopPuzzlePreviewTimer();
  puzzlePreviewTimerId=setInterval(()=>{
    if(!puzzleGame)return;
    puzzleGame.previewRemaining--;
    document.getElementById("puzzleCountdown").textContent=Math.max(0,puzzleGame.previewRemaining);
    if(puzzleGame.previewRemaining<=0) beginPuzzlePlay();
  },1000);
}

function shufflePuzzleOrder(){
  if(!puzzleGame)return;
  const a=[...puzzleGame.order];
  do {
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  } while(a.every((v,i)=>v===i));
  puzzleGame.order=a;
}

function beginPuzzlePlay(){
  if(!puzzleGame)return;
  stopPuzzlePreviewTimer();
  hideAllScreens(); puzzleGameScreen.classList.remove("hidden");
  document.getElementById("puzzleGameTitle").textContent=puzzleGame.pic.name;
  document.getElementById("puzzleLevel").textContent=`${puzzleGame.cfg.emoji} ${puzzleGame.cfg.label}`;
  document.getElementById("puzzlePauseOverlay").classList.add("hidden");
  puzzleGame.paused=false;
  puzzleGame.seconds=0;
  puzzleGame.moves=0;
  puzzleGame.selected=null;
  renderPuzzle(); updatePuzzleStatus(); restartPuzzleTimer();
}

function tileBackgroundPosition(tile,size){
  const row=Math.floor(tile/size), col=tile%size;
  const x=size===1?0:(col/(size-1))*100;
  const y=size===1?0:(row/(size-1))*100;
  return `${x}% ${y}%`;
}

function renderPuzzle(){
  if(!puzzleGame)return;
  const board=document.getElementById("puzzleBoard");
  const size=puzzleGame.cfg.size;
  board.innerHTML="";
  board.style.gridTemplateColumns=`repeat(${size},1fr)`;
  board.className=`puzzle-board puzzle-${size}`;
  puzzleGame.order.forEach((tile,pos)=>{
    const b=document.createElement("button");
    b.type="button";
    b.className="puzzle-tile";
    if(puzzleGame.selected===pos)b.classList.add("selected");
    if(tile===pos)b.classList.add("correct");
    b.style.backgroundImage=`url("${puzzleGame.pic.image}")`;
    b.style.backgroundSize=`${size*100}% ${size*100}%`;
    b.style.backgroundPosition=tileBackgroundPosition(tile,size);
    b.setAttribute("aria-label",`Pieza ${pos+1}`);
    b.addEventListener("click",()=>selectPuzzleTile(pos));
    board.appendChild(b);
  });
}

function selectPuzzleTile(pos){
  if(!puzzleGame || puzzleGame.paused || puzzleGame.finished)return;
  if(puzzleGame.selected===null){
    puzzleGame.selected=pos; haptic("selection"); renderPuzzle(); return;
  }
  if(puzzleGame.selected===pos){
    puzzleGame.selected=null; renderPuzzle(); return;
  }
  const a=puzzleGame.selected;
  [puzzleGame.order[a],puzzleGame.order[pos]]=[puzzleGame.order[pos],puzzleGame.order[a]];
  puzzleGame.selected=null;
  puzzleGame.moves++;
  haptic("light");
  renderPuzzle(); updatePuzzleStatus();
  if(puzzleGame.order.every((v,i)=>v===i)) finishPuzzle();
}

function puzzleCorrectCount(){ return puzzleGame ? puzzleGame.order.filter((v,i)=>v===i).length : 0; }

function updatePuzzleStatus(){
  if(!puzzleGame)return;
  const total=puzzleGame.order.length;
  document.getElementById("puzzleTimer").textContent=formatTime(puzzleGame.seconds);
  document.getElementById("puzzleMoves").textContent=`Mov.: ${puzzleGame.moves}`;
  document.getElementById("puzzleCorrect").textContent=`${puzzleCorrectCount()}/${total}`;
}

function stopPuzzleTimer(){ if(puzzleTimerId)clearInterval(puzzleTimerId); puzzleTimerId=null; }
function restartPuzzleTimer(){
  stopPuzzleTimer();
  puzzleTimerId=setInterval(()=>{
    if(puzzleGame && !puzzleGame.paused && !puzzleGame.finished){ puzzleGame.seconds++; updatePuzzleStatus(); }
  },1000);
}

function togglePuzzlePause(force=null){
  if(!puzzleGame || puzzleGame.finished)return;
  puzzleGame.paused=force===null?!puzzleGame.paused:force;
  puzzleGame.selected=null;
  document.getElementById("puzzlePauseOverlay").classList.toggle("hidden",!puzzleGame.paused);
  renderPuzzle();
}

function peekPuzzle(){
  if(!puzzleGame || puzzleGame.paused || puzzleGame.finished)return;
  puzzleGame.paused=true;
  puzzleGame.selected=null;
  const overlay=document.getElementById("puzzlePauseOverlay");
  overlay.classList.remove("hidden");
  overlay.innerHTML=`<div class="puzzle-peek-image" style="background-image:url('${puzzleGame.pic.image}')"></div><strong>${puzzleGame.pic.name}</strong><small>La imagen se ocultará en 2 segundos</small>`;
  clearTimeout(puzzlePeekTimerId);
  puzzlePeekTimerId=setTimeout(()=>{
    puzzleGame.paused=false;
    overlay.innerHTML='<div>⏸️</div><strong>Partida en pausa</strong><button id="puzzleResumeBtn">Continuar</button>';
    document.getElementById("puzzleResumeBtn").addEventListener("click",()=>togglePuzzlePause(false));
    overlay.classList.add("hidden");
  },2000);
}

function reshufflePuzzle(){
  if(!puzzleGame || puzzleGame.paused || puzzleGame.finished)return;
  shufflePuzzleOrder();
  puzzleGame.selected=null;
  puzzleGame.moves++;
  document.getElementById("puzzleMessage").textContent="🔀 Puzzle mezclado de nuevo.";
  renderPuzzle(); updatePuzzleStatus(); haptic("selection");
}

function finishPuzzle(){
  if(!puzzleGame)return;
  puzzleGame.finished=true;
  stopPuzzleTimer();
  hideAllScreens(); puzzleFinishScreen.classList.remove("hidden");
  document.getElementById("puzzleFinalImage").style.backgroundImage=`url("${puzzleGame.pic.image}")`;
  document.getElementById("puzzleFinalTime").textContent=formatTime(puzzleGame.seconds);
  document.getElementById("puzzleFinalMoves").textContent=puzzleGame.moves;
  document.getElementById("puzzleFinalLevel").textContent=puzzleGame.cfg.label;
  document.getElementById("puzzleResultTitle").textContent="¡Puzzle completado! 🧩";
  document.getElementById("puzzleResultText").textContent=`Has reconstruido “${puzzleGame.pic.name}” con ${puzzleGame.moves} movimientos.`;
  haptic("success");
}

document.getElementById("openPuzzleBtn").addEventListener("click",showPuzzleHome);
document.getElementById("puzzleMenuBack").addEventListener("click",showMainMenu);
document.querySelectorAll("[data-puzzle-level]").forEach(b=>b.addEventListener("click",()=>startPuzzle(b.dataset.puzzleLevel)));
document.getElementById("puzzleSkipPreviewBtn").addEventListener("click",beginPuzzlePlay);
document.getElementById("puzzleBackBtn").addEventListener("click",showPuzzleHome);
document.getElementById("puzzlePauseBtn").addEventListener("click",()=>togglePuzzlePause());
document.getElementById("puzzleResumeBtn").addEventListener("click",()=>togglePuzzlePause(false));
document.getElementById("puzzlePeekBtn").addEventListener("click",peekPuzzle);
document.getElementById("puzzleShuffleBtn").addEventListener("click",reshufflePuzzle);
document.getElementById("puzzleAgainBtn").addEventListener("click",()=>startPuzzle(puzzleGame?.levelKey||"medium"));
document.getElementById("puzzleHomeBtn").addEventListener("click",showMainMenu);

const startParam = tg?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get("startapp");
if (startParam === "sudoku") {
  if (!restoreGame()) showHome();
} else if (startParam === "memoria") {
  showMemoryHome();
} else if (startParam === "sopa") {
  showWordHome();
} else if (startParam === "parejas") {
  showPairsHome();
} else if (startParam === "mates" || startParam === "matematicas") {
  showMathHome();
} else if (startParam === "puzzle" || startParam === "puzzles") {
  showPuzzleHome();
} else {
  showMainMenu();
}
