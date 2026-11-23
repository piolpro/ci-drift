import { LineCounter, parseDocument } from 'yaml';

export function parseWorkflow(source, file) {
  const lines = new LineCounter();
  const doc = parseDocument(source, { lineCounter: lines });
  if (doc.errors.length) {
    const { line } = lines.linePos(doc.errors[0].pos[0]);
    throw new Error(`${file}:${line}: invalid workflow YAML (${doc.errors[0].code})`);
  }
  return {
    data: doc.toJS({ maxAliasCount: 50 }),
    position(path) {
      const node = doc.getIn(path, true);
      return {
        line: node?.range ? lines.linePos(node.range[0]).line : 1,
        endLine: node?.range ? lines.linePos(node.range[1]).line : 1,
        folded: node?.type === 'BLOCK_FOLDED',
        block: node?.type === 'BLOCK_LITERAL' || node?.type === 'BLOCK_FOLDED',
      };
    },
  };
}

export function variants(matrix) {
  if (!matrix || typeof matrix !== 'object') return [{}];
  const { include, exclude, ...axes } = matrix;
  const entries = Object.entries(axes);
  if (entries.some(([, values]) => !Array.isArray(values))) return [{}];
  const size = entries.reduce((total, [, values]) => total * values.length, 1);
  if (size > 256) return [{}];
  const matches = (value, pattern) => Object.entries(pattern).every(([key, part]) =>
    part && typeof part === 'object' && !Array.isArray(part)
      ? value[key] && typeof value[key] === 'object' && matches(value[key], part)
      : Object.is(value[key], part));
  const original = entries.reduce(
    (rows, [key, values]) => rows.flatMap((row) => values.map((value) => ({ ...row, [key]: value }))),
    [{}],
  ).filter((row) => !Array.isArray(exclude) || !exclude.some((item) => item && matches(row, item)));
  const rows = original.map((row) => ({ ...row }));
  const extra = [];
  for (const item of Array.isArray(include) ? include : []) {
    if (!item || typeof item !== 'object') continue;
    let applied = false;
    for (const [index, row] of original.entries()) {
      const relevant = Object.fromEntries(Object.entries(item).filter(([key]) => Object.hasOwn(row, key)));
      if (!entries.length || !matches(row, relevant)) continue;
      Object.assign(rows[index], item);
      applied = true;
    }
    if (!applied) extra.push(item);
  }
  return entries.length || !extra.length ? [...rows, ...extra] : extra;
}

export function resolveStatic(value, matrix, env, depth = 0) {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string' || depth > 8) return undefined;
  const result = value.replace(/\$\{\{\s*(matrix|env)((?:\.[\w-]+)+)\s*\}\}/g, (expression, context, path) => {
    const raw = path.slice(1).split('.').reduce((object, key) => Object.hasOwn(object ?? {}, key) ? object[key] : undefined,
      context === 'matrix' ? matrix : env);
    return resolveStatic(raw, matrix, env, depth + 1) ?? expression;
  });
  return result.includes('${{') ? undefined : result;
}
