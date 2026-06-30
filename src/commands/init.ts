import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { Project, QuoteKind, IndentationText, SyntaxKind } from 'ts-morph';
import { generateFromTemplate } from '../utils/generator';
import { installPackages } from '../utils/packages';

interface InitAnswers {
  providers: string[];
  refreshTokens: boolean;
  setupConfigModule: boolean;
}

export async function initCommand(): Promise<void> {
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
      type: 'confirm',
      name: 'refreshTokens',
      message: 'Enable refresh tokens?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'setupConfigModule',
      message: 'Set up ConfigModule.forRoot({ isGlobal: true }) in AppModule?',
      default: true,
    },
  ]);

  const includeEmail = answers.providers.includes('Email / Password');
  const includeGoogle = answers.providers.includes('Google');

  const spinner = ora('Generating auth structure...').start();

  try {
    const cwd = process.cwd();
    const authPath = path.join(cwd, 'src', 'auth');

    const baseFiles: Array<{ template: string; target: string }> = [
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
    ];

    const emailFiles: Array<{ template: string; target: string }> = [
      {
        template: 'email-auth.module.hbs',
        target: path.join(authPath, 'email', 'email-auth.module.ts'),
      },
      {
        template: 'email-auth.service.hbs',
        target: path.join(authPath, 'email', 'email-auth.service.ts'),
      },
      {
        template: 'email-auth.controller.hbs',
        target: path.join(authPath, 'email', 'email-auth.controller.ts'),
      },
      {
        template: 'login.dto.hbs',
        target: path.join(authPath, 'email', 'dto', 'login.dto.ts'),
      },
    ];

    const googleFiles: Array<{ template: string; target: string }> = [
      {
        template: 'google-auth.module.hbs',
        target: path.join(authPath, 'google', 'google-auth.module.ts'),
      },
      {
        template: 'google-auth.service.hbs',
        target: path.join(authPath, 'google', 'google-auth.service.ts'),
      },
      {
        template: 'google-auth.controller.hbs',
        target: path.join(authPath, 'google', 'google-auth.controller.ts'),
      },
      {
        template: 'google-login.dto.hbs',
        target: path.join(authPath, 'google', 'dto', 'google-login.dto.ts'),
      },
    ];

    const allFiles = [
      ...baseFiles,
      ...(includeEmail ? emailFiles : []),
      ...(includeGoogle ? googleFiles : []),
    ];

    for (const { template, target } of allFiles) {
      await generateFromTemplate(template, target);
    }

    const envLines = ['JWT_ACCESS_SECRET=', 'JWT_ACCESS_EXPIRATION=3600'];
    if (answers.refreshTokens) {
      envLines.push('JWT_REFRESH_SECRET=');
      envLines.push('JWT_REFRESH_EXPIRATION=604800');
    }
    if (includeGoogle) {
      envLines.push('GOOGLE_CLIENT_ID=');
    }
    await fs.outputFile(path.join(cwd, '.env.example'), envLines.join('\n') + '\n');

    spinner.text = 'Installing packages...';
    const deps = ['@nestjs/jwt', '@nestjs/config', 'class-validator', 'class-transformer'];
    if (includeGoogle) deps.push('google-auth-library');
    await installPackages(cwd, deps, []);

    spinner.text = 'Updating AppModule...';
    const appModuleUpdated = await registerAuthModule(cwd, answers.setupConfigModule);

    spinner.text = 'Registering submodules...';
    if (includeEmail) {
      await registerSubmoduleInAuthModule(authPath, 'EmailAuthModule', './email/email-auth.module');
    }
    if (includeGoogle) {
      await registerSubmoduleInAuthModule(authPath, 'GoogleAuthModule', './google/google-auth.module');
    }

    spinner.succeed(chalk.green('Auth structure generated successfully.'));

    console.log('\n' + chalk.bold('Generated files:'));
    for (const { target } of allFiles) {
      console.log('  ' + chalk.cyan(path.relative(cwd, target)));
    }
    console.log('  ' + chalk.cyan('.env.example'));

    if (appModuleUpdated) {
      console.log('  ' + chalk.cyan('src/app.module.ts') + chalk.dim(' (AuthModule registered)'));
    } else {
      console.log('\n' + chalk.yellow('→ Manually import AuthModule into your AppModule.'));
    }

    if (!answers.setupConfigModule) {
      console.log(
        '\n' +
          chalk.yellow(
            '→ Make sure ConfigModule is configured in your AppModule so ConfigService is available.',
          ),
      );
    }

    console.log(
      '\n' +
        chalk.yellow('→ Enable validation in your main.ts:') +
        '\n  ' +
        chalk.cyan('app.useGlobalPipes(new ValidationPipe({ whitelist: true }));'),
    );

    console.log('\n' + chalk.dim('Next: fill in your secrets in .env (see .env.example).'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to generate auth structure.'));
    throw err;
  }
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

async function registerSubmoduleInAuthModule(
  authPath: string,
  moduleName: string,
  moduleSpecifier: string,
): Promise<void> {
  const authModulePath = path.join(authPath, 'auth.module.ts');
  if (!(await fs.pathExists(authModulePath))) return;

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
    },
  });

  const sourceFile = project.addSourceFileAtPath(authModulePath);

  const hasImportDecl = sourceFile
    .getImportDeclarations()
    .some((i) => i.getModuleSpecifierValue() === moduleSpecifier);

  if (!hasImportDecl) {
    sourceFile.addImportDeclaration({ namedImports: [moduleName], moduleSpecifier });
  }

  for (const cls of sourceFile.getClasses()) {
    const decorator = cls.getDecorator('Module');
    if (!decorator) continue;

    const arg = decorator.getArguments()[0];
    if (!arg) continue;

    const objLiteral = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const importsProp = objLiteral.getProperty('imports');
    if (!importsProp) continue;

    const arrayLiteral = importsProp
      .asKindOrThrow(SyntaxKind.PropertyAssignment)
      .getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);

    const elements = arrayLiteral.getElements().map((el) => el.getText().trim());
    if (!elements.some((el) => el === moduleName)) {
      arrayLiteral.addElement(moduleName);
    }

    break;
  }

  await sourceFile.save();
}
