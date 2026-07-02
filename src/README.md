# src/

CLI source code for `nest-auth-cli`.

| Folder / File | Purpose |
|---|---|
| [`index.ts`](index.ts) | CLI entry point — registers `init`, `add`, `guard` commands with Commander |
| [`commands/`](commands/README.md) | One module per CLI command |
| [`templates/`](templates/README.md) | Handlebars (`.hbs`) templates for every generated file |
| [`utils/`](utils/README.md) | Shared utilities: file generation, package install, ts-morph, string helpers |
