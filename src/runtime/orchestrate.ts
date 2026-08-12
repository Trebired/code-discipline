import type {
  CheckCodeDisciplineResult,
  CodeDisciplineConfig,
  CodeDisciplineLifecycleContext,
  CodeDisciplineLifecycleHooks,
  CodeDisciplineRuntimeMode,
  FixCodeDisciplineResult,
} from "#uqbg4indzud7";
import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import { prepareTsconfigPaths, restoreTsconfigPaths } from "./tsconfig-paths.js";

type OrchestratorOptions = {
  config: CodeDisciplineConfig;
  configPath?: string;
  mode: CodeDisciplineRuntimeMode;
  projectRoot: string;
  execute: () => Promise<CheckCodeDisciplineResult|FixCodeDisciplineResult>;
};

type OrchestratorResult = CheckCodeDisciplineResult | FixCodeDisciplineResult;

function createLifecycleContext(args: {
    config: CodeDisciplineConfig;
    configPath?: string;
    mode: CodeDisciplineRuntimeMode;
    projectRoot: string;
}): CodeDisciplineLifecycleContext {
  return {
    config: args.config,
    configPath: args.configPath,
    mode: args.mode,
    projectRoot: args.projectRoot,
    state: {},
  };
}

async function runLifecycleHook(
  hook: ((context: CodeDisciplineLifecycleContext, result?: OrchestratorResult) => void |Promise<void>) | undefined,
  context: CodeDisciplineLifecycleContext,
  result?: OrchestratorResult,
): Promise<void> {
  if (!hook) return;
  await hook(context, result);
}

async function orchestrateRun(
  options: OrchestratorOptions,
): Promise<OrchestratorResult> {
  const context = createLifecycleContext({
      config: options.config,
      configPath: options.configPath,
      mode: options.mode,
      projectRoot: options.projectRoot,
  });
  const lifecycle: CodeDisciplineLifecycleHooks | undefined = options.config.lifecycle;
  if ("tsconfigPaths"in(options.config as Record<string, unknown>)) {
    throw new InvalidCodeDisciplineConfigError("tsconfigPaths is no longer supported; use rules.imports.runtime instead", {
        key: "tsconfigPaths",
    });
  }

  const preparedTsconfigPaths = await prepareTsconfigPaths(
    options.projectRoot,
    options.config.rules?.imports?.runtime,
    options.mode,
  );

  if (preparedTsconfigPaths) {
    context.state.tsconfigPaths = {
      changed: preparedTsconfigPaths.changed,
      restoreAfterRun: preparedTsconfigPaths.restoreAfterRun,
      restoreOnExit: preparedTsconfigPaths.restoreOnExit,
      tsconfigPath: preparedTsconfigPaths.tsconfigPath,
    };
  }

  let result: OrchestratorResult | undefined;

  try {
    await runLifecycleHook(lifecycle?.beforeRun as any, context);
    await runLifecycleHook(lifecycle?.beforeMode as any, context);

    result = await options.execute();

    await runLifecycleHook(lifecycle?.afterMode as any, context, result);
    await runLifecycleHook(lifecycle?.afterRun as any, context, result);
    return result;
  } finally {
    const restoredTsconfigPaths = await restoreTsconfigPaths(preparedTsconfigPaths);
    if (restoredTsconfigPaths) {
      context.state.tsconfigPaths = restoredTsconfigPaths;
    }
  }
}

export { createLifecycleContext, orchestrateRun };
export type { OrchestratorOptions, OrchestratorResult };
