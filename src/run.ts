import { checkCodeDiscipline, fixCodeDiscipline } from "./checks/index.js";
import type {
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineConfig,
  FixCodeDisciplineResult,
} from "./checks/types.js";
import { syncImports } from "./imports/sync-imports.js";
import type { SyncImportsOptions, SyncImportsResult } from "./imports/types.js";
import type { LoggingOptions } from "./shared/logging-types.js";

type CodeDisciplineMode = "check" | "fix" | "sync";
type CodeDisciplineRuntimeMode = CodeDisciplineMode | "startup";

type CodeDisciplineInvocationOptions = {
  projectRoot: string;
  logging?: LoggingOptions;
  logger?: unknown;
  quiet?: boolean;
};

type CodeDisciplineOptions = CheckCodeDisciplineOptions & {
  mode: CodeDisciplineRuntimeMode;
  logger?: unknown;
  quiet?: boolean;
};

type CheckCodeDisciplineCommandOptions = Omit<CodeDisciplineOptions, "mode"> & {
  mode: "check";
};

type FixCodeDisciplineCommandOptions = Omit<CodeDisciplineOptions, "mode"> & {
  mode: "fix";
};

type SyncCodeDisciplineCommandOptions = Omit<CodeDisciplineOptions, "mode"> & {
  mode: "sync";
};

type StartupCodeDisciplineCommandOptions = Omit<CodeDisciplineOptions, "mode"> & {
  mode: "startup";
};

type CodeDisciplineResult =
  | CheckCodeDisciplineResult
  | FixCodeDisciplineResult
  | SyncImportsResult;

type CreatedCodeDiscipline = {
  config: CodeDisciplineConfig;
  run: (options: CodeDisciplineInvocationOptions & { mode: CodeDisciplineRuntimeMode }) => Promise<CodeDisciplineResult>;
  check: (options: CodeDisciplineInvocationOptions) => Promise<CheckCodeDisciplineResult>;
  fix: (options: CodeDisciplineInvocationOptions) => Promise<FixCodeDisciplineResult>;
  sync: (options: CodeDisciplineInvocationOptions) => Promise<SyncImportsResult>;
  startup: (options: CodeDisciplineInvocationOptions) => Promise<SyncImportsResult>;
};

function resolveLoggingOptions(options: {
  logging?: LoggingOptions;
  logger?: unknown;
  quiet?: boolean;
}): LoggingOptions | undefined {
  const hasLogger = options.logger !== undefined;
  const hasQuiet = options.quiet !== undefined;

  if (!options.logging && !hasLogger && !hasQuiet) {
    return undefined;
  }

  return {
    ...options.logging,
    enabled: options.logging?.enabled ?? (hasLogger ? true : undefined),
    logger: hasLogger ? options.logger : options.logging?.logger,
    quiet: hasQuiet ? options.quiet : options.logging?.quiet,
  };
}

function mergeLoggingOptions(
  baseLogging: LoggingOptions | undefined,
  options: {
    logging?: LoggingOptions;
    logger?: unknown;
    quiet?: boolean;
  },
): LoggingOptions | undefined {
  return resolveLoggingOptions({
    logging: {
      ...baseLogging,
      ...options.logging,
      enabled: options.logging?.enabled ?? baseLogging?.enabled,
      logger: options.logging?.logger ?? baseLogging?.logger,
      quiet: options.logging?.quiet ?? baseLogging?.quiet,
      adapter: options.logging?.adapter ?? baseLogging?.adapter,
    },
    logger: options.logger,
    quiet: options.quiet,
  });
}

function buildCheckOptions(options: Omit<CodeDisciplineOptions, "mode">): CheckCodeDisciplineOptions {
  return {
    projectRoot: options.projectRoot,
    sourceRoot: options.sourceRoot,
    sourceExtensions: options.sourceExtensions,
    excludeDirs: options.excludeDirs,
    logging: resolveLoggingOptions(options),
    rules: options.rules,
  };
}

function buildSyncOptions(options: Omit<CodeDisciplineOptions, "mode">): SyncImportsOptions {
  const syncRule = options.rules?.syncImports ?? {};

  return {
    projectRoot: options.projectRoot,
    sourceRoot: syncRule.sourceRoot ?? options.sourceRoot,
    tsconfigPath: syncRule.tsconfigPath,
    sourceExtensions: syncRule.sourceExtensions ?? options.sourceExtensions,
    excludeDirs: syncRule.excludeDirs ?? options.excludeDirs,
    severity: syncRule.severity,
    fix: syncRule.fix,
    alias: syncRule.alias,
    allowRelative: syncRule.allowRelative,
    logging: resolveLoggingOptions({
      logging: options.logging ?? syncRule.logging,
      logger: options.logger,
      quiet: options.quiet,
    }),
  };
}

function codeDiscipline(options: CheckCodeDisciplineCommandOptions): Promise<CheckCodeDisciplineResult>;
function codeDiscipline(options: FixCodeDisciplineCommandOptions): Promise<FixCodeDisciplineResult>;
function codeDiscipline(options: SyncCodeDisciplineCommandOptions): Promise<SyncImportsResult>;
function codeDiscipline(options: StartupCodeDisciplineCommandOptions): Promise<SyncImportsResult>;
function codeDiscipline(options: CodeDisciplineOptions): Promise<CodeDisciplineResult>;
async function codeDiscipline(options: CodeDisciplineOptions): Promise<CodeDisciplineResult> {
  const mode = options.mode === "startup" ? "sync" : options.mode;

  if (mode === "check") {
    return checkCodeDiscipline(buildCheckOptions(options));
  }

  if (mode === "fix") {
    return fixCodeDiscipline(buildCheckOptions(options));
  }

  return syncImports(buildSyncOptions(options));
}

function createCodeDiscipline(config: CodeDisciplineConfig): CreatedCodeDiscipline {
  return {
    config,
    run: (options) => codeDiscipline({
      ...config,
      ...options,
      mode: options.mode,
      logging: mergeLoggingOptions(config.logging, options),
    }),
    check: (options) => codeDiscipline({
      ...config,
      ...options,
      mode: "check",
      logging: mergeLoggingOptions(config.logging, options),
    }) as Promise<CheckCodeDisciplineResult>,
    fix: (options) => codeDiscipline({
      ...config,
      ...options,
      mode: "fix",
      logging: mergeLoggingOptions(config.logging, options),
    }) as Promise<FixCodeDisciplineResult>,
    sync: (options) => codeDiscipline({
      ...config,
      ...options,
      mode: "sync",
      logging: mergeLoggingOptions(config.logging, options),
    }) as Promise<SyncImportsResult>,
    startup: (options) => codeDiscipline({
      ...config,
      ...options,
      mode: "startup",
      logging: mergeLoggingOptions(config.logging, options),
    }) as Promise<SyncImportsResult>,
  };
}

export { codeDiscipline, createCodeDiscipline };
export type {
  CheckCodeDisciplineCommandOptions,
  CodeDisciplineInvocationOptions,
  CodeDisciplineMode,
  CodeDisciplineOptions,
  CodeDisciplineResult,
  CodeDisciplineRuntimeMode,
  CreatedCodeDiscipline,
  FixCodeDisciplineCommandOptions,
  StartupCodeDisciplineCommandOptions,
  SyncCodeDisciplineCommandOptions,
};
