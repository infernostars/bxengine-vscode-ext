# bxengine VS Code Extension

VS Code language support for B++ (`.bpp` / `.b++`) backed by `bxengine-lsp`.

## Extension Settings

- `bxengine.lsp.command`: command to start the server (default: `bxengine-lsp`) (one day i'll get to actually making bxengine work from your PATH)
- `bxengine.lsp.args`: extra args passed to the command
- `bxengine.lsp.env`: extra environment variables for the server process
- `bxengine.lsp.fallbackToPyPi`: if command is missing, run with `uvx` from PyPI
- `bxengine.lsp.pypiPackage`: package used by `uvx` fallback (default: `bxengine@latest`)
- `bxengine.lsp.projectPath`: path to Python `bxengine` project for `uv` fallback
- `bxengine.lsp.fallbackToUvProject`: when command is missing, run `uv run --project <projectPath> bxengine-lsp` (default: `false`)
- `bxengine.trace.server`: LSP trace verbosity (`off`, `messages`, `verbose`)