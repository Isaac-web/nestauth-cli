import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { generateFromTemplate } from '../../utils/generator';
import { installPackages } from '../../utils/packages';
import { writeCliConfig } from '../../utils/config';
import { registerAuthModule, setupMainTsGlobalPipes } from './wiring';
import { buildPrompts } from './prompts';
import { buildFileList } from './files';
import { InitAnswers } from './types';

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();

  const appModulePath = path.join(cwd, 'src', 'app.module.ts');
  const configModuleAlreadySetUp =
    (await fs.pathExists(appModulePath)) &&
    (await fs.readFile(appModulePath, 'utf-8')).includes('ConfigModule');

  const mainTsPath = path.join(cwd, 'src', 'main.ts');
  const globalPipesAlreadySetUp =
    (await fs.pathExists(mainTsPath)) &&
    (await fs.readFile(mainTsPath, 'utf-8')).includes('useGlobalPipes');

  const answers = await inquirer.prompt<InitAnswers>(buildPrompts(configModuleAlreadySetUp, globalPipesAlreadySetUp) as any);

  const setupConfigModule = configModuleAlreadySetUp ? false : (answers.setupConfigModule ?? false);
  const includeEmail = answers.providers.includes('Email / Password');
  const includeGoogle = answers.providers.includes('Google');
  const includeRefreshToken = answers.refreshTokens;
  const generateEnvFile = answers.generateEnvFile !== false;
  const envFilePath = answers.envFilePath ?? '.env';
  const includeCurrentUserDecorator = answers.currentUserDecorator !== false;
  const setupGlobalPipes = globalPipesAlreadySetUp ? false : (answers.setupGlobalPipes ?? false);
  const useRouteLevelPipes = !globalPipesAlreadySetUp && !setupGlobalPipes;

  const spinner = ora('Generating auth structure...').start();

  try {
    const authPath = path.join(cwd, 'src', 'auth');
    const templateContext = { routePrefix: answers.routePrefix, includeEmail, includeGoogle, includeRefreshToken, useRouteLevelPipes };
    const allFiles = buildFileList(authPath, { includeEmail, includeGoogle, includeRefreshToken, includeCurrentUserDecorator });

    for (const { template, target } of allFiles) {
      await generateFromTemplate(template, target, templateContext);
    }

    await writeCliConfig(cwd, { routePrefix: answers.routePrefix, envFilePath });

    if (generateEnvFile) {
      const envLines = ['JWT_ACCESS_SECRET=', 'JWT_ACCESS_EXPIRATION=3600'];
      if (includeRefreshToken) envLines.push('JWT_REFRESH_SECRET=', 'JWT_REFRESH_EXPIRATION=604800');
      if (includeGoogle) envLines.push('GOOGLE_CLIENT_ID=');

      const envFsPath = path.join(cwd, envFilePath);
      const existing = (await fs.pathExists(envFsPath)) ? await fs.readFile(envFsPath, 'utf-8') : '';
      const newLines = envLines.filter((line) => {
        const key = line.split('=')[0];
        return key && !existing.includes(key + '=');
      });
      if (newLines.length > 0) {
        const prefix = existing.length > 0 && !existing.endsWith('\n\n') ? '\n' : '';
        await fs.appendFile(envFsPath, prefix + newLines.join('\n') + '\n');
      }
    }

    spinner.text = 'Installing packages...';
    const deps = ['@nestjs/jwt', '@nestjs/config', 'class-validator', 'class-transformer'];
    if (includeGoogle) deps.push('google-auth-library');
    await installPackages(cwd, deps, []);

    spinner.text = 'Updating AppModule...';
    const appModuleUpdated = await registerAuthModule(cwd, setupConfigModule);

    let mainTsUpdated = false;
    if (setupGlobalPipes) {
      spinner.text = 'Setting up global validation pipes...';
      mainTsUpdated = await setupMainTsGlobalPipes(cwd);
    }

    spinner.succeed(chalk.green('Auth structure generated successfully.'));

    console.log('\n' + chalk.bold('Created:'));
    for (const { target } of allFiles) {
      console.log('  ' + chalk.green(path.relative(cwd, target)));
    }
    if (generateEnvFile) console.log('  ' + chalk.green(envFilePath));

    const modifiedFiles: string[] = [];
    if (appModuleUpdated) modifiedFiles.push('src/app.module.ts');
    if (mainTsUpdated) modifiedFiles.push('src/main.ts');

    if (modifiedFiles.length > 0) {
      console.log('\n' + chalk.bold('Modified:'));
      for (const f of modifiedFiles) console.log('  ' + chalk.yellow(f));
    } else if (!appModuleUpdated) {
      console.log('\n' + chalk.yellow('→ Manually import AuthModule into your AppModule.'));
    }

    const envVars = ['JWT_ACCESS_SECRET', 'JWT_ACCESS_EXPIRATION'];
    if (includeRefreshToken) envVars.push('JWT_REFRESH_SECRET', 'JWT_REFRESH_EXPIRATION');
    if (includeGoogle) envVars.push('GOOGLE_CLIENT_ID');

    console.log('\n' + chalk.bold('Environment variables to set:'));
    for (const env of envVars) console.log('  ' + chalk.magenta(env));

    if (!setupConfigModule && !configModuleAlreadySetUp) {
      console.log('\n' + chalk.yellow('→ Make sure ConfigModule is configured in your AppModule so ConfigService is available.'));
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed to generate auth structure.'));
    throw err;
  }
}
