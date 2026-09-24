import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const violations = [];
const networkModules = new Set([
  "analytics/analytics.ts",
  "config/fetch-config.ts",
  "orders/submit-order.ts",
  "history/current/api.ts",
  "history/legacy/api.ts",
]);
for (const pkg of ["spot-ui", "spot-react"]) {
  const sourceRoot = path.join(root, "packages", pkg, "src");
  for (const relative of fs.readdirSync(sourceRoot, { recursive: true })) {
    if (!/\.tsx?$/.test(relative) || /\.test\.tsx?$/.test(relative)) continue;
    const file = path.join(sourceRoot, relative);
    const ast = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const fail = (node, reason) => {
      const line =
        ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      violations.push(`packages/${pkg}/src/${relative}:${line}: ${reason}`);
    };
    const checkImport = (node, specifier) => {
      if (specifier.startsWith(".")) {
        const target = path.resolve(path.dirname(file), specifier);
        if (
          !target.startsWith(sourceRoot + path.sep) &&
          target !== path.join(sourceRoot, "../package.json")
        ) {
          fail(
            node,
            "Cross-package imports must use a public package entry point.",
          );
        }
        if (target === path.join(sourceRoot, "index"))
          fail(node, "Internal modules must not import their own root barrel.");
        if (/\.test(?:\.|$)|\/tests\//.test(target))
          fail(node, "Production modules must not import tests.");
      }
      if (
        pkg === "spot-ui" &&
        /^(react(?:\/|$)|zustand(?:\/|$)|@orbs-network\/spot-(?:react|ui)(?:\/|$))/.test(
          specifier,
        )
      ) {
        fail(
          node,
          "The SDK must remain independent of React, Zustand, and package barrels.",
        );
      }
      if (/^@orbs-network\/spot-(?:ui|react)\//.test(specifier))
        fail(node, "Use the public package root, not a deep import.");
    };
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        checkImport(node, node.moduleSpecifier.text);
        if (ts.isExportDeclaration(node) && !node.exportClause)
          fail(node, "Public and feature exports must be explicit.");
      }
      if (ts.isCallExpression(node)) {
        if (
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            node.expression.getText(ast) === "require") &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          checkImport(node, node.arguments[0].text);
        }
        if (
          /^(?:globalThis\.|window\.)?fetch$/.test(
            node.expression.getText(ast),
          ) &&
          (pkg !== "spot-ui" || !networkModules.has(relative))
        ) {
          fail(
            node,
            "Network access belongs in SDK transport or analytics modules.",
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Spot architecture boundaries passed.");
}
