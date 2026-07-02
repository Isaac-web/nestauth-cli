import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { SyntaxKind, Scope } from 'ts-morph';
import { generateFromTemplate } from '../../../utils/generator';
import { makeProject } from '../helpers';

export async function addEmail(cwd: string, authPath: string): Promise<void> {
  const providerFile = path.join(authPath, 'providers', 'email-auth.provider.ts');

  if (await fs.pathExists(providerFile)) {
    console.log(chalk.yellow('Email / Password login has already been added.'));
    return;
  }

  const spinner = ora('Adding Email / Password login...').start();

  try {
    const files = [
      {
        template: 'email-auth.provider.hbs',
        target: path.join(authPath, 'providers', 'email-auth.provider.ts'),
      },
      {
        template: 'email-password.dto.hbs',
        target: path.join(authPath, 'dto', 'email-password.dto.ts'),
      },
    ];

    for (const { template, target } of files) {
      await generateFromTemplate(template, target, {});
    }

    spinner.text = 'Wiring Email provider...';
    await wireEmailIntoModule(authPath);
    await wireEmailIntoService(authPath);
    await wireEmailIntoController(authPath);

    spinner.succeed(chalk.green('Email / Password login added.'));

    console.log('\n' + chalk.bold('Created:'));
    for (const { target } of files) {
      console.log('  ' + chalk.green(path.relative(cwd, target)));
    }

    console.log('\n' + chalk.bold('Modified:'));
    console.log('  ' + chalk.yellow('src/auth/auth.module.ts'));
    console.log('  ' + chalk.yellow('src/auth/auth.service.ts'));
    console.log('  ' + chalk.yellow('src/auth/auth.controller.ts'));

    console.log('\n' + chalk.dim('→ Add your credential validation logic in email-auth.provider.ts.'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to add Email / Password login.'));
    throw err;
  }
}

async function wireEmailIntoModule(authPath: string): Promise<void> {
  const filePath = path.join(authPath, 'auth.module.ts');
  if (!(await fs.pathExists(filePath))) return;

  const project = makeProject();
  const sf = project.addSourceFileAtPath(filePath);

  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === './providers/email-auth.provider')) {
    sf.addImportDeclaration({ namedImports: ['EmailAuthProvider'], moduleSpecifier: './providers/email-auth.provider' });
  }

  for (const cls of sf.getClasses()) {
    const decorator = cls.getDecorator('Module');
    if (!decorator) continue;

    const obj = decorator.getArguments()[0].asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const providersProp = obj.getProperty('providers');
    if (providersProp) {
      const arr = providersProp
        .asKindOrThrow(SyntaxKind.PropertyAssignment)
        .getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
      if (!arr.getElements().map(e => e.getText().trim()).includes('EmailAuthProvider')) {
        arr.addElement('EmailAuthProvider');
      }
    }

    break;
  }

  await sf.save();
}

async function wireEmailIntoService(authPath: string): Promise<void> {
  const filePath = path.join(authPath, 'auth.service.ts');
  if (!(await fs.pathExists(filePath))) return;

  const project = makeProject();
  const sf = project.addSourceFileAtPath(filePath);

  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === './providers/email-auth.provider')) {
    sf.addImportDeclaration({ namedImports: ['EmailAuthProvider'], moduleSpecifier: './providers/email-auth.provider' });
  }
  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === './dto/email-password.dto')) {
    sf.addImportDeclaration({ namedImports: ['EmailPasswordDto'], moduleSpecifier: './dto/email-password.dto' });
  }

  const cls = sf.getClass('AuthService');
  if (!cls) return;

  const ctor = cls.getConstructors()[0];
  if (ctor) {
    const params = ctor.getParameters().map(p => p.getName());
    if (!params.includes('emailAuthProvider')) {
      ctor.addParameter({
        decorators: [],
        name: 'emailAuthProvider',
        type: 'EmailAuthProvider',
        isReadonly: true,
        scope: Scope.Private,
      });
    }
  }

  if (!cls.getMethods().some(m => m.getName() === 'loginWithEmail')) {
    cls.addMethod({
      isAsync: true,
      name: 'loginWithEmail',
      parameters: [{ name: 'dto', type: 'EmailPasswordDto' }],
      statements: ['return this.emailAuthProvider.validate(dto);'],
    });
  }

  await sf.save();
}

async function wireEmailIntoController(authPath: string): Promise<void> {
  const filePath = path.join(authPath, 'auth.controller.ts');
  if (!(await fs.pathExists(filePath))) return;

  const project = makeProject();
  const sf = project.addSourceFileAtPath(filePath);

  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === './dto/email-password.dto')) {
    sf.addImportDeclaration({ namedImports: ['EmailPasswordDto'], moduleSpecifier: './dto/email-password.dto' });
  }

  const nestImport = sf.getImportDeclaration('@nestjs/common');
  if (nestImport) {
    const named = nestImport.getNamedImports().map(n => n.getName());
    if (!named.includes('Post')) nestImport.addNamedImport('Post');
    if (!named.includes('Body')) nestImport.addNamedImport('Body');
  }

  const cls = sf.getClass('AuthController');
  if (!cls) return;

  if (!cls.getMethods().some(m => m.getName() === 'login')) {
    cls.addMethod({
      decorators: [{ name: 'Post', arguments: ["'login'"] }],
      name: 'login',
      parameters: [{ decorators: [{ name: 'Body', arguments: [] }], name: 'emailPasswordDto', type: 'EmailPasswordDto' }],
      statements: ['return this.authService.loginWithEmail(emailPasswordDto);'],
    });
  }

  await sf.save();
}
