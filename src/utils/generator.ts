import Handlebars from 'handlebars';
import fs from 'fs-extra';
import path from 'path';

export async function generateFromTemplate(
  templateName: string,
  targetPath: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  const templatePath = path.join(__dirname, '../templates', templateName);
  const source = await fs.readFile(templatePath, 'utf-8');
  const compiled = Handlebars.compile(source);
  await fs.outputFile(targetPath, compiled(data));
}
