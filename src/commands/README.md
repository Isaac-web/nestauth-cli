# src/commands/

One module per CLI command. Each command is invoked by Commander from `src/index.ts`.

---

## `init` — [`init/`](init/README.md)

The primary command. Runs an interactive Inquirer prompt session, generates the full `src/auth/` folder from Handlebars templates, installs npm packages in the target project, and wires `AuthModule` into `app.module.ts` via ts-morph.

```bash
nestauth init
```

Split across five files — see [`init/README.md`](init/README.md).

---

## `add` — [`add/`](add/README.md)

Adds a single login provider to an existing auth structure. Generates the provider file and DTO, then wires them into `auth.module.ts`, `auth.service.ts`, and `auth.controller.ts`.

```bash
nestauth add email
nestauth add google
```

Uses a registry map so new providers require only one file and one line — see [`add/README.md`](add/README.md).

---

## `guard` — [`guard.ts`](guard.ts)

Generates a custom authorization guard, adds its `AuthType` enum member, and automatically wires it into `AuthenticationGuard` and `auth.module.ts`.

```bash
nestauth guard <name>
```

Prompts whether to include user extraction code (which requires `AuthType.Bearer` to run first in the guard map).
