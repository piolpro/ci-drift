# ci-drift 0.1.0: ten-repository audit

On 2026-11-23, we ran the default rules against ten public JS/Web3 repository snapshots. For the four linked fixes, the snapshot is the first parent of GitHub's PR test merge (the target branch before the patch). For the other six, it is the default-branch HEAD at audit time. Findings were classified by inspecting the workflow, package metadata, and patch where applicable; we did not execute upstream CI jobs. EOL warnings were disabled.

| Repository | Commit | Finding | Assessment |
| --- | --- | --- | --- |
| getAlby/js-sdk | [`df85c4a`](https://github.com/getAlby/js-sdk/commit/df85c4aed5d7c0eb809746aa19561152052ae1e5) | `docs.yml:20` selected Node 20 against `engines.node >=22`; `docs.yml:24` ran `npx typedoc` without a local TypeDoc dependency or version. | **2 true positives.** [PR #603](https://github.com/getAlby/js-sdk/pull/603) updates Node and pins TypeDoc. |
| neynarxyz/nodejs-sdk | [`28a7f13`](https://github.com/neynarxyz/nodejs-sdk/commit/28a7f13a5274016e955eb9bfeaab7eaefe21220b) | `publish-to-npm.yaml:30` upgraded to `npm@latest` after selecting Node 20. | **True positive.** [PR #404](https://github.com/neynarxyz/nodejs-sdk/pull/404) switches to Node 24 and pins npm to major 11. |
| pimlicolabs/alto | [`a30e96b`](https://github.com/pimlicolabs/alto/commit/a30e96b40e4fea65b59151649056552f40676fe1) | None. | [PR #837](https://github.com/pimlicolabs/alto/pull/837) handles different JSON shapes from `npm view` in `jq`; that's outside these rules. |
| api3dao/airnode | [`dd90b7c`](https://github.com/api3dao/airnode/commit/dd90b7cdda7c737a88a3fc2d8739a1888e36d62a) | None. | [PR #2060](https://github.com/api3dao/airnode/pull/2060) pins a Yarn global npm install in a Dockerfile, not a workflow. |
| wevm/viem | [`00182d5`](https://github.com/wevm/viem/commit/00182d5730c834195684941944ad2d30e53dbc00) | `verify.yml:310` selects Node 22 for two matrix rows although the root manifest declares `>=24.5`. | **True compatibility drift.** The full test workflow deliberately includes a Node 22 test row; this result does not establish that the job fails or that maintainers want to remove that coverage. |
| ethers-io/ethers.js | [`3ea4c22`](https://github.com/ethers-io/ethers.js/commit/3ea4c226dd0b3a074abf90748de9d11192027f4f) | None. | No default-rule findings. |
| wevm/wagmi | [`516ed47`](https://github.com/wevm/wagmi/commit/516ed4769e3ffdd1e9757b6218adcbc87e677831) | None. | No default-rule findings. |
| web3/web3.js | [`bf16917`](https://github.com/web3/web3.js/commit/bf1691765bd9d4b0f7a4479e915207707d69226d) | Initial `unpinned-npx` findings at `build.yml:172` and `:216` were removed after tuning. | **2 false positives corrected.** Previous jobs install with Yarn Classic and cache the workspace; Hardhat is a locked dependency of `packages/web3` that is available through workspace hoisting. |
| NomicFoundation/hardhat | [`1d48599`](https://github.com/NomicFoundation/hardhat/commit/1d485994091d2c8b1b5c17be2b816e5a406dcac5) | None. | No default-rule findings. |
| solana-foundation/solana-web3.js | [`3b5f4cf`](https://github.com/solana-foundation/solana-web3.js/commit/3b5f4cf09f96886f186eb6a9d62d622e31974e0a) | None. | No default-rule findings. |

**Final results:** four findings in three repositories; no remaining false positives identified in this sample. As a cross-check, ci-drift returned no findings on the patched test merges for [Alby](https://github.com/getAlby/js-sdk/commit/3ca5786696db194f6aeaf174571f4468a80f7195) and [Neynar](https://github.com/neynarxyz/nodejs-sdk/commit/5610eca251f2798981f60a35c382f768f46aa308). No findings is not proof that a workflow is free of CI problems.

## Reproduce one row

```sh
# Run from a ci-drift checkout after npm ci.
gh_repo=getAlby/js-sdk
commit=df85c4aed5d7c0eb809746aa19561152052ae1e5
git init /tmp/ci-drift-example
git -C /tmp/ci-drift-example fetch --depth 1 "https://github.com/$gh_repo.git" "$commit"
git -C /tmp/ci-drift-example checkout --detach FETCH_HEAD
node src/cli.js --format json /tmp/ci-drift-example
```
