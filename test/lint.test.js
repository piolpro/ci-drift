import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lint } from '../src/lint.js';

const fixture = (name) => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const workflow = '.github/workflows/ci.yml';

function repo(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'ci-drift-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

const lines = (results) => results.map(({ id, line }) => [id, line]);

test('Alby #603: detects the Node engine and TypeDoc drift before the fix, not after', (t) => {
  const before = fixture('alby.yml');
  const after = before.replace('node-version: 20', 'node-version: 22').replace('npx typedoc', 'npx typedoc@0.28.17');
  const manifest = { engines: { node: '>=22' } };
  assert.deepEqual(lines(lint(repo(t, { [workflow]: before, 'package.json': manifest }))), [
    ['engines-mismatch', 6], ['unpinned-npx', 9],
  ]);
  assert.deepEqual(lint(repo(t, { [workflow]: after, 'package.json': manifest })), []);
});

test('Neynar #404: catches npm@latest on Node 20 and accepts Node 24 with npm@11', (t) => {
  const before = fixture('neynar.yml');
  const after = before.replace('"20"', '"24"').replace('npm@latest', 'npm@11');
  assert.deepEqual(lines(lint(repo(t, { [workflow]: before }))), [['npm-latest-on-old-node', 10]]);
  assert.deepEqual(lint(repo(t, { [workflow]: after })), []);
});

test('Alto #837 and Airnode #2060: ignores unrelated npm/jq workflow and Dockerfile changes', (t) => {
  const before = fixture('alto.yml');
  const docker = fixture('airnode.Dockerfile');
  for (const [prune, dockerfile] of [
    [before, docker],
    [before.replace('to_entries |', '(if type == "array" then .[] else . end) | to_entries |'),
      docker.replace('add npm', 'add npm@11.21.3')],
  ]) {
    assert.deepEqual(lint(repo(t, { [workflow]: prune, 'docker/Dockerfile': dockerfile })), []);
  }
});

test('resolves include-only matrices, skips excluded rows, and deduplicates other matrix axes', (t) => {
  const root = repo(t, {
    'package.json': { engines: { node: '^22.0.0' } },
    [workflow]: [
      'jobs:',
      '  standard:',
      '    strategy:',
      '      matrix:',
      '        node: [16, 18, 22]',
      '        os: [ubuntu-latest, macos-latest]',
      '        exclude: [{node: 16}]',
      '    steps:',
      '      - uses: actions/setup-node@v4',
      '        with: {node-version: "${{ matrix.node }}"}',
      '  include:',
      '    strategy:',
      '      matrix:',
      '        include: [{node: {version: 20}}, {node: {version: 22}}]',
      '    steps:',
      '      - uses: actions/setup-node@v4',
      '        with: {node-version: "${{ matrix.node.version }}"}',
    ].join('\n'),
  });
  const findings = lint(root);
  assert.deepEqual(lines(findings), [['engines-mismatch', 10], ['engines-mismatch', 17]]);
  assert.match(findings[0].message, /Node 18 /);
  assert.match(findings[1].message, /Node 20 /);
});

test('uses version files, input precedence, and the package in the run working directory', (t) => {
  const root = repo(t, {
    'package.json': { engines: { node: '>=18' } },
    'apps/api/package.json': { engines: { node: '^22.18.0' } },
    '.nvmrc': 'v20.17.0\n',
    '.node-version': '22.18.0\n',
    [workflow]: [
      'env: {VERSION_FILE: .nvmrc}',
      'jobs:',
      '  release:',
      '    defaults: {run: {working-directory: apps/api}}',
      '    steps:',
      '      - uses: actions/setup-node@v4',
      '        with: {node-version-file: "${{ env.VERSION_FILE }}"}',
      '      - run: npm ci',
      '      - uses: actions/setup-node@v4',
      '        with: {node-version-file: .node-version}',
      '      - run: npm ci',
      '      - uses: actions/setup-node@v4',
      '        with: {node-version: 22, node-version-file: .nvmrc}',
      '      - run: npm test',
    ].join('\n'),
  });
  const findings = lint(root);
  assert.deepEqual(lines(findings), [['engines-mismatch', 7]]);
  assert.match(findings[0].message, /apps\/api\/package\.json/);
});

test('tracks setup-node in step order, including bare npm with legacy and modern installers', (t) => {
  const root = repo(t, { [workflow]: [
    'jobs:',
    '  publish:',
    '    steps:',
    '      - run: npm i -g npm@latest',
    '      - uses: actions/setup-node@v4',
    '        with: {node-version: 16}',
    '      - run: npm i -g npm',
    '      - uses: actions/setup-node@v4',
    '        with: {node-version: 20}',
    '      - run: npm i --global npm',
    '      - uses: actions/setup-node@v4',
    '        with: {node-version: 24}',
    '      - run: npm install -g npm@latest',
    '      - uses: actions/setup-node@v4',
    '        with: {node-version: "24.10.0"}',
    '      - run: npm install -g npm@latest',
    '      - run: npm install --global npm@11',
  ].join('\n') });
  assert.deepEqual(lint(root).map(({ id, line, severity }) => [id, line, severity]), [
    ['npm-latest-on-old-node', 7, 'error'],
    ['npm-latest-on-old-node', 10, 'warning'],
    ['npm-latest-on-old-node', 16, 'error'],
  ]);
});

test('checks unpinned npx commands, not local binaries, pinned packages, comments or strings', (t) => {
  const root = repo(t, {
    'package.json': { devDependencies: { '@playwright/test': '^1.0.0' } },
    'packages/a/package.json': { dependencies: { typedoc: '^0.28.0' } },
    [workflow]: [
      'jobs:',
      '  docs:',
      '    steps:',
      '      - run: |',
      '          # npx commented',
      '          echo "npx not-a-command"',
      '          cd packages/a && npx typedoc',
      '          npx -y playwright install',
      '          npx --package @org/tool@1.0.0 -- tool',
      '          npx --no-install no-fetch',
      '          npx optional@latest',
      '          npx -y --package=@org/real-tool -- real-tool',
      '          npx \\',
      '            --yes other-tool',
      '      - run: npx typedoc',
      '      - run: npx dynamic',
      '        working-directory: "${{ inputs.path }}"',
    ].join('\n'),
  });
  assert.deepEqual(lines(lint(root)), [11, 12, 13, 15].map((line) => ['unpinned-npx', line]));
});

test('recognizes Yarn classic workspace dependencies hoisted at the root', (t) => {
  const root = repo(t, {
    'package.json': { workspaces: { packages: ['packages/*'] } },
    'packages/test/package.json': { devDependencies: { hardhat: '^2.19.4' } },
    'yarn.lock': '# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.\n# yarn lockfile v1\n',
    [workflow]: 'jobs: {test: {steps: [{run: "npx hardhat node &"}]}}',
  });
  assert.deepEqual(lint(root), []);
});

test('Node EOL warnings are opt-in and do not make the CLI fail', (t) => {
  const root = repo(t, { [workflow]: 'jobs: {test: {steps: [{uses: actions/setup-node@v4, with: {node-version: 16}}]}}' });
  assert.deepEqual(lint(root), []);
  assert.deepEqual(lint(root, { eol: true }).map(({ id, severity }) => [id, severity]), [['eol-node', 'warning']]);
  const result = spawnSync(process.execPath, [cli, '--eol', root], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /warning \[eol-node\]/);
});

test('CLI emits JSON, Actions annotations, and distinct finding and usage exit codes', (t) => {
  const root = repo(t, {
    'checkout/.github/workflows/docs,preview.yaml': fixture('alby.yml'),
    'checkout/package.json': { engines: { node: '>=22' } },
  });
  const result = spawnSync(process.execPath, [cli, '--format', 'json', join(root, 'checkout')], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: root },
  });
  assert.equal(result.status, 1);
  const findings = JSON.parse(result.stdout);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].file, '.github/workflows/docs,preview.yaml');
  assert.ok(findings.every(({ severity, hint }) => severity === 'error' && hint));
  assert.match(result.stderr, /::error file=checkout\/\.github\/workflows\/docs%2Cpreview\.yaml,line=6,title=engines-mismatch::/);
  const bad = spawnSync(process.execPath, [cli, '--format', 'unknown'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Usage: ci-drift/);
});
