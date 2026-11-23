import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasLocalBinary, repository } from './repository.js';
import { executable, npxPackages, shellCommands, upgradesNpm } from './shell.js';
import { canResolveCompatibleNpm, eolMajor, incompatible, nodeSelector, npmLatest } from './versions.js';
import { parseWorkflow, resolveStatic, variants } from './workflow.js';

const nodeCommands = new Set(['node', 'npm', 'npx', 'yarn', 'pnpm', 'corepack', 'bun']);
const implicitPackage = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@latest)?$/i;
const never = (step) => step.if === false || /^\s*(?:false|\$\{\{\s*false\s*\}\})\s*$/.test(step.if);

export function lint(path, { eol = false, date = new Date().toISOString().slice(0, 10) } = {}) {
  const repo = repository(path);
  const directory = resolve(repo.root, '.github/workflows');
  let files;
  try {
    files = readdirSync(directory).filter((name) => /\.ya?ml$/.test(name)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const results = new Map();
  for (const name of files) {
    const path = resolve(directory, name);
    const source = repo.read(path);
    if (source === undefined) continue;
    const file = repo.label(path);
    const report = (id, severity, line, message, hint) => {
      results.set(JSON.stringify([file, line, id, message]), { id, severity, file, line, message, hint });
    };
    const { data: workflow, position } = parseWorkflow(source, file);
    const sourceLines = source.split(/\r?\n/);
    for (const [jobId, job] of Object.entries(workflow?.jobs ?? {})) {
      if (!job || never(job) || !Array.isArray(job.steps)) continue;
      for (const matrix of variants(job.strategy?.matrix)) {
        const env = { ...workflow.env, ...job.env };
        const defaults = job.defaults?.run ?? {};
        const defaultPath = defaults['working-directory'] ?? workflow.defaults?.run?.['working-directory'] ?? '.';
        const workdir = (input, env, base) => repo.workingDirectory(resolveStatic(
          typeof input === 'string' ? input.replace(/^\$\{\{\s*github\.workspace\s*\}\}/, '$GITHUB_WORKSPACE') : input,
          matrix, env,
        ), base);
        let active;
        const checkEngines = (packages) => {
          const pkg = packages[0];
          if (!active?.selection || !pkg || !incompatible(active.selection, pkg.data?.engines?.node)) return;
          report('engines-mismatch', 'error', active.line,
            'Node ' + active.selection.version + ' cannot satisfy ' + pkg.file + ' engines.node (' + pkg.data.engines.node + ').',
            'Use a compatible setup-node version or update the package engine if it is incorrect.');
        };
        const checkUnusedSetup = () => {
          if (active && !active.hasNodeCommand) checkEngines(repo.packageChain(workdir(defaultPath, env)));
        };
        for (const [index, step] of job.steps.entries()) {
          if (!step || never(step)) continue;
          const stepEnv = { ...env, ...step.env };
          const locate = (...keys) => position(['jobs', jobId, 'steps', index, ...keys]);
          if (typeof step.uses === 'string' && /^actions\/setup-node@/i.test(step.uses)) {
            checkUnusedSetup();
            const options = step.with ?? {};
            const field = options['node-version'] ? 'node-version' : 'node-version-file';
            const line = locate('with', field).line;
            const input = resolveStatic(options[field], matrix, stepEnv);
            const selected = field === 'node-version' ? input : readNodeVersion(repo, input);
            active = { selection: nodeSelector(selected), line, conditional: Boolean(step.if) && step.if !== true };
            if (active.selection && eol) {
              const major = eolMajor(active.selection, date);
              if (major !== undefined) report('eol-node', 'warning', line, 'Node ' + major + ' is end of life.',
                'Upgrade this setup-node input to a supported Node LTS release.');
            }
            continue;
          }
          if (typeof step.run !== 'string') continue;
          const shell = step.shell ?? defaults.shell ?? workflow.defaults?.run?.shell;
          if (shell && !/^(?:bash|sh)(?:\s|$)/.test(shell)) continue;
          const location = locate('run');
          const script = location.block
            ? sourceLines.slice(location.line, location.endLine).join('\n')
            : step.run;
          if (location.block) location.line++;
          let cwd = workdir(step['working-directory'] ?? defaultPath, stepEnv);
          for (const { words, separator } of shellCommands(script, location)) {
            const [binary, ...tokens] = executable(words);
            if (!binary) continue;
            const args = tokens.map(({ text }) => text);
            if (binary.text === 'cd') {
              if (['&&', ';', '\n'].includes(separator)) cwd = args.length === 1 && cwd ? workdir(args[0], stepEnv, cwd) : undefined;
              continue;
            }
            if (!nodeCommands.has(binary.text)) continue;
            const packages = repo.packageChain(cwd);
            if (active) active.hasNodeCommand = true;
            checkEngines(packages);
            const upgrade = binary.text === 'npm' && upgradesNpm(args);
            if (upgrade && active?.selection && !active.conditional
              && incompatible(active.selection, npmLatest.engines)) {
              const fallback = upgrade === 'bare' && canResolveCompatibleNpm(active.selection);
              report('npm-latest-on-old-node', fallback ? 'warning' : 'error', binary.line,
                'Node ' + active.selection.version + ' cannot run npm@latest (' + npmLatest.version
                  + '; requires Node ' + npmLatest.engines + ').'
                  + (fallback ? ' A newer npm installer may choose an older compatible npm instead.' : ''),
                'Upgrade Node or pin an npm version that supports this Node version.');
            }
            if (binary.text === 'npx' && cwd) {
              for (const target of npxPackages(args)) {
                if (!implicitPackage.test(target ?? '')) continue;
                const packageName = target.replace(/@latest$/, '');
                if (target === packageName
                  && (hasLocalBinary(packages, packageName) || repo.hasHoistedBinary(packageName))) continue;
                report('unpinned-npx', 'error', binary.line,
                  'npx can fetch an unpinned version of ' + packageName + '.',
                  'Add the tool as a locked local devDependency or invoke npx with an exact version.');
              }
            }
          }
        }
        checkUnusedSetup();
      }
    }
  }
  return [...results.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.id.localeCompare(b.id));
}

function readNodeVersion(repo, input) {
  if (input === undefined || input === '') return undefined;
  const file = repo.workingDirectory(input);
  if (!file) return undefined;
  const data = repo.read(file)?.trim();
  if (data === undefined || !file.endsWith('/package.json')) return data;
  try {
    const manifest = JSON.parse(data);
    return manifest.volta?.node ?? manifest.engines?.node;
  } catch {
    return undefined;
  }
}
