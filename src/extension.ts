import * as vscode from "vscode";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  CloseAction,
  ErrorAction,
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel | undefined;

type ExecutableSpec = {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
};

function isWindows(): boolean {
  return process.platform === "win32";
}

function knownExecutableExtensions(): string[] {
  return isWindows()
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
        .split(";")
        .filter(Boolean)
        .map((e) => e.toLowerCase())
    : [""];
}

function candidatePathEntries(): string[] {
  const pathValue = process.env.PATH ?? "";
  const fromEnv = pathValue.split(path.delimiter).filter(Boolean);
  const home = os.homedir();

  const common = isWindows()
    ? []
    : [
        path.join(home, ".local", "bin"),
        path.join(home, ".cargo", "bin"),
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/usr/bin",
      ];

  const merged = [...fromEnv, ...common];
  const deduped = Array.from(new Set(merged));
  return deduped.filter((p) => p.length > 0);
}

function findCommand(command: string): string | undefined {
  if (!command.trim()) {
    return undefined;
  }

  const hasPathSep = command.includes("/") || command.includes("\\");
  if (hasPathSep) {
    return fs.existsSync(command) ? command : undefined;
  }

  const pathEntries = candidatePathEntries();
  const exts = knownExecutableExtensions();

  for (const entry of pathEntries) {
    if (isWindows()) {
      const lowered = command.toLowerCase();
      const hasKnownExt = exts.some((ext) => lowered.endsWith(ext));
      const candidates = hasKnownExt ? [command] : exts.map((ext) => `${command}${ext}`);
      for (const candidate of candidates) {
        const fullPath = path.join(entry, candidate);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
      continue;
    }

    const fullPath = path.join(entry, command);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return undefined;
}

function resolveServerExecutable(): ExecutableSpec {
  const config = vscode.workspace.getConfiguration("bxengine");
  const configuredCommand = config.get<string>("lsp.command", "bxengine-lsp").trim();
  const configuredArgs = config.get<string[]>("lsp.args", []);
  const userEnv = config.get<Record<string, string>>("lsp.env", {});
  const fallbackToPyPi = config.get<boolean>("lsp.fallbackToPyPi", true);
  const pypiPackage = config.get<string>("lsp.pypiPackage", "bxengine@latest").trim();
  const projectPath = config.get<string>("lsp.projectPath", "").trim();
  const fallbackToUvProject = config.get<boolean>("lsp.fallbackToUvProject", false);

  const env: Record<string, string | undefined> = {
    ...process.env,
    ...userEnv,
  };

  const configuredCommandPath = findCommand(configuredCommand);
  if (configuredCommandPath) {
    outputChannel?.appendLine(`[bxengine] Using configured command: ${configuredCommandPath}`);
    return {
      command: configuredCommandPath,
      args: configuredArgs,
      env,
    };
  }

  const uvxPath = findCommand("uvx");
  if (fallbackToPyPi && pypiPackage && uvxPath) {
    outputChannel?.appendLine(`[bxengine] Falling back to PyPI via uvx: ${uvxPath}`);
    return {
      command: uvxPath,
      args: ["--from", pypiPackage, configuredCommand, ...configuredArgs],
      env,
    };
  }

  const uvPath = findCommand("uv");
  if (fallbackToPyPi && pypiPackage && uvPath) {
    outputChannel?.appendLine(`[bxengine] Falling back to PyPI via uv tool run: ${uvPath}`);
    return {
      command: uvPath,
      args: ["tool", "run", "--from", pypiPackage, configuredCommand, ...configuredArgs],
      env,
    };
  }

  if (fallbackToUvProject && projectPath && uvPath) {
    outputChannel?.appendLine(`[bxengine] Falling back to project via uv run: ${uvPath}`);
    return {
      command: uvPath,
      args: ["run", "--project", projectPath, configuredCommand, ...configuredArgs],
      env,
    };
  }

  outputChannel?.appendLine(`[bxengine] PATH seen by extension host: ${process.env.PATH ?? "<empty>"}`);

  throw new Error(
    `Could not find language server command '${configuredCommand}'. ` +
      `Install bxengine-lsp on PATH, or enable PyPI fallback with uvx/uv, or set 'bxengine.lsp.command' to an absolute executable path, ` +
      `or set 'bxengine.lsp.projectPath' and enable 'bxengine.lsp.fallbackToUvProject'.`,
  );
}

function createServerOptions(): ServerOptions {
  const executable = resolveServerExecutable();

  return {
    command: executable.command,
    args: executable.args,
    options: {
      env: executable.env,
    },
  };
}

function createClientOptions(): LanguageClientOptions {
  const trace = vscode.workspace
    .getConfiguration("bxengine")
    .get<string>("trace.server", "off");

  return {
    documentSelector: [
      { scheme: "file", language: "bxengine" },
      { scheme: "untitled", language: "bxengine" },
    ],
    outputChannel: outputChannel,
    traceOutputChannel: outputChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Error,
    initializationFailedHandler: (error): boolean => {
      const message = error instanceof Error ? error.message : String(error);
      outputChannel?.appendLine(`[bxengine] LSP initialization failed: ${message}`);
      return false;
    },
    errorHandler: {
      error: (error, _message, _count) => {
        outputChannel?.appendLine(`[bxengine] LSP transport error: ${error.message}`);
        return { action: ErrorAction.Shutdown };
      },
      closed: () => {
        outputChannel?.appendLine("[bxengine] LSP connection closed.");
        return { action: CloseAction.DoNotRestart };
      },
    },
    synchronize: {
      configurationSection: "bxengine",
    },
    initializationOptions: {
      trace,
    },
  };
}

async function startClient(context: vscode.ExtensionContext): Promise<void> {
  if (client) {
    return;
  }

  const serverOptions = createServerOptions();
  const clientOptions = createClientOptions();

  const nextClient = new LanguageClient(
    "bxengineLanguageServer",
    "bxengine Language Server",
    serverOptions,
    clientOptions,
  );
  try {
    await nextClient.start();
    client = nextClient;
    context.subscriptions.push(nextClient);
  } catch (error) {
    try {
      await nextClient.stop();
    } catch {
      // no-op: start may fail before the client reaches running state
    }
    throw error;
  }
}

async function stopClient(): Promise<void> {
  if (!client) {
    return;
  }
  const current = client;
  client = undefined;
  try {
    await current.stop();
  } catch {
    // no-op: avoid surfacing shutdown errors for failed/starting clients
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("bxengine", { log: true });
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine("[bxengine] Extension activated.");
  context.subscriptions.push(
    vscode.commands.registerCommand("bxengine.restartLanguageServer", async () => {
      await stopClient();
      try {
        await startClient(context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel?.appendLine(`[bxengine] Restart failed: ${message}`);
        void vscode.window.showErrorMessage(`bxengine: ${message}`);
        return;
      }
      void vscode.window.showInformationMessage("bxengine language server restarted.");
    }),
  );

  try {
    await startClient(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel?.appendLine(`[bxengine] Startup failed: ${message}`);
    void vscode.window.showErrorMessage(`bxengine: ${message}`);
    // Keep extension active so user can change settings and run restart command.
    return;
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
