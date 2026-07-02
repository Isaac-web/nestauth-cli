import { InitAnswers } from './types';

export function buildPrompts(
  configModuleAlreadySetUp: boolean,
  globalPipesAlreadySetUp: boolean,
) {
  return [
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
      type: 'input',
      name: 'routePrefix',
      message: 'Auth route prefix?',
      default: 'auth',
    },
    {
      type: 'confirm',
      name: 'refreshTokens',
      message: 'Enable refresh tokens?',
      default: true,
    },
    ...(!configModuleAlreadySetUp
      ? [
          {
            type: 'confirm' as const,
            name: 'setupConfigModule' as const,
            message: 'Set up ConfigModule.forRoot({ isGlobal: true }) in AppModule?',
            default: true,
          },
        ]
      : []),
    {
      type: 'confirm',
      name: 'generateEnvFile',
      message: 'Generate a .env file for secrets?',
      default: true,
    },
    {
      type: 'input',
      name: 'envFilePath',
      message: 'Path for env file?',
      default: '.env',
      when: (a: InitAnswers) => a.generateEnvFile !== false,
    },
    {
      type: 'confirm',
      name: 'currentUserDecorator',
      message: 'Generate a @CurrentUser() decorator?',
      default: true,
    },
    ...(!globalPipesAlreadySetUp
      ? [
          {
            type: 'confirm' as const,
            name: 'setupGlobalPipes' as const,
            message: 'Enable ValidationPipe globally in main.ts?',
            default: true,
          },
        ]
      : []),
  ];
}
