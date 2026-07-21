import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { resolveConfig } from "vite-plus";
import { run, type CliOptions, type JsCommandResolvedResult } from "vite-plus/binding";

const environment = {
  JS_RUNTIME_VERSION: process.versions.node,
  JS_RUNTIME_NAME: process.release.name ?? "node",
  NODE_PACKAGE_MANAGER: "vite-plus",
};

const requireFromProject = () => createRequire(join(process.cwd(), "package.json"));

const resolvers = {
  async vite(): Promise<JsCommandResolvedResult> {
    const require = requireFromProject();

    return {
      binPath: join(dirname(require.resolve("@voidzero-dev/vite-plus-core")), "cli.js"),
      envs: environment,
    };
  },
  async test(): Promise<JsCommandResolvedResult> {
    const require = requireFromProject();
    const packagePath = require.resolve("vitest/package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
      bin: string | { vitest?: string };
    };
    const bin = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin.vitest;

    if (!bin) {
      throw new Error("Could not resolve the Vitest executable.");
    }

    return { binPath: join(dirname(packagePath), bin), envs: environment };
  },
  async fmt(): Promise<JsCommandResolvedResult> {
    const require = requireFromProject();

    return {
      binPath: join(dirname(dirname(require.resolve("oxfmt"))), "bin", "oxfmt"),
      envs: { ...environment, VP_RESOLVING_CONFIG_METADATA: "1" },
    };
  },
  async lint(): Promise<JsCommandResolvedResult> {
    const require = requireFromProject();

    return {
      binPath: join(dirname(dirname(require.resolve("oxlint"))), "bin", "oxlint"),
      envs: {
        ...environment,
        OXLINT_TSGOLINT_PATH: require.resolve("oxlint-tsgolint/bin/tsgolint"),
        VP_RESOLVING_CONFIG_METADATA: "1",
      },
    };
  },
  async pack(): Promise<JsCommandResolvedResult> {
    const require = requireFromProject();

    return {
      binPath: join(dirname(require.resolve("vite-plus/package.json")), "dist", "pack-bin.js"),
      envs: environment,
    };
  },
  async doc(): Promise<JsCommandResolvedResult> {
    const require = requireFromProject();

    return {
      binPath: require.resolve("vitepress/bin/vitepress.js"),
      envs: environment,
    };
  },
};

const resolveUniversalViteConfig: CliOptions["resolveUniversalViteConfig"] = async (error, cwd) => {
  if (error) {
    throw error;
  }

  const config = await resolveConfig({ root: cwd }, "build");
  const universalConfig = config as typeof config & {
    check?: unknown;
    fmt?: unknown;
    lint?: unknown;
    run?: unknown;
    staged?: unknown;
  };

  return JSON.stringify({
    configFile: config.configFile,
    check: universalConfig.check,
    fmt: universalConfig.fmt,
    lint: universalConfig.lint,
    run: universalConfig.run,
    staged: universalConfig.staged,
  });
};

export const vp = async (command: string, args: string[]) => {
  const exitCode = await run({
    ...resolvers,
    args: [command, ...args],
    cwd: process.cwd(),
    resolveUniversalViteConfig,
  });

  process.exitCode = exitCode;

  return exitCode;
};
