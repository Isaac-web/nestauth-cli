# src/templates/

Handlebars (`.hbs`) templates. Each template corresponds to one file generated in the target NestJS project.

## Template Index

| Template | Generated File | Command |
|---|---|---|
| `auth.module.hbs` | `src/auth/auth.module.ts` | `init` |
| `auth.controller.hbs` | `src/auth/auth.controller.ts` | `init` |
| `auth.service.hbs` | `src/auth/auth.service.ts` | `init` |
| `auth.config.hbs` | `src/auth/config/auth.config.ts` | `init` |
| `auth-type.enum.hbs` | `src/auth/enums/auth-type.enum.ts` | `init` |
| `auth.decorator.hbs` | `src/auth/decorators/auth.decorator.ts` | `init` |
| `current-user.decorator.hbs` | `src/auth/decorators/current-user.decorator.ts` | `init` (optional) |
| `access-token.guard.hbs` | `src/auth/guards/access-token.guard.ts` | `init` |
| `authentication.guard.hbs` | `src/auth/guards/authentication.guard.ts` | `init` |
| `token-payload.interface.hbs` | `src/auth/interfaces/token-payload.interface.ts` | `init` |
| `jwt-token.provider.hbs` | `src/auth/providers/jwt-token.provider.ts` | `init` |
| `email-auth.provider.hbs` | `src/auth/providers/email-auth.provider.ts` | `init` / `add email` |
| `email-password.dto.hbs` | `src/auth/dto/email-password.dto.ts` | `init` / `add email` |
| `google-auth.config.hbs` | `src/auth/config/google-auth.config.ts` | `init` / `add google` |
| `google-auth.provider.hbs` | `src/auth/providers/google-auth.provider.ts` | `init` / `add google` |
| `google-login.dto.hbs` | `src/auth/dto/google-login.dto.ts` | `init` / `add google` |
| `refresh-token.provider.hbs` | `src/auth/providers/refresh-token.provider.ts` | `init` (optional) |
| `refresh-token.dto.hbs` | `src/auth/dto/refresh-token.dto.ts` | `init` (optional) |
| `custom.guard.hbs` | `src/auth/guards/<name>.guard.ts` | `guard` |

## Template Context

Templates receive a context object from the calling command. Common fields:

| Variable | Type | Description |
|---|---|---|
| `routePrefix` | `string` | Auth route prefix, e.g. `auth` |
| `includeEmail` | `boolean` | Whether email/password login is included |
| `includeGoogle` | `boolean` | Whether Google login is included |
| `includeRefreshToken` | `boolean` | Whether refresh token support is included |
| `useRouteLevelPipes` | `boolean` | Add `@UsePipes(ValidationPipe)` per route instead of global |
| `guardName` | `string` (guard only) | PascalCase guard class name |
| `includeUserExtraction` | `boolean` (guard only) | Include real user extraction code |

## Handlebars Notes

- **Standalone tags**: A `{{#if}}` / `{{else}}` / `{{/if}}` block that occupies its own line consumes the entire line including the newline character, producing clean output with no extra blank lines.
- **Conditional methods**: Use `{{#if includeEmail}}...{{/if}}` blocks to include or exclude methods and constructor parameters depending on what the user selected during `init`.
- Templates are loaded at runtime from `dist/templates/` (copied there by the build script — they are not compiled by `tsc`).
