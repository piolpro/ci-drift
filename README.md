# ci-drift

Catch Node.js CI breakage in GitHub Actions workflows before it ships. ci-drift statically checks `.github/workflows/*.yml` and `*.yaml` against the repository's package manifests. It doesn't execute workflows, install their tools, or contact a registry while linting.

## CLI

Requires Node.js 20 or newer. Once v0.1.0 is published:

```sh
npx ci-drift@0.1.0
npm install --global ci-drift@0.1.0
ci-drift ./path/to/repo
ci-drift --format json --eol ./path/to/repo
```

From a source checkout, run `npm ci` and `node src/cli.js [path]`.

```text
.github/workflows/docs.yml:24 error [unpinned-npx] npx can fetch an unpinned version of typedoc.
  Fix: Add the tool as a locked local devDependency or invoke npx with an exact version.
```

JSON output is an array of objects with `id`, `severity`, `file`, `line` (1-based), `message`, and `hint`. Exit status is **0** for no errors (including warning-only runs), **1** for findings with severity `error`, or **2** for usage or input errors. In GitHub Actions, findings also emit workflow annotations on stderr, keeping JSON stdout machine-readable.

## GitHub Action

Use the composite action after checkout. The `v1` ref below is the intended stable Action ref; on an unreleased checkout, use `uses: ./` instead.

```yaml
name: Lint CI
on: [push, pull_request]
permissions:
  contents: read
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: piolpro/ci-drift@v1
        with:
          eol: 'true'
          # path: subdirectory # relative to GITHUB_WORKSPACE; defaults to .
```

The action sets up Node 24 and installs its own locked dependencies, with lifecycle scripts disabled. It does not install dependencies in the target project. Put it in a standalone lint job if you don't want to change the Node version available to later steps.

## Rules

| ID | Reports | Fix |
| --- | --- | --- |
| `engines-mismatch` | An `actions/setup-node` selector that cannot satisfy the applicable package's `engines.node`. Handles static matrices, literal workflow and job environment references, and version files such as `.nvmrc` and `.node-version`. | Align setup-node with the package engine or correct stale engine metadata. |
| `npm-latest-on-old-node` | A global `npm@latest` upgrade on incompatible Node. Also checks bare `npm i -g npm`: newer bundled npm installers may select an older compatible release, so those cases are warnings. | Use a compatible Node release or pin a compatible npm version. |
| `unpinned-npx` | A bare `npx` package or `@latest` invocation that can fetch from the registry. Declared local dependencies, common binary aliases, and Yarn Classic workspace hoisting are recognized for bare invocations. | Add the tool to the manifest and lockfile, or specify its version in the command. |
| `eol-node` | A setup-node input limited to an end-of-life major, based on the [Node.js release schedule](https://github.com/nodejs/Release#release-schedule). Off by default; enable with `--eol` or the Action input. | Move the job to a supported Node release. |

ci-drift resolves static working directories (including simple `cd` commands) to the closest package manifest. It does not try to execute arbitrary shell, expand dynamic Actions expressions, recurse through reusable workflows, or infer what version a moving alias such as `lts/*` will resolve to. A version range with any compatible portion is not reported. The npm compatibility rule uses a built-in snapshot of npm's latest release and its Node engines, documented in the [changelog](CHANGELOG.md).

See the [10-repository audit](docs/real-world-results.md) for real examples, [CONTRIBUTING.md](CONTRIBUTING.md) to run tests, or [LICENSE](LICENSE) for terms.
