import { checkCodeDiscipline, fixCodeDiscipline } from "./checks/index.js";
import type {
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineConfig,
  CodeDisciplineRuleSlug,
  CodeDisciplineMode,
  CodeDisciplineRuntimeMode,
  FixableRuleSlug,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
} from "./checks/types.js";
import { orchestrateCodeDisciplineRun } from "./runtime/orchestrate.js";
import type { LoggingOptions } from "./shared/logging-types.js";

type CodeDisciplineInvocationOptions = {
  projectRoot: string;
  configPath?: string;
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

type CodeDisciplineResult = CheckCodeDisciplineResult | FixCodeDisciplineResult;

type CheckCodeDisciplineInvocationOptions = CodeDisciplineInvocationOptions & {
  onlyRules?: CodeDisciplineRuleSlug[];
};

type FixCodeDisciplineInvocationOptions = CodeDisciplineInvocationOptions & {
  onlyRules?: FixableRuleSlug[];
};

type CodeDisciplineRunInvocationOptions =
  | (CheckCodeDisciplineInvocationOptions & { mode: "check" })
  | (FixCodeDisciplineInvocationOptions & { mode: "fix" });

type CreatedCodeDiscipline = {
  config: CodeDisciplineConfig;
  run: (options: CodeDisciplineRunInvocationOptions) => Promise<CodeDisciplineResult>;
  check: (options: CheckCodeDisciplineInvocationOptions) => Promise<CheckCodeDisciplineResult>;
  fix: (options: FixCodeDisciplineInvocationOptions) => Promise<FixCodeDisciplineResult>;
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
    configPath: options.configPath,
    projectRoot: options.projectRoot,
    sourceRoot: options.sourceRoot,
    sourceExtensions: options.sourceExtensions,
    includeDefaultSourceExtensions: options.includeDefaultSourceExtensions,
    excludeDirs: options.excludeDirs,
    gitignorePath: options.gitignorePath,
    logging: resolveLoggingOptions(options),
    onlyRules: options.onlyRules,
    rules: options.rules,
    evasionGuards: options.evasionGuards,
  };
}

function buildFixOptions(options: Omit<CodeDisciplineOptions, "mode">): FixCodeDisciplineOptions {
  return {
    ...buildCheckOptions(options),
    onlyRules: options.onlyRules as FixableRuleSlug[] | undefined,
  };
}

function codeDiscipline(options: CheckCodeDisciplineCommandOptions): Promise<CheckCodeDisciplineResult>;
function codeDiscipline(options: FixCodeDisciplineCommandOptions): Promise<FixCodeDisciplineResult>;
function codeDiscipline(options: CodeDisciplineOptions): Promise<CodeDisciplineResult>;
async function codeDiscipline(options: CodeDisciplineOptions): Promise<CodeDisciplineResult> {
  const baseConfig: CodeDisciplineConfig = {
    excludeDirs: options.excludeDirs,
    gitignorePath: options.gitignorePath,
    lifecycle: options.lifecycle,
    logging: options.logging,
    onlyRules: options.onlyRules,
    rules: options.rules,
    evasionGuards: options.evasionGuards,
    sourceExtensions: options.sourceExtensions,
    includeDefaultSourceExtensions: options.includeDefaultSourceExtensions,
    sourceRoot: options.sourceRoot,
    tsconfigPaths: options.tsconfigPaths,
  };

  return orchestrateCodeDisciplineRun({
    config: baseConfig,
    configPath: options.configPath,
    mode: options.mode,
    projectRoot: options.projectRoot,
    async execute() {
      if (options.mode === "check") {
        return checkCodeDiscipline(buildCheckOptions(options));
      }

      return fixCodeDiscipline(buildFixOptions(options));
    },
  });
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
  CodeDisciplineRunInvocationOptions,
  CreatedCodeDiscipline,
  CheckCodeDisciplineInvocationOptions,
  FixCodeDisciplineInvocationOptions,
  FixCodeDisciplineCommandOptions,
};
