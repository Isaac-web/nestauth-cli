import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { generateFromTemplate } from '../utils/generator';

interface InitAnswers {
  providers: string[];
  refreshTokens: boolean;
}

export async function initCommand(): Promise<void> {
  const answers = await inquirer.prompt<InitAnswers>([
    {
      type: 'checkbox',
      name: 'providers',
      message: 'Which auth providers do you need?',
      choices: ['Email / Password', 'Google OAuth'],
      default: ['Email / Password'],
    },
    {
      type: 'confirm',
      name: 'refreshTokens',
      message: 'Enable refresh tokens?',
      default: true,
    },
  ]);

  const spinner = ora('Generating auth structure...').start();

  try {
    const cwd = process.cwd();
    const authPath = path.join(cwd, 'src', 'auth');

    const files: Array<{ template: string; target: string }> = [
      {
        template: 'auth-type.enum.hbs',
        target: path.join(authPath, 'enums', 'auth-type.enum.ts'),
      },
      {
        template: 'auth.decorator.hbs',
        target: path.join(authPath, 'decorators', 'auth.decorator.ts'),
      },
      {
        template: 'current-user.decorator.hbs',
        target: path.join(authPath, 'decorators', 'current-user.decorator.ts'),
      },
      {
        template: 'access-token.guard.hbs',
        target: path.join(authPath, 'guards', 'access-token.guard.ts'),
      },
      {
        template: 'authentication.guard.hbs',
        target: path.join(authPath, 'guards', 'authentication.guard.ts'),
      },
      {
        template: 'jwt.strategy.hbs',
        target: path.join(authPath, 'strategies', 'jwt.strategy.ts'),
      },
      {
        template: 'auth.service.hbs',
        target: path.join(authPath, 'auth.service.ts'),
      },
      {
        template: 'auth.module.hbs',
        target: path.join(authPath, 'auth.module.ts'),
      },
    ];

    for (const { template, target } of files) {
      await generateFromTemplate(template, target);
    }

    const envLines = [
      'JWT_ACCESS_SECRET=',
      'JWT_ACCESS_EXPIRATION=3600s',
    ];

    if (answers.refreshTokens) {
      envLines.push('JWT_REFRESH_SECRET=');
      envLines.push('JWT_REFRESH_EXPIRATION=7d');
    }

    if (answers.providers.includes('Google OAuth')) {
      envLines.push('GOOGLE_CLIENT_ID=');
      envLines.push('GOOGLE_CLIENT_SECRET=');
    }

    await fs.outputFile(path.join(cwd, '.env.example'), envLines.join('\n') + '\n');

    spinner.succeed(chalk.green('Auth structure generated successfully.'));

    console.log('\n' + chalk.bold('Generated files:'));
    for (const { target } of files) {
      console.log('  ' + chalk.cyan(path.relative(cwd, target)));
    }
    console.log('  ' + chalk.cyan('.env.example'));

    if (answers.providers.includes('Google OAuth')) {
      console.log(
        '\n' + chalk.yellow('→ Run `nest-auth add google` to generate Google OAuth files.'),
      );
    }

    console.log(
      '\n' + chalk.dim('Next: import AuthModule into your AppModule and configure @nestjs/config.'),
    );
  } catch (err) {
    spinner.fail(chalk.red('Failed to generate auth structure.'));
    throw err;
  }
}
