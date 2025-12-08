# Contributing to TAPAANO AI ERP Platform

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and considerate in all interactions. We aim to maintain a welcoming and inclusive environment.

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include steps to reproduce, expected behavior, and actual behavior
4. Add screenshots if applicable

### Suggesting Features

1. Check existing feature requests
2. Describe the problem you're trying to solve
3. Explain your proposed solution
4. Consider the impact on existing functionality

### Submitting Pull Requests

1. **Fork and Clone**

   ```bash
   git clone https://github.com/YOUR_USERNAME/finance-erp.git
   cd finance-erp
   ```

2. **Create a Branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Changes**
   - Follow the existing code style
   - Write meaningful commit messages
   - Add tests if applicable
   - Update documentation as needed

4. **Test Your Changes**

   ```bash
   npm run lint
   npm run build
   ```

5. **Submit PR**
   - Reference any related issues
   - Describe your changes clearly
   - Be responsive to review feedback

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Local Development

```bash
npm install
npm run dev
```

### Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Add comments for complex logic
- Use Tailwind CSS for styling
- Follow shadcn/ui patterns for components

### Commit Messages

Follow conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Example: `feat: add invoice PDF export functionality`

## Project Structure

```
src/
├── components/     # React components
│   ├── forms/      # Form components
│   ├── layout/     # Layout components
│   └── ui/         # Base UI components
├── hooks/          # Custom React hooks
├── pages/          # Page components
├── lib/            # Utility functions
└── integrations/   # External integrations
```

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.

## Questions?

Open an issue with the `question` label or start a discussion.

Thank you for contributing!
