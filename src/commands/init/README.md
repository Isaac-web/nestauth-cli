# src/commands/init/

The `nestauth init` command, split into focused modules.

| File | Role |
|---|---|
| [`index.ts`](index.ts) | `initCommand()` — top-level orchestration: reads answers, generates files, installs packages, calls wiring |
| [`prompts.ts`](prompts.ts) | `buildPrompts(configModuleAlreadySetUp, globalPipesAlreadySetUp)` — returns the Inquirer question array |
| [`files.ts`](files.ts) | `buildFileList(authPath, opts)` — returns the ordered list of `{ template, target }` pairs to generate |
| [`types.ts`](types.ts) | `InitAnswers` — TypeScript interface for the Inquirer answer object |
| [`wiring.ts`](wiring.ts) | `registerAuthModule(cwd, setupConfigModule)` and `setupMainTsGlobalPipes(cwd)` — ts-morph AST edits on the target project |

---

## Flow

```
initCommand()
  │
  ├── buildPrompts()         → Inquirer questions (skips already-configured options)
  ├── buildFileList()        → [ { template, target }, ... ]
  │
  ├── generateFromTemplate() → write each file (utils/generator)
  ├── installPackages()      → npm install in target project (utils/packages)
  │
  ├── registerAuthModule()   → ts-morph: import + register AuthModule in app.module.ts
  └── setupMainTsGlobalPipes() → ts-morph: inject ValidationPipe in main.ts (optional)
```

## Adding a New Prompt

1. Add the field to `InitAnswers` in `types.ts`
2. Add the Inquirer question object to the array returned by `buildPrompts()` in `prompts.ts`
3. Read the answer in `initCommand()` in `index.ts` and pass it to `buildFileList()` or the template context as needed
