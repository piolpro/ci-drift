# Contributing

Use Node.js 20 or newer:

```sh
npm ci
npm test
node src/cli.js .
npm pack --dry-run
```

For rule changes, add a minimal regression to `test/lint.test.js` and include both a finding and a nearby case that should pass. For a real-world example, link the repository, commit, workflow and line so another contributor can reproduce it.

To refresh the npm compatibility snapshot, run `npm view npm@latest version engines --json`, update `src/versions.js` and the changelog, and rerun the tests. Check the upstream Node.js release schedule when updating the EOL table.
