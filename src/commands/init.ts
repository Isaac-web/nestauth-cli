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
    {
      type: 'confirm',
      name: 'setupConfigModule',
      message: 'Set up ConfigModule.forRoot({ isGlobal: true }) in AppModule?',
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

    spinner.text = 'Installing packages...';
    await installPackages(
      cwd,
      ['@nestjs/jwt', '@nestjs/passport', '@nestjs/config', 'passport', 'passport-jwt'],
      ['@types/passport-jwt'],
    );

    const appModuleUpdated = await registerAuthModule(cwd, answers.setupConfigModule);

    spinner.succeed(chalk.green('Auth structure generated successfully.'));

    console.log('\n' + chalk.bold('Generated files:'));
    for (const { target } of files) {
      console.log('  ' + chalk.cyan(path.relative(cwd, target)));
    }
    console.log('  ' + chalk.cyan('.env.example'));

    if (appModuleUpdated) {
      console.log('  ' + chalk.cyan('src/app.module.ts') + chalk.dim(' (AuthModule registered)'));
    } else {
      console.log(
        '\n' + chalk.yellow('→ Manually import AuthModule into your AppModule.'),
      );
    }

    if (answers.providers.includes('Google OAuth')) {
      console.log(
        '\n' + chalk.yellow('→ Run `nest-auth add google` to generate Google OAuth files.'),
      );
    }

    if (!answers.setupConfigModule) {
      console.log(
        '\n' + chalk.yellow('→ Make sure ConfigModule is configured in your AppModule so ConfigService is available.'),
      );
    }

    console.log(
      '\n' + chalk.dim('Next: set your JWT secrets in .env (see .env.example).'),
    );
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
