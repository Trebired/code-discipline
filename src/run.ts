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
import type { SourceProgressObserver, SourceScanObserver } from "./imports/types.js";
import { orchestrateCodeDisciplineRun } from "./runtime/orchestrate.js";
import { InvalidCodeDisciplineConfigError } from "./shared/errors.js";
import type { LoggingOptions } from "./shared/logging-types.js";
import { resolveCodeDisciplinePresetConfig } from "./config/normalize/presets.js";

type CodeDisciplineInvocationOptions = {
  projectRoot: string;
  configPath?: string;
  logging?: LoggingOptions;
  logger?: unknown;
  progressObserver?: SourceProgressObserver;
  scanObserver?: SourceScanObserver;
};

type CodeDisciplineOptions = CheckCodeDisciplineOptions& {
  mode: CodeDisciplineRuntimeMode;
  logger?: unknown;
};

type CheckCodeDisciplineCommandOptions = Omit<CodeDisciplineOptions, "mode">& {
  mode: "check";
};

type FixCodeDisciplineCommandOptions = Omit<CodeDisciplineOptions, "mode">& {
  mode: "fix";
};

type CodeDisciplineResult = CheckCodeDisciplineResult | FixCodeDisciplineResult;
type RuntimeCodeDisciplineOptions = CodeDisciplineConfig& {
  projectRoot: string;
};

type CheckCodeDisciplineInvocationOptions = CodeDisciplineInvocationOptions& {
  onlyRules?: CodeDisciplineRuleSlug[];
};

type FixCodeDisciplineInvocationOptions = CodeDisciplineInvocationOptions& {
  onlyRules?: FixableRuleSlug[];
};

type CodeDisciplineRunInvocationOptions =
|(CheckCodeDisciplineInvocationOptions& { mode: "check" })
|(FixCodeDisciplineInvocationOptions& { mode: "fix" });

type CreatedCodeDiscipline = {
  config: CodeDisciplineConfig;
  run: (options: CodeDisciplineRunInvocationOptions) => Promise<CodeDisciplineResult>;
  check: (options: CheckCodeDisciplineInvocationOptions) => Promise<CheckCodeDisciplineResult>;
  fix: (options: FixCodeDisciplineInvocationOptions) => Promise<FixCodeDisciplineResult>;
};

function resolveLoggingOptions(options: {
    logging?: LoggingOptions;
    logger?: unknown;
}): LoggingOptions | undefined {
  const hasLogger = options.logger !== undefined;

  if (!options.logging && !hasLogger) {
    return undefined;
  }

  return {
    ...options.logging,
    logger: hasLogger ? options.logger : options.logging?.logger,
  };
}

function mergeLoggingOptions(
  baseLogging: LoggingOptions | undefined,
  options: {
    logging?: LoggingOptions;
    logger?: unknown;
  },
): LoggingOptions | undefined {
  return resolveLoggingOptions({
      logging: {
        ...baseLogging,
        ...options.logging,
        logger: options.logging?.logger ?? baseLogging?.logger,
        adapter: options.logging?.adapter ?? baseLogging?.adapter,
      },
      logger: options.logger,
  });
}

function buildCheckOptions(options: RuntimeCodeDisciplineOptions): CheckCodeDisciplineOptions {
  return {
    configPath: options.configPath,
    projectRoot: options.projectRoot,
    excludeSourceExtensions: options.excludeSourceExtensions,
    ignore: options.ignore,
    gitignorePath: options.gitignorePath,
    logging: resolveLoggingOptions(options),
    onlyRules: options.onlyRules,
    presets: options.presets,
    progressObserver: options.progressObserver,
    rules: options.rules,
    scanObserver: options.scanObserver,
  };
}

function buildFixOptions(options: RuntimeCodeDisciplineOptions): FixCodeDisciplineOptions {
  return {
    ...buildCheckOptions(options),
    onlyRules: options.onlyRules as FixableRuleSlug[] | undefined,
  };
}

function assertRemovedInvocationOptions(options: Record<string, unknown>): void {
  if ("formatters"in options) {
    throw new InvalidCodeDisciplineConfigError("formatters is no longer supported; use rules.formatting instead", {
        key: "formatters",
    });
  }

  if ("formatter"in options) {
    throw new InvalidCodeDisciplineConfigError("formatter is no longer supported; use rules.formatting instead", {
        key: "formatter",
    });
  }
}

function codeDiscipline(options: CheckCodeDisciplineCommandOptions): Promise<CheckCodeDisciplineResult>;
function codeDiscipline(options: FixCodeDisciplineCommandOptions): Promise<FixCodeDisciplineResult>;
function codeDiscipline(options: CodeDisciplineOptions): Promise<CodeDisciplineResult>;
async function codeDiscipline(options: CodeDisciplineOptions): Promise<CodeDisciplineResult> {
  assertRemovedInvocationOptions(options as unknown as Record<string, unknown>);
  const baseConfig: CodeDisciplineConfig = {
    ignore: options.ignore,
    gitignorePath: options.gitignorePath,
    lifecycle: options.lifecycle,
    logging: options.logging,
    onlyRules: options.onlyRules,
    presets: options.presets,
    helpers: options.helpers,
    rules: options.rules,
    excludeSourceExtensions: options.excludeSourceExtensions,
    progressObserver: options.progressObserver,
    scanObserver: options.scanObserver,
  };
  const resolvedConfig = await resolveCodeDisciplinePresetConfig(baseConfig, {
      projectRoot: options.projectRoot,
  });
  const resolvedOptions: RuntimeCodeDisciplineOptions = {
    ...resolvedConfig,
    configPath: options.configPath,
    projectRoot: options.projectRoot,
  };

  return orchestrateCodeDisciplineRun({
      config: resolvedConfig,
      configPath: options.configPath,
      mode: options.mode,
      projectRoot: options.projectRoot,
      async execute() {
        if (options.mode === "check") {
          return checkCodeDiscipline(buildCheckOptions(resolvedOptions));
        }

        return fixCodeDiscipline(buildFixOptions(resolvedOptions));
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
