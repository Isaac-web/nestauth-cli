import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { SyntaxKind, Scope } from 'ts-morph';
import { generateFromTemplate } from '../utils/generator';
import { makeProject } from '../utils/project';
import { toPascal, toKebab, toCamel } from '../utils/strings';

export async function guardCommand(name: string): Promise<void> {
  const kebabName = toKebab(name);
  const pascalName = toPascal(name);
  const camelName = toCamel(kebabName);
  const cwd = process.cwd();
  const authPath = path.join(cwd, 'src', 'auth');

  if (!(await fs.pathExists(authPath))) {
    console.error(
      chalk.red('Auth structure not found.') + ' Run ' + chalk.cyan('nestauth init') + ' first.',
    );
    process.exit(1);
  }

  const guardTarget = path.join(authPath, 'guards', `${kebabName}.guard.ts`);
  if (await fs.pathExists(guardTarget)) {
    console.error(chalk.red(`Guard "${kebabName}.guard.ts" already exists.`));
    process.exit(1);
  }

  const enumFilePath = path.join(authPath, 'enums', 'auth-type.enum.ts');
  if (!(await fs.pathExists(enumFilePath))) {
    console.error(
      chalk.red('AuthType enum not found.') + ' Run ' + chalk.cyan('nestauth init') + ' first.',
    );
    process.exit(1);
  }

  const { includeUserExtraction } = await inquirer.prompt<{ includeUserExtraction: boolean }>([
    {
      type: 'confirm',
      name: 'includeUserExtraction',
      message: 'Include user extraction setup? (requires AuthType.Bearer to run first)',
      default: false,
    },
  ]);

  const spinner = ora(`Generating ${pascalName}Guard...`).start();

  try {
    await generateFromTemplate('custom.guard.hbs', guardTarget, { pascalName, kebabName, includeUserExtraction });

    const project = makeProject();
    const sourceFile = project.addSourceFileAtPath(enumFilePath);
    const enumDecl = sourceFile.getEnumOrThrow('AuthType');

    const alreadyHasMember = enumDecl.getMembers().some((m) => m.getName() === pascalName);

    if (alreadyHasMember) {
      spinner.warn(
        chalk.yellow(
          `${pascalName}Guard generated, but AuthType.${pascalName} already exists — enum not modified.`,
        ),
      );
    } else {
      enumDecl.addMember({ name: pascalName, value: kebabName });
      await sourceFile.save();
    }

    const authGuardUpdated = await wireGuardIntoAuthentication(authPath, pascalName, kebabName, camelName);
    const moduleUpdated = await wireGuardIntoModule(authPath, pascalName, kebabName);

    spinner.succeed(chalk.green(`${pascalName}Guard generated.`));

    console.log('\n' + chalk.bold('Created:'));
    console.log('  ' + chalk.green(path.relative(cwd, guardTarget)));

    const modifiedFiles: string[] = [];
    if (!alreadyHasMember) modifiedFiles.push(path.relative(cwd, enumFilePath));
    if (authGuardUpdated) modifiedFiles.push('src/auth/guards/authentication.guard.ts');
    if (moduleUpdated) modifiedFiles.push('src/auth/auth.module.ts');

    if (modifiedFiles.length > 0) {
      console.log('\n' + chalk.bold('Modified:'));
      for (const f of modifiedFiles) console.log('  ' + chalk.yellow(f));
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed to generate guard.'));
    throw err;
  }
}

async function wireGuardIntoAuthentication(
  authPath: string,
  pascalName: string,
  kebabName: string,
  camelName: string,
): Promise<boolean> {
  const filePath = path.join(authPath, 'guards', 'authentication.guard.ts');
  if (!(await fs.pathExists(filePath))) return false;

  const project = makeProject();
  const sf = project.addSourceFileAtPath(filePath);

  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === `./${kebabName}.guard`)) {
    sf.addImportDeclaration({ namedImports: [`${pascalName}Guard`], moduleSpecifier: `./${kebabName}.guard` });
  }

  const cls = sf.getClass('AuthenticationGuard');
  if (!cls) return false;

  const ctor = cls.getConstructors()[0];
  if (ctor) {
    const params = ctor.getParameters().map(p => p.getName());
    if (!params.includes(`${camelName}Guard`)) {
      ctor.addParameter({
        decorators: [],
        name: `${camelName}Guard`,
        type: `${pascalName}Guard`,
        isReadonly: true,
        scope: Scope.Private,
      });
    }

    const stmts = ctor.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block).getStatements();
    for (const stmt of stmts) {
      if (stmt.getKind() !== SyntaxKind.ExpressionStatement) continue;
      const expr = stmt.asKindOrThrow(SyntaxKind.ExpressionStatement).getExpression();
      if (expr.getKind() !== SyntaxKind.BinaryExpression) continue;
      const binary = expr.asKindOrThrow(SyntaxKind.BinaryExpression);
      if (!binary.getLeft().getText().includes('authTypeGuardMap')) continue;
      const obj = binary.getRight().asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      const alreadyHasEntry = obj.getProperties().some(p => p.getText().includes(`AuthType.${pascalName}`));
      if (!alreadyHasEntry) {
        obj.addPropertyAssignment({ name: `[AuthType.${pascalName}]`, initializer: `this.${camelName}Guard` });
      }
      break;
    }
  }

  await sf.save();
  return true;
}

async function wireGuardIntoModule(
  authPath: string,
  pascalName: string,
  kebabName: string,
): Promise<boolean> {
  const filePath = path.join(authPath, 'auth.module.ts');
  if (!(await fs.pathExists(filePath))) return false;

  const project = makeProject();
  const sf = project.addSourceFileAtPath(filePath);

  if (!sf.getImportDeclarations().some(i => i.getModuleSpecifierValue() === `./guards/${kebabName}.guard`)) {
    sf.addImportDeclaration({ namedImports: [`${pascalName}Guard`], moduleSpecifier: `./guards/${kebabName}.guard` });
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
      if (!arr.getElements().map(e => e.getText().trim()).includes(`${pascalName}Guard`)) {
        arr.addElement(`${pascalName}Guard`);
      }
    }
    break;
  }

  await sf.save();
  return true;
}
