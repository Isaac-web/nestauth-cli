# src/utils/

Shared utilities used across commands.

| File | Exports | Purpose |
|---|---|---|
| [`config.ts`](config.ts) | `writeCliConfig`, `readCliConfig` | Reads and writes `.nestauth-cli.json` in the target project root (stores `routePrefix`, `envFilePath` for use by later commands) |
| [`generator.ts`](generator.ts) | `generateFromTemplate` | Compiles a `.hbs` template with a context object and writes the result to a target path, creating intermediate directories as needed |
| [`packages.ts`](packages.ts) | `installPackages` | Runs `npm install` with the given dependency lists inside the target project's directory |
| [`project.ts`](project.ts) | `makeProject` | Returns a configured ts-morph `Project` instance (2-space indent, single quotes) — shared by all commands that edit existing TypeScript files |
| [`strings.ts`](strings.ts) | `toPascal`, `toKebab`, `toCamel` | Name transformers used during code generation to derive class names, file names, and constructor parameter names from user input |

## String Transformers

```ts
toPascal('email-auth')   // → 'EmailAuth'
toKebab('EmailAuth')     // → 'email-auth'
toCamel('email-auth')    // → 'emailAuth'
```

`toCamel` is used to derive constructor parameter names from kebab-cased guard names when wiring guards into `AuthenticationGuard`.

## makeProject()

All ts-morph wiring functions call `makeProject()` rather than constructing `Project` directly. This ensures consistent formatting settings (indentation, quote style) across every file the CLI modifies.

```ts
import { makeProject } from '../../../utils/project';

const project = makeProject();
const sourceFile = project.addSourceFileAtPath(filePath);
// ... AST edits ...
await sourceFile.save();
```
