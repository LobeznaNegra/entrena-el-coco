
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.disableVerticalSwipes(); } catch (_) {}
}

const puzzle = [
  5,3,0, 0,7,0, 0,0,0,
  6,0,0, 1,9,5, 0,0,0,
  0,9,8, 0,0,0, 0,6,0,

  8,0,0, 0,6,0, 0,0,3,
  4,0,0, 8,0,3, 0,0,1,
  7,0,0, 0,2,0, 0,0,6,

  0,6,0, 0,0,0, 2,8,0,
  0,0,0, 4,1,9, 0,0,5,
  0,0,0, 0,8,0, 0,7,9
];

const solution = [
  5,3,4, 6,7,8, 9,1,2,
  6,7,2, 1,9,5, 3,4,8,
  1,9,8, 3,4,2, 5,6,7,

  8,5,9, 7,6,1, 4,2,3,
  4,2,6, 8,5,3, 7,9,1,
  7,1,3, 9,2,4, 8,5,6,

  9,6,1, 5,3,7, 2,8,4,
  2,8,7, 4,1,9, 6,3,5,
  3,4,5, 2,8,6, 1,7,9
];

const state = [...puzzle];
let selected = null;
let mistakes = 0;
let seconds = 0;
let finished = false;

const board = document.getElementById("board");
const timer = document.getElementById("timer");
const mistakesEl = document.getElementById("mistakes");
const message = document.getElementById("message");

function rowOf(i) { return Math.floor(i / 9); }
function colOf(i) { return i % 9; }
function boxOf(i) { return Math.floor(rowOf(i)/3)*3 + Math.floor(colOf(i)/3); }

function render() {
  board.innerHTML = "";
  state.forEach((value, i) => {
    const b = document.createElement("button");
    b.className = "cell";
    b.type = "button";
    b.dataset.index = i;
    b.textContent = value || "";

    if (puzzle[i] !== 0) b.classList.add("given");
    if (selected === i) b.classList.add("selected");

    if (selected !== null && selected !== i) {
      if (rowOf(selected) === rowOf(i) || colOf(selected) === colOf(i) || boxOf(selected) === boxOf(i)) {
        b.classList.add("related");
      }
    }

    if (value && puzzle[i] === 0 && value !== solution[i]) b.classList.add("wrong");

    b.addEventListener("click", () => {
      selected = i;
      render();
      haptic("selection");
    });

    board.appendChild(b);
  });
}

function haptic(kind="impact") {
  try {
    if (!tg?.HapticFeedback) return;
    if (kind === "selection") tg.HapticFeedback.selectionChanged();
    else tg.HapticFeedback.impactOccurred("light");
  } catch (_) {}
}

function setNumber(n) {
  if (finished || selected === null || puzzle[selected] !== 0) return;
  state[selected] = n;

  if (n !== solution[selected]) {
    mistakes++;
    mistakesEl.textContent = `Errores: ${mistakes}`;
    try { tg?.HapticFeedback?.notificationOccurred("error"); } catch (_) {}
  } else {
    haptic();
  }

  message.textContent = "";
  render();
  detectCompletion();
}

function detectCompletion() {
  if (state.every((v, i) => v === solution[i])) {
    finished = true;
    message.textContent = `🎉 ¡Sudoku completado en ${formatTime(seconds)} con ${mistakes} error(es)!`;
    try { tg?.HapticFeedback?.notificationOccurred("success"); } catch (_) {}
  }
}

function formatTime(total) {
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

document.querySelectorAll("[data-num]").forEach(btn => {
  btn.addEventListener("click", () => setNumber(Number(btn.dataset.num)));
});

document.getElementById("erase").addEventListener("click", () => {
  if (finished || selected === null || puzzle[selected] !== 0) return;
  state[selected] = 0;
  message.textContent = "";
  render();
});

document.getElementById("check").addEventListener("click", () => {
  const wrong = state.some((v, i) => v !== 0 && v !== solution[i]);
  const empty = state.some(v => v === 0);

  if (wrong) message.textContent = "❌ Hay alguna casilla incorrecta.";
  else if (empty) message.textContent = "👍 De momento todo correcto. Aún faltan casillas.";
  else detectCompletion();
});

setInterval(() => {
  if (!finished) {
    seconds++;
    timer.textContent = formatTime(seconds);
  }
}, 1000);

render();
