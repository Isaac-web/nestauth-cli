import fs from 'fs-extra';
import path from 'path';

export interface CliConfig {
  routePrefix: string;
  envFilePath?: string;
}

const CONFIG_FILE = '.nest-auth.json';

export async function readCliConfig(cwd: string): Promise<CliConfig | null> {
  const configPath = path.join(cwd, CONFIG_FILE);
  if (!(await fs.pathExists(configPath))) return null;
  return fs.readJson(configPath) as Promise<CliConfig>;
}

export async function writeCliConfig(cwd: string, config: CliConfig): Promise<void> {
  await fs.writeJson(path.join(cwd, CONFIG_FILE), config, { spaces: 2 });
}
