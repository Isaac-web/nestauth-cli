import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { Project, QuoteKind, IndentationText, SyntaxKind } from 'ts-morph';
import { generateFromTemplate } from '../utils/generator';
import { installPackages } from '../utils/packages';

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
      chalk.red('Auth structure not found.') + ' Run ' + chalk.cyan('nest-auth init') + ' first.',
    );
    process.exit(1);
  }

  if (normalized === 'google') {
    await addGoogle(cwd, authPath);
  }
}

async function addGoogle(cwd: string, authPath: string): Promise<void> {
  const googlePath = path.join(authPath, 'google');

  if (await fs.pathExists(googlePath)) {
    console.log(chalk.yellow('Google login has already been added.'));
    return;
  }

  const spinner = ora('Adding Google login...').start();

  try {
    const files = [
      {
        template: 'google-auth.module.hbs',
        target: path.join(googlePath, 'google-auth.module.ts'),
      },
      {
        template: 'google-auth.service.hbs',
        target: path.join(googlePath, 'google-auth.service.ts'),
      },
      {
        template: 'google-auth.controller.hbs',
        target: path.join(googlePath, 'google-auth.controller.ts'),
      },
    ];

    for (const { template, target } of files) {
      await generateFromTemplate(template, target);
    }

    const envPath = path.join(cwd, '.env.example');
    const existing = (await fs.pathExists(envPath)) ? await fs.readFile(envPath, 'utf-8') : '';
    if (!existing.includes('GOOGLE_CLIENT_ID')) {
      await fs.appendFile(envPath, '\nGOOGLE_CLIENT_ID=\n');
    }

    spinner.text = 'Installing packages...';
    await installPackages(cwd, ['google-auth-library'], []);

    spinner.text = 'Registering GoogleAuthModule...';
    await registerGoogleModule(authPath);

    spinner.succeed(chalk.green('Google login added.'));

    console.log('\n' + chalk.bold('Generated files:'));
    for (const { target } of files) {
      console.log('  ' + chalk.cyan(path.relative(cwd, target)));
    }
    console.log('  ' + chalk.cyan('src/auth/auth.module.ts') + chalk.dim(' (GoogleAuthModule registered)'));

    console.log('\n' + chalk.bold('Next steps:'));
    console.log(
      '  1. Add ' +
        chalk.cyan('GOOGLE_CLIENT_ID') +
        ' to your ' +
        chalk.cyan('.env') +
        ' file.',
    );
    console.log(
      '  2. In ' +
        chalk.cyan('google-auth.service.ts') +
        ', add your user find-or-create logic after token verification.',
    );
  } catch (err) {
    spinner.fail(chalk.red('Failed to add Google login.'));
    throw err;
  }
}

async function registerGoogleModule(authPath: string): Promise<void> {
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
    .some((i) => i.getModuleSpecifierValue().includes('google/google-auth.module'));

  if (!hasImportDecl) {
    sourceFile.addImportDeclaration({
      namedImports: ['GoogleAuthModule'],
      moduleSpecifier: './google/google-auth.module',
    });
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
    if (!elements.some((el) => el === 'GoogleAuthModule')) {
      arrayLiteral.addElement('GoogleAuthModule');
    }

    break;
  }

  await sourceFile.save();
}
