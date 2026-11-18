import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Structural guards. These read the source so that a later edit cannot quietly open a path
// around the safety gate, expose a secret to the browser, or add a content-logging line.

const root = path.resolve(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel.replaceAll("\\", "/")] : [];
  });
}
const files = ["app", "lib", "components"].flatMap(sourceFiles);
/** Source with comments removed, so that a comment mentioning something is not mistaken for using it. */
const read = (file: string) =>
  fs
    .readFileSync(path.join(root, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("safety gate structure", () => {
  it("only the chat route calls the coaching model", () => {
    const users = files.filter((f) => f !== "lib/ai.ts" && /generateCoaching\s*\(/.test(read(f)));
    expect(users).toEqual(["app/api/chat/route.ts"]);
  });

  it("the route locks, screens, and only then coaches, in that order", () => {
    const route = read("app/api/chat/route.ts");
    const lock = route.indexOf("findLock(");
    const screen = route.indexOf("screenMessages(");
    const coach = route.indexOf("generateCoaching(");
    expect(lock).toBeGreaterThan(-1);
    expect(screen).toBeGreaterThan(lock);
    expect(coach).toBeGreaterThan(screen);
  });

  it("coaching is only reachable after an explicit 'safe' check that fails closed", () => {
    const route = read("app/api/chat/route.ts");
    const guard = route.indexOf('screening.outcome !== "safe"');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(route.indexOf("generateCoaching("));
  });

  it("the browser code never imports the model client or the server safety modules", () => {
    for (const file of files.filter((f) => f.startsWith("components/"))) {
      expect(read(file), file).not.toMatch(/from ["']@\/lib\/(ai|safety)["']|@anthropic-ai/);
    }
  });
});

describe("secrets and privacy", () => {
  it("the API key is only read in lib/ai.ts and nothing is exposed with NEXT_PUBLIC_", () => {
    expect(files.filter((f) => /ANTHROPIC_API_KEY/.test(read(f)))).toEqual(["lib/ai.ts"]);
    for (const file of files) expect(read(file), file).not.toMatch(/NEXT_PUBLIC_/);
  });

  it("no console.log/info/debug/warn anywhere, and server error logs never include message content", () => {
    for (const file of files) expect(read(file), file).not.toMatch(/console\.(log|info|debug|warn)\(/);
    const route = read("app/api/chat/route.ts");
    const errorLogs = route.match(/console\.error\([^;]*\);/g) ?? [];
    expect(errorLogs.length).toBeGreaterThan(0);
    for (const line of errorLogs) {
      expect(line).not.toMatch(/\b(messages|latest|content|body|raw|json|text)\b/);
    }
  });

  it("raw HTML is never injected except the constant theme script in the layout", () => {
    const sinks = files.filter((f) => /dangerouslySetInnerHTML|\.innerHTML|insertAdjacentHTML|document\.write/.test(read(f)));
    expect(sinks).toEqual(["app/layout.tsx"]);
    expect(read("app/layout.tsx")).toContain("THEME_INIT_SCRIPT");
  });

  it("localStorage is only touched by the storage and theme modules", () => {
    const users = files.filter((f) => /localStorage/.test(read(f))).sort();
    expect(users).toEqual(["lib/storage.ts", "lib/theme.ts"]);
  });
});
