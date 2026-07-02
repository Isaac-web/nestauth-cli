import path from 'path';

interface FileEntry {
  template: string;
  target: string;
}

interface FileListOptions {
  includeEmail: boolean;
  includeGoogle: boolean;
  includeRefreshToken: boolean;
  includeCurrentUserDecorator: boolean;
}

export function buildFileList(authPath: string, opts: FileListOptions): FileEntry[] {
  const { includeEmail, includeGoogle, includeRefreshToken, includeCurrentUserDecorator } = opts;

  const base: FileEntry[] = [
    { template: 'auth.config.hbs', target: path.join(authPath, 'config', 'auth.config.ts') },
    { template: 'auth-type.enum.hbs', target: path.join(authPath, 'enums', 'auth-type.enum.ts') },
    { template: 'auth.decorator.hbs', target: path.join(authPath, 'decorators', 'auth.decorator.ts') },
    ...(includeCurrentUserDecorator
      ? [{ template: 'current-user.decorator.hbs', target: path.join(authPath, 'decorators', 'current-user.decorator.ts') }]
      : []),
    { template: 'access-token.guard.hbs', target: path.join(authPath, 'guards', 'access-token.guard.ts') },
    { template: 'authentication.guard.hbs', target: path.join(authPath, 'guards', 'authentication.guard.ts') },
    { template: 'token-payload.interface.hbs', target: path.join(authPath, 'interfaces', 'token-payload.interface.ts') },
    { template: 'auth.module.hbs', target: path.join(authPath, 'auth.module.ts') },
    { template: 'auth.controller.hbs', target: path.join(authPath, 'auth.controller.ts') },
    { template: 'auth.service.hbs', target: path.join(authPath, 'auth.service.ts') },
    { template: 'jwt-token.provider.hbs', target: path.join(authPath, 'providers', 'jwt-token.provider.ts') },
  ];

  const email: FileEntry[] = [
    { template: 'email-auth.provider.hbs', target: path.join(authPath, 'providers', 'email-auth.provider.ts') },
    { template: 'email-password.dto.hbs', target: path.join(authPath, 'dto', 'email-password.dto.ts') },
  ];

  const google: FileEntry[] = [
    { template: 'google-auth.config.hbs', target: path.join(authPath, 'config', 'google-auth.config.ts') },
    { template: 'google-auth.provider.hbs', target: path.join(authPath, 'providers', 'google-auth.provider.ts') },
    { template: 'google-login.dto.hbs', target: path.join(authPath, 'dto', 'google-login.dto.ts') },
  ];

  const refreshToken: FileEntry[] = [
    { template: 'refresh-token.provider.hbs', target: path.join(authPath, 'providers', 'refresh-token.provider.ts') },
    { template: 'refresh-token.dto.hbs', target: path.join(authPath, 'dto', 'refresh-token.dto.ts') },
  ];

  return [
    ...base,
    ...(includeEmail ? email : []),
    ...(includeGoogle ? google : []),
    ...(includeRefreshToken ? refreshToken : []),
  ];
}
