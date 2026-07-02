# src/commands/add/

The `nestauth add <provider>` command.

## Structure

```
add/
├── index.ts          — addCommand() + provider registry map
└── providers/
    ├── email.ts      — addEmail() + wireEmail* functions
    └── google.ts     — addGoogle() + wireGoogle* functions
```

## Registry Map Pattern

`index.ts` holds a simple map from provider name to handler:

```ts
const providers: Record<string, (cwd: string, authPath: string) => Promise<void>> = {
  email: addEmail,
  google: addGoogle,
};
```

`addCommand()` normalises the CLI argument to lowercase, looks up the handler, and delegates. Unknown providers print a clear error listing valid options.

## Adding a New Provider

1. Create `providers/<name>.ts` with an `add<Name>(cwd, authPath)` function that:
   - Generates the provider file and DTO from Handlebars templates
   - Wires them into `auth.module.ts`, `auth.service.ts`, and `auth.controller.ts` via ts-morph
2. Add one entry to the registry in `index.ts`:
   ```ts
   import { addFacebook } from './providers/facebook';
   const providers = { ..., facebook: addFacebook };
   ```

That's the only change needed outside the new file.

## What Each Provider Function Does

Each `add<Name>()` function performs these steps in order:

1. Check that `src/auth/` already exists (print error if not — user must run `nestauth init` first)
2. Generate the provider file via `generateFromTemplate()`
3. Generate the DTO file via `generateFromTemplate()`
4. Wire into `auth.module.ts` — import + add to providers array
5. Wire into `auth.service.ts` — inject provider into constructor, add delegate method
6. Wire into `auth.controller.ts` — add route handler with correct `@Auth()` and `@Body()` decorators
