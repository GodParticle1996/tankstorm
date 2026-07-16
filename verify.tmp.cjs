// Verification (deleted after use): battle modes, themes, landslide animation.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const OUT = "/tmp/claude-1000/-home-vibekdutta-VixiApps/7caaf9ea-0355-4d57-bc72-f728df9225d3/scratchpad";
const DIST = "/home/vibekdutta/VixiApps/tankstorm/dist/index.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const consoleErrors = [];

function check(name, ok, extra = "") {
  if (!ok) failures++;
  console.log(`CHECK ${ok ? "PASS" : "FAIL"} :: ${name}${extra ? " :: " + extra : ""}`);
}

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name), img.toPNG());
  console.log("saved", name);
}

function key(win, type, keyCode) {
  win.webContents.sendInputEvent({ type, keyCode });
}

async function press(win, keyCode, holdMs) {
  key(win, "keyDown", keyCode);
  await sleep(holdMs);
  key(win, "keyUp", keyCode);
}

const js = (win, code) => win.webContents.executeJavaScript(code);

async function startMode(win, modeIndex) {
  await js(win, "location.hash = '#/'");
  await sleep(700);
  await js(win, "location.hash = '#/game'");
  await sleep(1100);
  await js(win, `document.querySelectorAll("[data-mode-card]")[${modeIndex}]?.click()`);
  await sleep(600);
  await js(win, `document.querySelector("[data-draft-skip]")?.click()`);
  await sleep(1000);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1287, height: 819, show: true,
    backgroundColor: "#0a0f1e", autoHideMenuBar: true,
    webPreferences: { backgroundThrottling: false },
  });
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 3) consoleErrors.push(message);
  });

  await win.loadFile(DIST);
  await js(win, "location.hash = '#/game'");
  await sleep(1500);

  // ─── 1. Mode select screen ───
  const modeCount = await js(win, `document.querySelectorAll("[data-mode-card]").length`);
  check("mode select shows 4 battle modes", modeCount === 4, `got ${modeCount}`);
  let text = await js(win, "document.body.innerText");
  check("mode select header", text.includes("CHOOSE YOUR BATTLE"));
  await shot(win, "m1-mode-select.png");

  // ─── 2. Classic: fire into a hill and film the landslide ───
  await js(win, `document.querySelectorAll("[data-mode-card]")[0]?.click()`);
  await sleep(500);
  await js(win, `document.querySelector("[data-draft-skip]")?.click()`);
  await sleep(1000);
  text = await js(win, "document.body.innerText");
  check("classic match starts", text.includes("AIM & FIRE"));
  check("classic HUD shows mode + 4 moves", text.includes("CLASSIC BATTLE") && text.includes("4 moves left"));

  // Big-ish shot into the middle of the map
  await press(win, "Space", 420);
  await sleep(1300);
  await shot(win, "m2-impact.png");
  await sleep(500);
  await shot(win, "m3-landslide-a.png");
  await sleep(700);
  await shot(win, "m4-landslide-b.png");
  await sleep(2600);
  await shot(win, "m5-settled.png");

  // ─── 3. Storm Blitz ───
  await startMode(win, 1);
  text = await js(win, "document.body.innerText");
  check("blitz HUD: mode name, /5 volleys, 2 moves",
    text.includes("STORM BLITZ") && text.includes("/5") && text.includes("2 moves left"));
  await shot(win, "m6-blitz.png");

  // ─── 4. Lunar War ───
  await startMode(win, 2);
  text = await js(win, "document.body.innerText");
  check("lunar HUD: mode name + calm wind", text.includes("LUNAR WAR") && text.includes("CALM"));
  await shot(win, "m7-lunar.png");
  // A lunar lob to see the flat low-gravity arc
  await press(win, "Space", 300);
  await sleep(1600);
  await shot(win, "m8-lunar-flight.png");

  // ─── 5. Heavy Metal ───
  await startMode(win, 3);
  text = await js(win, "document.body.innerText");
  check("heavy HUD: mode name + /8 volleys", text.includes("HEAVY METAL") && text.includes("/8"));
  await shot(win, "m9-heavy.png");

  const realErrors = consoleErrors.filter((m) => !m.includes("Electron Security Warning") && !m.includes("Autofill"));
  check("no renderer console errors", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

  console.log(`VERIFY DONE :: failures=${failures}`);
  app.exit(failures > 0 ? 1 : 0);
});
