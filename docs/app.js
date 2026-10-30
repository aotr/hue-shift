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

function render() {
  const grid = document.getElementById("grid");
  const cards = generate(PROJECTS.length);

  grid.innerHTML = cards
    .map(
      ({ name, hex, fg }, i) => {
        const command = `npx hue-shift-cli ${name} --color "${hex}"`;
        return `
      <div class="card" style="animation-delay:${i * 18}ms">
        <div class="bar" data-bg="${hex}" style="background:${hex};color:${fg}">
          ${name}
        </div>
        <div class="meta">
          <span class="hex">${hex}</span>
          <span class="ratio" title="Contrast ratio between this bar and its text">${contrast(hex, fg).toFixed(1)}:1</span>
          <button class="card-copy" data-copy="${command.replace(/"/g, "&quot;")}" aria-label="Copy command for ${name}">copy</button>
        </div>
      </div>`;
      },
    )
    .join("");
}

document.getElementById("shuffle").addEventListener("click", render);

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
