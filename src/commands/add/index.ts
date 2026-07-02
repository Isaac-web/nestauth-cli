import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { addEmail } from './providers/email';
import { addGoogle } from './providers/google';

const providers: Record<string, (cwd: string, authPath: string) => Promise<void>> = {
  email: addEmail,
  google: addGoogle,
};

export async function addCommand(provider: string): Promise<void> {
  const normalized = provider.toLowerCase();
  const handler = providers[normalized];

  if (!handler) {
    console.error(
      chalk.red(`Unsupported provider: "${provider}".`) +
        ' Supported: ' +
        chalk.cyan(Object.keys(providers).join(', ')),
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const authPath = path.join(cwd, 'src', 'auth');

  if (!(await fs.pathExists(authPath))) {
    console.error(
      chalk.red('Auth structure not found.') + ' Run ' + chalk.cyan('nestauth init') + ' first.',
    );
    process.exit(1);
  }

  await handler(cwd, authPath);
}
