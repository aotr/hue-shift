// Docs page behaviour: a live preview of what hue-shift generates.
// Mirrors the colour maths in src/colors.js so the demo never drifts from the CLI.

const PROJECTS = [
  "checkout-api", "billing-web", "design-system", "auth-service",
  "docs-site", "admin-console", "mobile-app", "search-index",
  "notifications", "analytics-etl", "infra-terraform", "storefront",
  "payments-api", "support-desk", "email-worker", "data-pipeline",
  "gateway-proxy", "reporting-ui",
];

const MIN_HUE_GAP = 22;
const SAT = [55, 78];
const LIGHT = [25, 38];

const hslToHex = (h, s, l) => {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
};

const parseHex = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const luminance = (hex) => {
  const { r, g, b } = parseHex(hex);
  const ch = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Same rule the CLI uses: pick whichever of white or black reads better.
const readable = (bg) => (contrast(bg, "#000000") > contrast(bg, "#ffffff") ? "#000000" : "#ffffff");

const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const between = ([lo, hi]) => lo + Math.random() * (hi - lo);

function generate(count) {
  const used = [];
  const out = [];

  for (let i = 0; i < count; i++) {
    let hue = null;
    for (let attempt = 0; attempt < 400; attempt++) {
      const candidate = Math.random() * 360;
      const gap = used.length ? Math.min(...used.map((u) => hueGap(u, candidate))) : 360;
      if (gap >= MIN_HUE_GAP) {
        hue = candidate;
        break;
      }
    }
    if (hue === null) hue = (i * 137.508) % 360; // crowded wheel fallback
    used.push(hue);

    const hex = hslToHex(hue, between(SAT), between(LIGHT));
    out.push({ name: PROJECTS[i % PROJECTS.length], hex, fg: readable(hex) });
  }
  return out;
}

const previewEl = document.getElementById("preview");
const previewFigure = document.getElementById("preview-figure");
const previewHex = document.getElementById("preview-hex");
const grid = document.getElementById("grid");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let cards = [];
let cursor = 0;
let cycle = null;

// A miniature VS Code window, tinted from one colour. Every surface the CLI
// can paint (title bar, activity bar, status bar) is visible here.
function windowMarkup({ name, hex, fg }) {
  return `
    <div class="win-title" style="background:${hex};color:${fg}">
      <span class="dots"><i></i><i></i><i></i></span>
      <span class="win-name">${name} — Visual Studio Code</span>
    </div>
    <div class="win-tabs">
      <span class="on">${name}.js</span>
      <span>index.html</span>
      <span>README.md</span>
    </div>
    <div class="win-main">
      <div class="win-activity"><i class="on"></i><i></i><i></i><i></i></div>
      <div class="win-side">
        <span>src</span>
        <span class="indent on">${name}.js</span>
        <span class="indent">colors.js</span>
        <span class="indent">config.json</span>
        <span>README.md</span>
      </div>
      <div class="win-editor">
        <span class="line tint w40"></span>
        <span class="line w72"></span>
        <span class="line w52 indent"></span>
        <span class="line tint w64"></span>
        <span class="line w80"></span>
        <span class="line w30 indent"></span>
        <span class="line w40"></span>
      </div>
    </div>
    <div class="win-status" style="background:${hex};color:${fg}">
      <span>main*</span>
      <span>UTF-8 · LF · JavaScript</span>
    </div>`;
}

function showPreview(index) {
  if (!cards.length) return;
  cursor = (index + cards.length) % cards.length;
  const card = cards[cursor];
  previewFigure.style.setProperty("--c", card.hex);
  previewFigure.style.setProperty("--fg", card.fg);
  previewEl.innerHTML = windowMarkup(card);
  previewHex.textContent = card.hex;
}

function render() {
  cards = generate(PROJECTS.length);

  grid.innerHTML = cards
    .map(
      ({ name, hex, fg }, i) => {
        const command = `npx hue-shift-cli ${name} --color "${hex}"`;
        const attr = command.replace(/"/g, "&quot;");
        return `
      <div class="card" style="animation-delay:${i * 18}ms">
        <button class="bar" data-view="${i}" style="background:${hex};color:${fg}" aria-label="Preview ${name}">
          ${name}
        </button>
        <div class="meta">
          <span class="hex">${hex}</span>
          <span class="ratio" title="Contrast ratio between this bar and its text">${contrast(hex, fg).toFixed(1)}:1</span>
          <button class="card-copy" data-copy="${attr}" aria-label="Copy command for ${name}" title="Copy: ${attr}">copy</button>
        </div>
      </div>`;
      },
    )
    .join("");

  showPreview(0);
}

function startCycle() {
  if (reduceMotion || cycle) return;
  cycle = setInterval(() => showPreview(cursor + 1), 3200);
}

function stopCycle() {
  clearInterval(cycle);
  cycle = null;
}

document.getElementById("shuffle").addEventListener("click", () => {
  stopCycle();
  render();
  startCycle();
});

// Pick a project from the wall below and load it into the hero preview.
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-view]");
  if (!target) return;
  stopCycle();
  showPreview(Number(target.dataset.view));
});

// Delegated so the buttons inside each freshly rendered card work too.
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;

  const text = button.dataset.copy;
  const label = button.dataset.label || "copy";
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "copied";
    button.classList.add("done");
    setTimeout(() => {
      button.textContent = label;
      button.classList.remove("done");
    }, 1400);
  } catch {
    button.textContent = "select it";
  }
});

render();
startCycle();
