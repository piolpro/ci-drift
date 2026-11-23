# Changelog

## 0.1.0

- Added the ci-drift CLI and composite GitHub Action, with text, JSON, and GitHub annotations.
- Added rules for incompatible package engines, global npm upgrades on incompatible Node, unpinned npx, and optional end-of-life Node warnings.
- Compatibility data for `npm@latest`: npm 12.2.3, Node `^22.22.2 || ^24.15.0 || >=26.0.0`, checked against the public npm registry on 2026-11-23.
- Compared the rules with ten public JS/Web3 repositories, including four pinned pre-fix snapshots.
