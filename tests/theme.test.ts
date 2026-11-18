import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_INIT_SCRIPT, THEME_KEY, isTheme, loadTheme, resolveTheme, saveTheme } from "@/lib/theme";

afterEach(() => vi.unstubAllGlobals());
const stub = (storage: Partial<Storage>) => vi.stubGlobal("window", { localStorage: storage as Storage });

describe("theme preference", () => {
  it("accepts only the three known values", () => {
    for (const v of ["light", "dark", "system"]) expect(isTheme(v)).toBe(true);
    for (const v of ["", "Dark", "auto", null, undefined, 1, {}]) expect(isTheme(v)).toBe(false);
  });

  it("system follows the operating system; explicit choices win", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("loads a saved value, and falls back to system for corrupted or missing data", () => {
    stub({ getItem: () => "dark" });
    expect(loadTheme()).toBe("dark");
    stub({ getItem: () => "<script>alert(1)</script>" });
    expect(loadTheme()).toBe("system");
    stub({ getItem: () => null });
    expect(loadTheme()).toBe("system");
  });

  it("does not throw when storage is blocked", () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    stub({ getItem: blocked, setItem: blocked });
    expect(loadTheme()).toBe("system");
    expect(() => saveTheme("dark")).not.toThrow();
  });
});

describe("pre-paint theme script", () => {
  function run(stored: string | null, prefersDark: boolean, storageThrows = false) {
    const added: string[] = [];
    const localStorage = {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("blocked");
        expect(key).toBe(THEME_KEY);
        return stored;
      },
    };
    const window = { matchMedia: () => ({ matches: prefersDark }) };
    const document = { documentElement: { classList: { add: (c: string) => added.push(c) } } };
    new Function("localStorage", "window", "document", THEME_INIT_SCRIPT)(localStorage, window, document);
    return added;
  }

  it("applies dark for a saved dark choice and for system + dark OS", () => {
    expect(run("dark", false)).toEqual(["dark"]);
    expect(run("system", true)).toEqual(["dark"]);
    expect(run(null, true)).toEqual(["dark"]);
  });
  it("stays light for a saved light choice, even on a dark OS", () => {
    expect(run("light", true)).toEqual([]);
    expect(run("system", false)).toEqual([]);
  });
  it("never throws if storage is blocked", () => {
    expect(() => run(null, true, true)).not.toThrow();
  });
});
