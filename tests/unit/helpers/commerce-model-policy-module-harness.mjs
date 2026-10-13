import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const projectRequire = createRequire(new URL('../../../package.json', import.meta.url));

/** Execute the actual TS/TSX module with explicitly controlled framework adapters. */
export function loadPolicyModule(path, mocks, { FormData: FormDataImpl = FormData } = {}) {
  const ts = projectRequire('typescript');
  const source = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: path,
  });
  const moduleRecord = { exports: {} };
  const requireMock = (name) => {
    if (!Object.hasOwn(mocks, name)) throw Error(`Unexpected dependency in ${path}: ${name}`);
    return mocks[name];
  };
  new Function('require', 'module', 'exports', 'FormData', outputText)(
    requireMock, moduleRecord, moduleRecord.exports, FormDataImpl,
  );
  return moduleRecord.exports;
}

/** Minimal React hook/JSX renderer for exercising component state and event handlers. */
export function createComponentHarness() {
  const slots = [];
  let cursor = 0;
  const react = {
    useRef(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: value };
      return slots[index];
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => {
        slots[index] = typeof next === 'function' ? next(slots[index]) : next;
      }];
    },
  };
  const jsxRuntime = {
    jsx: (type, props, key) => ({ type, props: props ?? {}, key }),
    jsxs: (type, props, key) => ({ type, props: props ?? {}, key }),
  };
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object' || !('type' in node)) return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  }
  return {
    react, jsxRuntime,
    render(Component, props) { cursor = 0; return expand(Component(props)); },
  };
}

export function findElement(root, predicate) {
  if (Array.isArray(root)) return root.map(node => findElement(node, predicate)).find(Boolean);
  if (!root || typeof root !== 'object' || !('type' in root)) return undefined;
  if (predicate(root)) return root;
  return findElement(root.props.children, predicate);
}

export function elementText(root) {
  if (Array.isArray(root)) return root.map(elementText).join(' ');
  if (root === null || root === undefined || typeof root === 'boolean') return '';
  if (typeof root !== 'object' || !('type' in root)) return String(root);
  return elementText(root.props.children);
}
