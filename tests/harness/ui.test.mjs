import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const themePath = resolve(root, "harness/themes/dr-doom.json");
const launcherPath = resolve(root, "pi-harness.sh");
const requiredRoles = [
  "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text", "thinkingText", "selectedBg", "userMessageBg", "userMessageText", "customMessageBg", "customMessageText", "customMessageLabel", "toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput", "mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet", "toolDiffAdded", "toolDiffRemoved", "toolDiffContext", "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation", "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh", "bashMode",
];

const theme = JSON.parse(await readFile(themePath, "utf8"));
assert.equal(theme.name, "dr-doom");
assert.equal(theme.appearance, "dark");
for (const role of requiredRoles) assert.ok(theme.colors[role], `theme role ${role}`);
assert.equal(theme.colors.error, "errorRed", "errors retain semantic red");
assert.equal(theme.colors.warning, "warningAmber", "warnings retain semantic amber");
assert.equal(theme.colors.accent, "doomGreen", "the primary accent is dark green");
assert.equal(theme.colors.text, "metalText", "body text remains metallic and readable");

const uiSource = await readFile(resolve(root, "harness/ui.js"), "utf8");
assert.match(uiSource, /import \{ truncateToWidth \} from "@earendil-works\/pi-tui"/);
const testUiSource = uiSource.replace(
  'import { truncateToWidth } from "@earendil-works/pi-tui";',
  "const truncateToWidth = (text, width) => Array.from(text).slice(0, width).join('');",
);
const { createDoomUi } = await import(`data:text/javascript;base64,${Buffer.from(testUiSource).toString("base64")}`);
let sessionStart;
let headerSet = 0;
const extension = createDoomUi();
extension({ on(event, handler) { assert.equal(event, "session_start"); sessionStart = handler; } });
assert.ok(sessionStart, "registers a session_start handler");
for (const mode of ["rpc", "print", "json"]) {
  await sessionStart({}, { mode, ui: { setHeader() { headerSet++; } } });
}
assert.equal(headerSet, 0, "noninteractive sessions receive no visual header");
let factory;
await sessionStart({}, { mode: "tui", ui: { setHeader(value) { headerSet++; factory = value; } } });
assert.equal(headerSet, 1, "TUI sessions receive the header");
const colors = { fg: (role, text) => `<${role}>${text}</${role}>` };
const header = factory({}, colors);
const wide = header.render(80).join("\n");
assert.match(wide, /DR\. DOOM/);
assert.match(wide, /Controlled local harness/);
assert.match(wide, /<accent>/, "header uses the active runtime theme");
const narrow = header.render(12);
assert.ok(narrow.every((line) => line.replace(/<[^>]+>/g, "").length <= 12), "narrow header lines are display-width truncated");
assert.equal(typeof header.invalidate, "function");

const launcher = await readFile(launcherPath, "utf8");
for (const expected of [
  '--theme "$root/harness/themes/dr-doom.json"',
  "--use-theme dr-doom",
  '--extension "$root/harness/ui.js"',
  "--no-extensions --extension \"$root/harness/extension.js\"",
  "--no-mcp --no-skills --skill \"$root/harness/skills/scoped-redteam\"",
  "--tools read,grep,find,ls,bash,lab_exec --thinking off \"$@\"",
]) assert.ok(launcher.includes(expected), `launcher preserves ${expected}`);

console.log("ok - Dr. Doom visual resources are TUI-only and preserve harness routing");
