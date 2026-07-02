import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { SyntaxKind, Scope } from 'ts-morph';
import { generateFromTemplate } from '../../../utils/generator';
import { installPackages } from '../../../utils/packages';
import { readCliConfig } from '../../../utils/config';
import { makeProject } from '../../../utils/project';

export async function addGoogle(cwd: string, authPath: string): Promise<void> {
  const providerFile = path.join(authPath, 'providers', 'google-auth.provider.ts');

  if (await fs.pathExists(providerFile)) {
    console.log(chalk.yellow('Google login has already been added.'));
    return;
  }

  const savedConfig = await readCliConfig(cwd);

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

    const envFilePath = savedConfig?.envFilePath ?? '.env';
    const envPath = path.join(cwd, envFilePath);
    const existing = (await fs.pathExists(envPath)) ? await fs.readFile(envPath, 'utf-8') : '';
    if (!existing.includes('GOOGLE_CLIENT_ID=')) {
      const prefix = existing.length > 0 && !existing.endsWith('\n\n') ? '\n' : '';
      await fs.appendFile(envPath, prefix + 'GOOGLE_CLIENT_ID=\n');
    }

    spinner.text = 'Installing packages...';
    await installPackages(cwd, ['google-auth-library'], []);

    spinner.text = 'Wiring Google provider...';
    await wireGoogleIntoModule(authPath);
    await wireGoogleIntoService(authPath);
    await wireGoogleIntoController(authPath);

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
  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === './dto/google-login.dto')) {
    sf.addImportDeclaration({ namedImports: ['GoogleLoginDto'], moduleSpecifier: './dto/google-login.dto' });
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

  if (!cls.getMethods().some(m => m.getName() === 'loginWithGoogle')) {
    cls.addMethod({
      isAsync: true,
      name: 'loginWithGoogle',
      parameters: [{ name: 'dto', type: 'GoogleLoginDto' }],
      statements: ['return this.googleAuthProvider.verifyIdToken(dto);'],
    });
  }

  await sf.save();
}

async function wireGoogleIntoController(authPath: string): Promise<void> {
  const filePath = path.join(authPath, 'auth.controller.ts');
  if (!(await fs.pathExists(filePath))) return;

  const project = makeProject();
  const sf = project.addSourceFileAtPath(filePath);

  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === './dto/google-login.dto')) {
    sf.addImportDeclaration({ namedImports: ['GoogleLoginDto'], moduleSpecifier: './dto/google-login.dto' });
  }

  const nestImport = sf.getImportDeclaration('@nestjs/common');
  if (nestImport) {
    const named = nestImport.getNamedImports().map(n => n.getName());
    if (!named.includes('Post')) nestImport.addNamedImport('Post');
    if (!named.includes('Body')) nestImport.addNamedImport('Body');
  }

  const cls = sf.getClass('AuthController');
  if (!cls) return;

  if (!cls.getMethods().some(m => m.getName() === 'google')) {
    cls.addMethod({
      decorators: [{ name: 'Post', arguments: ["'google'"] }],
      name: 'google',
      parameters: [{ decorators: [{ name: 'Body', arguments: [] }], name: 'googleLoginDto', type: 'GoogleLoginDto' }],
      statements: ['return this.authService.loginWithGoogle(googleLoginDto);'],
    });
  }

  await sf.save();
}
