# Testing Suites

Use these commands when you want one entry point instead of manually chaining scripts.

## Commands

### Pre-push

```bash
npm run verify
```

Runs the core local checks:

- `lint`
- `test`
- `build`
- `smoke:plan:all`

### Pre-release / go-live

```bash
npm run verify:release
```

Runs:

- `npm run verify`
- `find:test:e2e:all`
- `automation:test:nodes`
- `campaign:test:pipeline:routing`
- `pipeline:test:reply-bounce`

This suite expects `.env` and `.env.16shards` to exist and will hit live integrations.

### AI builder regression suite

```bash
npm run verify:ai-builder
```

Runs:

- `ai-builder:test:all`

This suite expects:

- `.env`
- local dev proxy available at `http://localhost:8080`

### Everything

```bash
npm run verify:full
```

Runs the release suite plus AI builder regression checks.

## Helper options

The runner also supports direct invocation:

```bash
node scripts/run-quality-suite.js --list
node scripts/run-quality-suite.js core --dry-run
node scripts/run-quality-suite.js release --continue-on-error
```

## Notes

- The runner stops on the first failing check by default.
- `--continue-on-error` lets the suite finish and prints a full summary.
- Preflight warnings are shown for missing files or unreachable local services before the suite starts.
