import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { Project, QuoteKind, IndentationText, SyntaxKind } from 'ts-morph';
import { generateFromTemplate } from '../utils/generator';
import { installPackages } from '../utils/packages';
import { writeCliConfig } from '../utils/config';

interface InitAnswers {
  providers: string[];
  routePrefix: string;
  refreshTokens: boolean;
  setupConfigModule?: boolean;
  generateEnvFile?: boolean;
  envFilePath?: string;
  currentUserDecorator?: boolean;
  setupGlobalPipes?: boolean;
}

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

  const answers = await inquirer.prompt<InitAnswers>([
    {
      type: 'checkbox',
      name: 'providers',
      message: 'Which sign-in methods do you need?',
      choices: ['Email / Password', 'Google'],
      default: ['Email / Password'],
      validate: (selected: string[]) =>
        selected.length > 0 || 'Select at least one sign-in method.',
    },
    {
      type: 'input',
      name: 'routePrefix',
      message: 'Auth route prefix?',
      default: 'auth',
    },
    {
      type: 'confirm',
      name: 'refreshTokens',
      message: 'Enable refresh tokens?',
      default: true,
    },
    ...(!configModuleAlreadySetUp
      ? [
          {
            type: 'confirm' as const,
            name: 'setupConfigModule',
            message: 'Set up ConfigModule.forRoot({ isGlobal: true }) in AppModule?',
            default: true,
          },
        ]
      : []),
    {
      type: 'confirm',
      name: 'generateEnvFile',
      message: 'Generate a .env file for secrets?',
      default: true,
    },
    {
      type: 'input',
      name: 'envFilePath',
      message: 'Path for env file?',
      default: '.env',
      when: (a) => (a as InitAnswers).generateEnvFile !== false,
    },
    {
      type: 'confirm',
      name: 'currentUserDecorator',
      message: 'Generate a @CurrentUser() decorator?',
      default: true,
    },
    ...(!globalPipesAlreadySetUp
      ? [
          {
            type: 'confirm' as const,
            name: 'setupGlobalPipes',
            message: 'Enable ValidationPipe globally in main.ts?',
            default: true,
          },
        ]
      : []),
  ]);

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
    const templateContext = {
      routePrefix: answers.routePrefix,
      includeEmail,
      includeGoogle,
      includeRefreshToken,
      useRouteLevelPipes,
    };

    const baseFiles: Array<{ template: string; target: string }> = [
      {
        template: 'auth.config.hbs',
        target: path.join(authPath, 'config', 'auth.config.ts'),
      },
      {
        template: 'auth-type.enum.hbs',
        target: path.join(authPath, 'enums', 'auth-type.enum.ts'),
      },
      {
        template: 'auth.decorator.hbs',
        target: path.join(authPath, 'decorators', 'auth.decorator.ts'),
      },
      ...(includeCurrentUserDecorator
        ? [
            {
              template: 'current-user.decorator.hbs',
              target: path.join(authPath, 'decorators', 'current-user.decorator.ts'),
            },
          ]
        : []),
      {
        template: 'jwt.guard.hbs',
        target: path.join(authPath, 'guards', 'jwt.guard.ts'),
      },
      {
        template: 'authentication.guard.hbs',
        target: path.join(authPath, 'guards', 'authentication.guard.ts'),
      },
      {
        template: 'token-payload.interface.hbs',
        target: path.join(authPath, 'interfaces', 'token-payload.interface.ts'),
      },
      {
        template: 'auth.module.hbs',
        target: path.join(authPath, 'auth.module.ts'),
      },
      {
        template: 'auth.controller.hbs',
        target: path.join(authPath, 'auth.controller.ts'),
      },
      {
        template: 'auth.service.hbs',
        target: path.join(authPath, 'auth.service.ts'),
      },
      {
        template: 'jwt-token.provider.hbs',
        target: path.join(authPath, 'providers', 'jwt-token.provider.ts'),
      },
    ];

    const emailFiles: Array<{ template: string; target: string }> = [
      {
        template: 'email-auth.provider.hbs',
        target: path.join(authPath, 'providers', 'email-auth.provider.ts'),
      },
      {
        template: 'email-password.dto.hbs',
        target: path.join(authPath, 'dto', 'email-password.dto.ts'),
      },
    ];

    const googleFiles: Array<{ template: string; target: string }> = [
      {
        template: 'google-auth.config.hbs',
        target: path.join(authPath, 'config', 'google-auth.config.ts'),
      },
      {
        template: 'google-auth.provider.hbs',
        target: path.join(authPath, 'providers', 'google-auth.provider.ts'),
      },
      {
        template: 'google-login.dto.hbs',
        target: path.join(authPath, 'dto', 'google-login.dto.ts'),
      },
    ];

    const refreshTokenFiles: Array<{ template: string; target: string }> = [
      {
        template: 'refresh-token.provider.hbs',
        target: path.join(authPath, 'providers', 'refresh-token.provider.ts'),
      },
      {
        template: 'refresh-token.dto.hbs',
        target: path.join(authPath, 'dto', 'refresh-token.dto.ts'),
      },
    ];

    const allFiles = [
      ...baseFiles,
      ...(includeEmail ? emailFiles : []),
      ...(includeGoogle ? googleFiles : []),
      ...(includeRefreshToken ? refreshTokenFiles : []),
    ];

    for (const { template, target } of allFiles) {
      await generateFromTemplate(template, target, templateContext);
    }

    await writeCliConfig(cwd, { routePrefix: answers.routePrefix, envFilePath });

    if (generateEnvFile) {
      const envLines = ['JWT_ACCESS_SECRET=', 'JWT_ACCESS_EXPIRATION=3600'];
      if (includeRefreshToken) {
        envLines.push('JWT_REFRESH_SECRET=');
        envLines.push('JWT_REFRESH_EXPIRATION=604800');
      }
      if (includeGoogle) {
        envLines.push('GOOGLE_CLIENT_ID=');
      }

      const envFsPath = path.join(cwd, envFilePath);
      const existing = (await fs.pathExists(envFsPath))
        ? await fs.readFile(envFsPath, 'utf-8')
        : '';
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
    if (generateEnvFile) {
      console.log('  ' + chalk.green(envFilePath));
    }

    const modifiedFiles: string[] = [];
    if (appModuleUpdated) modifiedFiles.push('src/app.module.ts');
    if (mainTsUpdated) modifiedFiles.push('src/main.ts');

    if (modifiedFiles.length > 0) {
      console.log('\n' + chalk.bold('Modified:'));
      for (const f of modifiedFiles) {
        console.log('  ' + chalk.yellow(f));
      }
    } else if (!appModuleUpdated) {
      console.log('\n' + chalk.yellow('→ Manually import AuthModule into your AppModule.'));
    }

    const envVars = ['JWT_ACCESS_SECRET', 'JWT_ACCESS_EXPIRATION'];
    if (includeRefreshToken) envVars.push('JWT_REFRESH_SECRET', 'JWT_REFRESH_EXPIRATION');
    if (includeGoogle) envVars.push('GOOGLE_CLIENT_ID');

    console.log('\n' + chalk.bold('Environment variables to set:'));
    for (const env of envVars) {
      console.log('  ' + chalk.magenta(env));
    }

    if (!setupConfigModule && !configModuleAlreadySetUp) {
      console.log(
        '\n' +
          chalk.yellow(
            '→ Make sure ConfigModule is configured in your AppModule so ConfigService is available.',
          ),
      );
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed to generate auth structure.'));
    throw err;
  }
}

async function setupMainTsGlobalPipes(cwd: string): Promise<boolean> {
  const mainTsPath = path.join(cwd, 'src', 'main.ts');
  if (!(await fs.pathExists(mainTsPath))) return false;

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
    },
  });

  const sf = project.addSourceFileAtPath(mainTsPath);

  const commonImport = sf.getImportDeclaration('@nestjs/common');
  if (commonImport) {
    const named = commonImport.getNamedImports().map((n) => n.getName());
    if (!named.includes('ValidationPipe')) {
      commonImport.addNamedImport('ValidationPipe');
    }
  } else {
    sf.addImportDeclaration({
      namedImports: ['ValidationPipe'],
      moduleSpecifier: '@nestjs/common',
    });
  }

  let inserted = false;
  for (const fn of sf.getFunctions()) {
    const body = fn.getBody();
    if (!body || body.getKind() !== SyntaxKind.Block) continue;
    const block = body.asKindOrThrow(SyntaxKind.Block);
    const stmts = block.getStatements();
    for (let i = 0; i < stmts.length; i++) {
      if (stmts[i].getText().includes('app.listen')) {
        block.insertStatements(
          i,
          'app.useGlobalPipes(new ValidationPipe({ whitelist: true }));',
        );
        inserted = true;
        break;
      }
    }
    if (inserted) break;
  }

  await sf.save();
  return inserted;
}

async function registerAuthModule(cwd: string, setupConfigModule: boolean): Promise<boolean> {
  const appModulePath = path.join(cwd, 'src', 'app.module.ts');
  if (!(await fs.pathExists(appModulePath))) return false;

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
    },
  });

  const sourceFile = project.addSourceFileAtPath(appModulePath);

  const hasAuthImportDecl = sourceFile
    .getImportDeclarations()
    .some((i) => i.getModuleSpecifierValue().includes('auth/auth.module'));

  if (!hasAuthImportDecl) {
    sourceFile.addImportDeclaration({
      namedImports: ['AuthModule'],
      moduleSpecifier: './auth/auth.module',
    });
  }

  let hasConfigImportDecl = false;
  if (setupConfigModule) {
    hasConfigImportDecl = sourceFile
      .getImportDeclarations()
      .some((i) => i.getModuleSpecifierValue() === '@nestjs/config');

    if (!hasConfigImportDecl) {
      sourceFile.addImportDeclaration({
        namedImports: ['ConfigModule'],
        moduleSpecifier: '@nestjs/config',
      });
    }
  }

  let addedToArray = false;

  for (const cls of sourceFile.getClasses()) {
    const decorator = cls.getDecorator('Module');
    if (!decorator) continue;

    const arg = decorator.getArguments()[0];
    if (!arg) continue;

    const objLiteral = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const importsProp = objLiteral.getProperty('imports');

    if (importsProp) {
      const arrayLiteral = importsProp
        .asKindOrThrow(SyntaxKind.PropertyAssignment)
        .getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);

      const elements = arrayLiteral.getElements().map((el) => el.getText().trim());

      if (!elements.some((el) => el === 'AuthModule')) {
        arrayLiteral.addElement('AuthModule');
        addedToArray = true;
      }

      if (setupConfigModule && !elements.some((el) => el.startsWith('ConfigModule'))) {
        arrayLiteral.insertElement(0, 'ConfigModule.forRoot({ isGlobal: true })');
        addedToArray = true;
      }
    } else {
      objLiteral.addPropertyAssignment({
        name: 'imports',
        initializer: setupConfigModule
          ? "[ConfigModule.forRoot({ isGlobal: true }), AuthModule]"
          : '[AuthModule]',
      });
      addedToArray = true;
    }

    break;
  }

  if (!hasAuthImportDecl || (setupConfigModule && !hasConfigImportDecl) || addedToArray) {
    await sourceFile.save();
    return true;
  }
  return false;
}
