import { readFile } from "node:fs/promises";
import ts from "typescript";

// Pure runtime modules only; execute the actual implementation, not a copied model.
export async function loadTypescript(path) {
  const compiled = new Map();
  async function compile(url, parents = new Set()) {
    if (parents.has(url.href)) throw new Error("Circular runtime test-module import");
    if (compiled.has(url.href)) return compiled.get(url.href);
    const source = await readFile(url, "utf8");
    let { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    });
    const ancestry = new Set([...parents, url.href]);
    const imports = [...outputText.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)].reverse();
    for (const match of imports) {
      const dependency = new URL(/\.tsx?$/.test(match[1]) ? match[1] : match[1] + ".ts", url);
      const target = await compile(dependency, ancestry);
      const start = match.index + match[0].indexOf(match[1]);
      outputText = outputText.slice(0, start) + target + outputText.slice(start + match[1].length);
    }
    const result = "data:text/javascript;base64," + Buffer.from(outputText).toString("base64");
    compiled.set(url.href, result);
    return result;
  }
  return import(await compile(new URL(path, import.meta.url)));
}
