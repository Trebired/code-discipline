import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";

type GateCommandOptions = {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

type GateCommandResult = {
  exitCode: number;
};

const FORWARDED_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"];

function toExitCodeFromSignal(signal: NodeJS.Signals | null): number {
  if (!signal) return 1;

  const signalNumber = osConstants.signals[signal];
  return typeof signalNumber === "number" ? 128 + signalNumber : 1;
}

async function runGatedCommand(options: GateCommandOptions): Promise<GateCommandResult> {
  return await new Promise((resolve, reject) => {
      const child = spawn(options.command, options.args, {
          cwd: options.cwd,
          env: options.env ?? process.env,
          stdio: "inherit",
      });

      const listeners = new Map<NodeJS.Signals, ()=>void>();

      function cleanupListeners() {
        for (const [signal, listener] of listeners) {
          process.removeListener(signal, listener);
        }
        listeners.clear();
      }

      for (const signal of FORWARDED_SIGNALS) {
        const listener = () => {
          if (!child.killed) {
            child.kill(signal);
          }
        };

        try {
          process.on(signal, listener);
          listeners.set(signal, listener);
        } catch {
        }
      }

      child.once("error", (error) => {
          cleanupListeners();
          reject(error);
      });

      child.once("exit", (code, signal) => {
          cleanupListeners();
          resolve({
              exitCode: code ?? toExitCodeFromSignal(signal),
          });
      });
  });
}

export { runGatedCommand };
export type { GateCommandOptions, GateCommandResult };
