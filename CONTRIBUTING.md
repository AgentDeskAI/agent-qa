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
5. Submit a pull request

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

## Release Process

Releases are handled automatically via GitHub Actions:
- Pushing to `main` triggers CI
- Creating a release triggers npm publish

## Questions?

Open an issue for questions or discussions.
