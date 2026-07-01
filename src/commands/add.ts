import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { Project, QuoteKind, IndentationText, SyntaxKind, Scope } from 'ts-morph';
import inquirer from 'inquirer';
import { generateFromTemplate } from '../utils/generator';
import { installPackages } from '../utils/packages';
import { readCliConfig } from '../utils/config';

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
      chalk.red('Auth structure not found.') + ' Run ' + chalk.cyan('nestauth init') + ' first.',
    );
    process.exit(1);
  }

  if (normalized === 'google') {
    await addGoogle(cwd, authPath);
  }
}

async function addGoogle(cwd: string, authPath: string): Promise<void> {
  const providerFile = path.join(authPath, 'providers', 'google-auth.provider.ts');

  if (await fs.pathExists(providerFile)) {
    console.log(chalk.yellow('Google login has already been added.'));
    return;
  }

  const savedConfig = await readCliConfig(cwd);
  const routePrefix = savedConfig?.routePrefix ?? (
    await inquirer.prompt<{ routePrefix: string }>([
      { type: 'input', name: 'routePrefix', message: 'Auth route prefix?', default: 'auth' },
    ])
  ).routePrefix;

  const spinner = ora('Adding Google login...').start();

  try {
    const files = [
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

    for (const { template, target } of files) {
      await generateFromTemplate(template, target, {});
    }

    const envPath = path.join(cwd, '.env.example');
    const existing = (await fs.pathExists(envPath)) ? await fs.readFile(envPath, 'utf-8') : '';
    if (!existing.includes('GOOGLE_CLIENT_ID')) {
      await fs.appendFile(envPath, '\nGOOGLE_CLIENT_ID=\n');
    }

    spinner.text = 'Installing packages...';
    await installPackages(cwd, ['google-auth-library'], []);

    spinner.text = 'Wiring Google provider...';
    await wireGoogleIntoModule(authPath);
    await wireGoogleIntoService(authPath);
    await wireGoogleIntoController(authPath, routePrefix);

    spinner.succeed(chalk.green('Google login added.'));

    console.log('\n' + chalk.bold('Created:'));
    for (const { target } of files) {
      console.log('  ' + chalk.green(path.relative(cwd, target)));
    }

    console.log('\n' + chalk.bold('Modified:'));
    console.log('  ' + chalk.yellow('src/auth/auth.module.ts'));
    console.log('  ' + chalk.yellow('src/auth/auth.service.ts'));
    console.log('  ' + chalk.yellow('src/auth/auth.controller.ts'));

    console.log('\n' + chalk.bold('Environment variables to set:'));
    console.log('  ' + chalk.magenta('GOOGLE_CLIENT_ID'));

    console.log('\n' + chalk.dim('→ Add your user find-or-create logic in google-auth.provider.ts after token verification.'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to add Google login.'));
    throw err;
  }
}

function makeProject() {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
    },
  });
}

async function wireGoogleIntoModule(authPath: string): Promise<void> {
  const filePath = path.join(authPath, 'auth.module.ts');
  if (!(await fs.pathExists(filePath))) return;

  const project = makeProject();
  const sf = project.addSourceFileAtPath(filePath);

  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === './config/google-auth.config')) {
    sf.addImportDeclaration({ namedImports: ['googleAuthConfig'], moduleSpecifier: './config/google-auth.config' });
  }
  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === './providers/google-auth.provider')) {
    sf.addImportDeclaration({ namedImports: ['GoogleAuthProvider'], moduleSpecifier: './providers/google-auth.provider' });
  }

  for (const cls of sf.getClasses()) {
    const decorator = cls.getDecorator('Module');
    if (!decorator) continue;

    const obj = decorator.getArguments()[0].asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

    // Add ConfigModule.forFeature(googleAuthConfig) to imports
    const importsProp = obj.getProperty('imports');
    if (importsProp) {
      const arr = importsProp
        .asKindOrThrow(SyntaxKind.PropertyAssignment)
        .getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
      const elements = arr.getElements().map(e => e.getText().trim());
      if (!elements.some(e => e.includes('googleAuthConfig'))) {
        arr.insertElement(0, 'ConfigModule.forFeature(googleAuthConfig)');
      }
    }

    // Add GoogleAuthProvider to providers
    const providersProp = obj.getProperty('providers');
    if (providersProp) {
      const arr = providersProp
        .asKindOrThrow(SyntaxKind.PropertyAssignment)
        .getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
      const elements = arr.getElements().map(e => e.getText().trim());
      if (!elements.includes('GoogleAuthProvider')) {
        arr.addElement('GoogleAuthProvider');
      }
    }

    break;
  }

  await sf.save();
}

async function wireGoogleIntoService(authPath: string): Promise<void> {
  const filePath = path.join(authPath, 'auth.service.ts');
  if (!(await fs.pathExists(filePath))) return;

  const project = makeProject();
  const sf = project.addSourceFileAtPath(filePath);

  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === './providers/google-auth.provider')) {
    sf.addImportDeclaration({ namedImports: ['GoogleAuthProvider'], moduleSpecifier: './providers/google-auth.provider' });
  }

  const cls = sf.getClass('AuthService');
  if (!cls) return;

  const ctor = cls.getConstructors()[0];
  if (ctor) {
    const params = ctor.getParameters().map(p => p.getName());
    if (!params.includes('googleAuthProvider')) {
      ctor.addParameter({
        decorators: [],
        name: 'googleAuthProvider',
        type: 'GoogleAuthProvider',
        isReadonly: true,
        scope: Scope.Private,
      });
    }
  }

  const hasMethod = cls.getMethods().some(m => m.getName() === 'loginWithGoogle');
  if (!hasMethod) {
    cls.addMethod({
      isAsync: true,
      name: 'loginWithGoogle',
      parameters: [{ name: 'idToken', type: 'string' }],
      statements: [
        'const payload = await this.googleAuthProvider.verifyIdToken(idToken);',
        'return this.generateTokens(payload);',
      ],
    });
  }

  await sf.save();
}

async function wireGoogleIntoController(authPath: string, routePrefix: string): Promise<void> {
  const filePath = path.join(authPath, 'auth.controller.ts');
  if (!(await fs.pathExists(filePath))) return;

  const project = makeProject();
  const sf = project.addSourceFileAtPath(filePath);

  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === './dto/google-login.dto')) {
    sf.addImportDeclaration({ namedImports: ['GoogleLoginDto'], moduleSpecifier: './dto/google-login.dto' });
  }

  // Ensure Post is imported
  const nestImport = sf.getImportDeclaration('@nestjs/common');
  if (nestImport) {
    const named = nestImport.getNamedImports().map(n => n.getName());
    if (!named.includes('Post')) nestImport.addNamedImport('Post');
    if (!named.includes('Body')) nestImport.addNamedImport('Body');
  }

  const cls = sf.getClass('AuthController');
  if (!cls) return;

  const hasMethod = cls.getMethods().some(m => m.getName() === 'google');
  if (!hasMethod) {
    cls.addMethod({
      decorators: [{ name: 'Post', arguments: ["'google'"] }],
      name: 'google',
      parameters: [{ decorators: [{ name: 'Body' }], name: 'googleLoginDto', type: 'GoogleLoginDto' }],
      statements: ['return this.authService.loginWithGoogle(googleLoginDto.idToken);'],
    });
  }

  await sf.save();
}
