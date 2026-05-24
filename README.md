# bxengine VS Code Extension

VS Code language support for B++ (`.bx`, `.bpp`, `.b++`) backed by `bxengine-lsp`.

## Features

- Starts `bxengine-lsp` over stdio.
- Surfaces diagnostics/warnings from the language server.
- Provides hover/completion via LSP.
- Adds basic TextMate highlighting and bracket config.
- Supports B++ comment-function syntax: `[// ...]` (including nested bracketed content).

## Requirements

Install `bxengine-lsp` so the command is available in your PATH.

Example from the bxengine Python project:

```bash
uv tool install --from /path/to/Python/bxengine bxengine-lsp
```

or from inside that repo:

```bash
uv sync --dev
uv run bxengine-lsp
```

## Extension Settings

- `bxengine.lsp.command`: command to start the server (default: `bxengine-lsp`)
- `bxengine.lsp.args`: extra args passed to the command
- `bxengine.lsp.env`: extra environment variables for the server process
- `bxengine.lsp.fallbackToPyPi`: if command is missing, run with `uvx` from PyPI
- `bxengine.lsp.pypiPackage`: package used by `uvx` fallback (default: `bxengine`)
- `bxengine.lsp.projectPath`: path to Python `bxengine` project for `uv` fallback
- `bxengine.lsp.fallbackToUvProject`: when command is missing, run `uv run --project <projectPath> bxengine-lsp` (default: `false`)
- `bxengine.trace.server`: LSP trace verbosity (`off`, `messages`, `verbose`)

If you see `spawn bxengine-lsp ENOENT`, set:

```json
{
  "bxengine.lsp.fallbackToPyPi": true,
  "bxengine.lsp.pypiPackage": "bxengine"
}
```

This requires `uvx` to be installed and available on your PATH.

## Development

```bash
npm install
npm run compile
```

Press `F5` in VS Code to run the extension host.
