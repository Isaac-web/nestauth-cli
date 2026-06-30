#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { addCommand } from './commands/add';
import { guardCommand } from './commands/guard';

const program = new Command();

program
  .name('nest-auth')
  .description('NestJS authentication generator CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Generate NestJS auth structure in the current project')
  .action(initCommand);

program
  .command('add <provider>')
  .description('Add an authentication provider (e.g. google)')
  .action(addCommand);

program
  .command('guard <name>')
  .description('Generate a custom auth guard (e.g. admin)')
  .action(guardCommand);

program.parse();
