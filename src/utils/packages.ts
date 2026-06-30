import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';

type PackageManager = 'npm' | 'yarn' | 'pnpm';

export async function detectPackageManager(cwd: string): Promise<PackageManager> {
  if (await fs.pathExists(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fs.pathExists(path.join(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export async function installPackages(
  cwd: string,
  deps: string[],
  devDeps: string[],
): Promise<void> {
  if (!(await fs.pathExists(path.join(cwd, 'package.json')))) {
    return;
  }

  const pm = await detectPackageManager(cwd);
  const addCmd = pm === 'npm' ? 'install' : 'add';
  const devFlag = pm === 'yarn' ? '--dev' : '--save-dev';

  if (deps.length > 0) {
    await run(pm, [addCmd, ...deps], cwd);
  }
  if (devDeps.length > 0) {
    await run(pm, [addCmd, devFlag, ...devDeps], cwd);
  }
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`)),
    );
    child.on('error', reject);
  });
}
