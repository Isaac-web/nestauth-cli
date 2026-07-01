import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { Project, IndentationText, QuoteKind } from 'ts-morph';
import { generateFromTemplate } from '../utils/generator';

function toPascal(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function toKebab(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

export async function guardCommand(name: string): Promise<void> {
  const kebabName = toKebab(name);
  const pascalName = toPascal(name);
  const cwd = process.cwd();
  const authPath = path.join(cwd, 'src', 'auth');

  if (!(await fs.pathExists(authPath))) {
    console.error(
      chalk.red('Auth structure not found.') +
        ' Run ' +
        chalk.cyan('nest-auth init') +
        ' first.',
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
      chalk.red('AuthType enum not found.') +
        ' Run ' +
        chalk.cyan('nest-auth init') +
        ' first.',
    );
    process.exit(1);
  }

  const spinner = ora(`Generating ${pascalName}Guard...`).start();

  try {
    await generateFromTemplate('custom.guard.hbs', guardTarget, { pascalName, kebabName });

    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      manipulationSettings: {
        indentationText: IndentationText.TwoSpaces,
        quoteKind: QuoteKind.Single,
      },
    });
    const sourceFile = project.addSourceFileAtPath(enumFilePath);
    const enumDecl = sourceFile.getEnumOrThrow('AuthType');

    const alreadyHasMember = enumDecl
      .getMembers()
      .some((m) => m.getName() === pascalName);

    if (alreadyHasMember) {
      spinner.warn(
        chalk.yellow(
          `${pascalName}Guard generated, but AuthType.${pascalName} already exists — enum not modified.`,
        ),
      );
    } else {
      enumDecl.addMember({ name: pascalName, value: kebabName });
      await sourceFile.save();
      spinner.succeed(chalk.green(`${pascalName}Guard generated.`));
    }

    console.log('\n' + chalk.bold('Created:'));
    console.log('  ' + chalk.green(path.relative(cwd, guardTarget)));

    if (!alreadyHasMember) {
      console.log('\n' + chalk.bold('Modified:'));
      console.log('  ' + chalk.yellow(path.relative(cwd, enumFilePath)));
    }

    console.log('\n' + chalk.bold('Next steps:'));
    console.log(
      '  1. Register ' +
        chalk.cyan(`${pascalName}Guard`) +
        ' as a provider in your ' +
        chalk.cyan('AuthModule') +
        '.',
    );
    console.log(
      '  2. Add ' +
        chalk.cyan(`[AuthType.${pascalName}]: this.${kebabName.replace(/-./g, (m) => m[1].toUpperCase())}Guard`) +
        ' to ' +
        chalk.cyan('AuthenticationGuard.authTypeGuardMap') +
        '.',
    );
  } catch (err) {
    spinner.fail(chalk.red('Failed to generate guard.'));
    throw err;
  }
}
