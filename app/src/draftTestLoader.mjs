import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const nativeRequire = createRequire(import.meta.url);
export function loadDraftModule(file, overrides = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  cache.set(file, module.exports);
  const localRequire = specifier => {
    if (specifier in overrides) return overrides[specifier];
    if (specifier.startsWith('./')) return loadDraftModule(specifier + '.ts', overrides, cache);
    return nativeRequire(specifier);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}
