import { Project, QuoteKind, IndentationText } from 'ts-morph';

export function makeProject() {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
    },
  });
}
