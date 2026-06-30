import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { generateFromTemplate } from '../utils/generator';

const SUPPORTED_PROVIDERS = ['google'];

export async function addCommand(provider: string): Promise<void> {
  const normalized = provider.toLowerCase();

  if (!SUPPORTED_PROVIDERS.includes(normalized)) {
    console.error(
      chalk.red(`Unsupported provider: "${provider}".`) +
        ' Supported: ' +
        chalk.cyan(SUPPORTED_PROVIDERS.join(', ')),
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const authPath = path.join(cwd, 'src', 'auth');

  if (!(await fs.pathExists(authPath))) {
    console.error(
      chalk.red('Auth structure not found.') +
        ' Run ' +
        chalk.cyan('nest-auth init') +
        ' first.',
    );
    process.exit(1);
  }

  const strategyPath = path.join(authPath, 'strategies', `${normalized}.strategy.ts`);
  if (await fs.pathExists(strategyPath)) {
    console.log(chalk.yellow(`${provider} has already been added.`));
    return;
  }

  if (normalized === 'google') {
    await addGoogle(cwd, authPath);
  }
}

async function addGoogle(cwd: string, authPath: string): Promise<void> {
  const spinner = ora('Adding Google OAuth...').start();

  try {
    const strategyTarget = path.join(authPath, 'strategies', 'google.strategy.ts');
    const controllerTarget = path.join(authPath, 'controllers', 'google.controller.ts');

    await generateFromTemplate('google.strategy.hbs', strategyTarget);
    await generateFromTemplate('google.controller.hbs', controllerTarget);

    const envPath = path.join(cwd, '.env.example');
    const existing = (await fs.pathExists(envPath))
      ? await fs.readFile(envPath, 'utf-8')
      : '';

    if (!existing.includes('GOOGLE_CLIENT_ID')) {
      await fs.appendFile(
        envPath,
        '\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nGOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback\n',
      );
    }

    spinner.succeed(chalk.green('Google OAuth files generated.'));

    console.log('\n' + chalk.bold('Generated files:'));
    console.log('  ' + chalk.cyan(path.relative(cwd, strategyTarget)));
    console.log('  ' + chalk.cyan(path.relative(cwd, controllerTarget)));

    console.log('\n' + chalk.bold('Next steps:'));
    console.log(
      '  1. In your NestJS project, install: ' +
        chalk.cyan('npm install passport-google-oauth20') +
        ' and ' +
        chalk.cyan('npm install -D @types/passport-google-oauth20'),
    );
    console.log(
      '  2. Register ' +
        chalk.cyan('GoogleStrategy') +
        ' and ' +
        chalk.cyan('GoogleController') +
        ' in your AuthModule.',
    );
    console.log('  3. Fill in the Google vars in ' + chalk.cyan('.env.example') + '.');
  } catch (err) {
    spinner.fail(chalk.red('Failed to add Google OAuth.'));
    throw err;
  }
}
