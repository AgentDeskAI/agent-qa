# Contributing to Agent QA

Thank you for your interest in contributing to Agent QA!

## Development Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Build packages: `pnpm build`
4. Run tests: `pnpm test`

## Repository Structure

```
agent-qa/
├── packages/
│   ├── core/              # Main framework
│   ├── cost-registry/     # LLM pricing
│   └── traces-api/        # Tempo client
├── examples/
│   └── demo-agent/        # Example project
└── docs/                  # Documentation
```

## Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Add/update tests as needed
4. Run `pnpm check` to lint and type-check
5. Add a changeset (see [Changesets](#changesets) below)
6. Submit a pull request

## Code Style

- TypeScript with strict mode
- ESLint for linting
- Vitest for testing
- Conventional commit messages

## Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @agent-qa/core test

# Run tests with coverage
pnpm --filter @agent-qa/core test:coverage

# Watch mode
pnpm --filter @agent-qa/core test:watch
```

## Documentation

- Update docs in `docs/` for user-facing changes
- Update CLAUDE.md for AI assistant context
- Include JSDoc comments for public APIs

## Pull Request Process

1. Update documentation for any user-facing changes
2. Add tests for new functionality
3. Ensure CI passes
4. Request review from maintainers

## Changesets

We use [changesets](https://github.com/changesets/changesets) to manage versioning and changelogs.

### When to add a changeset

Add a changeset when your PR includes changes that should be released:
- New features
- Bug fixes
- Breaking changes
- Dependency updates that affect users

**Don't** add a changeset for:
- Documentation-only changes
- CI/tooling changes
- Test-only changes

### Adding a changeset

```bash
pnpm changeset
```

This interactive command will prompt you to:
1. Select which packages changed
2. Choose the semver bump type (patch/minor/major)
3. Write a summary of the changes

A markdown file will be created in `.changeset/` - commit this with your PR.

### Semver guidelines

- **patch**: Bug fixes, dependency updates, small improvements
- **minor**: New features, non-breaking API additions
- **major**: Breaking changes

## Release Process

Releases are handled automatically via GitHub Actions and changesets:

1. **PRs merged to `main`**: If the PR contains changesets, the bot creates/updates a "Release PR" that bumps versions and updates changelogs

2. **Release PR merged**: The bot publishes all updated packages to npm

The release PR accumulates changes - you don't need to merge it after every PR. Merge it when you're ready to publish a new version.

## Questions?

Open an issue for questions or discussions.
