import path from 'path';
import fs from 'fs-extra';
import { SyntaxKind } from 'ts-morph';
import { makeProject } from '../../utils/project';

export async function setupMainTsGlobalPipes(cwd: string): Promise<boolean> {
  const mainTsPath = path.join(cwd, 'src', 'main.ts');
  if (!(await fs.pathExists(mainTsPath))) return false;

  const sf = makeProject().addSourceFileAtPath(mainTsPath);

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
        block.insertStatements(i, 'app.useGlobalPipes(new ValidationPipe({ whitelist: true }));');
        inserted = true;
        break;
      }
    }
    if (inserted) break;
  }

  await sf.save();
  return inserted;
}

export async function registerAuthModule(cwd: string, setupConfigModule: boolean): Promise<boolean> {
  const appModulePath = path.join(cwd, 'src', 'app.module.ts');
  if (!(await fs.pathExists(appModulePath))) return false;

  const sourceFile = makeProject().addSourceFileAtPath(appModulePath);

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
