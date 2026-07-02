export interface InitAnswers {
  providers: string[];
  routePrefix: string;
  refreshTokens: boolean;
  setupConfigModule?: boolean;
  generateEnvFile?: boolean;
  envFilePath?: string;
  currentUserDecorator?: boolean;
  setupGlobalPipes?: boolean;
}
