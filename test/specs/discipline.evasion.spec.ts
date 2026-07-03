import { expect, test } from "bun:test";

import { checkCodeDiscipline, fixCodeDiscipline } from "../../src/index.js";
import { tempProject, writeFile } from "./helpers.js";

test("reports packed one-line functions even when max function lines passes", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/checkout.ts", [
    "export function checkout(cart: any) { const total = cart.items.reduce((sum: number, item: any) => sum + item.price, 0); if (!cart.user) throw new Error(\"login\"); const tax = total * 0.2; const discount = cart.coupon ? total * 0.1 : 0; return total + tax - discount; }",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    evasionGuards: true,
    rules: {
      maxFunctionLines: {
        max: 1,
      },
    },
  });

  expect(result.violations.some((violation) => violation.rule === "max-function-lines")).toBe(false);
  expect(result.violations).toEqual(expect.arrayContaining([
    expect.objectContaining({
      rule: "evasion-guards",
      filePath: "src/checkout.ts",
      details: expect.objectContaining({
        kind: "packed-function",
        functionName: "checkout",
      }),
    }),
  ]));
});

test("reports files collapsed into a few packed lines", async () => {
  const projectRoot = tempProject();
  const packedExports = Array.from({ length: 34 }, (_, index) => {
    return `export function service${index}(input: number) { const doubled = input * 2; const tagged = doubled + ${index}; return tagged > 10 ? tagged : 10; }`;
  }).join(" ");

  writeFile(projectRoot, "src/service.ts", `${packedExports}\n`);

  const result = await checkCodeDiscipline({
    projectRoot,
    evasionGuards: true,
  });

  expect(result.violations).toEqual(expect.arrayContaining([
    expect.objectContaining({
      rule: "evasion-guards",
      filePath: "src/service.ts",
      details: expect.objectContaining({
        kind: "packed-file",
      }),
    }),
  ]));
});

test("does not report long literals as packed code", async () => {
  const projectRoot = tempProject();
  const longUrl = `https://example.com/${"path/".repeat(30)}?token=${"a".repeat(180)}`;
  const longPattern = "a".repeat(160);

  writeFile(projectRoot, "src/literals.ts", [
    `export const url = "${longUrl}";`,
    `export const regex = /${longPattern}/;`,
    "export const value = 1;",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    evasionGuards: true,
  });

  expect(result.ok).toBe(true);
  expect(result.violations).toEqual([]);
});

test("reports runtime code hiding patterns", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/runtime.ts", [
    "export const patch = new Function(\"db\", \"db.users.deleteMany({ role: 'test' })\");",
    "setTimeout(\"sendAnalytics(localStorage.token)\", 1000);",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    evasionGuards: true,
  });

  expect(result.violations).toEqual(expect.arrayContaining([
    expect.objectContaining({
      rule: "evasion-guards",
      details: expect.objectContaining({
        kind: "runtime-code-hiding",
        pattern: "new Function",
      }),
    }),
    expect.objectContaining({
      rule: "evasion-guards",
      details: expect.objectContaining({
        kind: "runtime-code-hiding",
        pattern: "setTimeout",
      }),
    }),
  ]));
});

test("does not run evasion guards unless enabled", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/packed.ts", "export function packed() { const a = 1; const b = 2; const c = 3; const d = 4; return a + b + c + d; }\n");

  const omitted = await checkCodeDiscipline({
    projectRoot,
  });
  const disabled = await checkCodeDiscipline({
    projectRoot,
    evasionGuards: false,
  });

  expect(omitted.ok).toBe(true);
  expect(disabled.ok).toBe(true);
});

test("supports evasion guard selectors only when configured", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    evasionGuards: true,
    onlyRules: ["evasion-guards"],
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(result.ok).toBe(true);
  expect(result.violations).toEqual([]);

  await expect(checkCodeDiscipline({
    projectRoot,
    onlyRules: ["evasion-guards"],
  })).rejects.toThrow("Selected rule is not configured: evasion-guards");
});

test("rejects evasion guards as a fix selector", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(fixCodeDiscipline({
    projectRoot,
    evasionGuards: true,
    // @ts-expect-error evasion guards are check-only
    onlyRules: ["evasion-guards"],
  })).rejects.toThrow("Selected rule is not fixable: evasion-guards");
});
