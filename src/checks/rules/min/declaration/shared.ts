import { collectLanguageFunctionDescriptors } from "#9tcp2jgf8qlj";

type NamedDeclaration = {
  kind: string;
  line: number;
  name: string;
};

type DeclarationPattern = {
  kind: string;
  pattern: RegExp;
};

function collectPatternDeclarations(text: string, patterns: DeclarationPattern[]): NamedDeclaration[] {
  const declarations: NamedDeclaration[] = [];
  const lines = text.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const entry of patterns) {
      const match = entry.pattern.exec(line);
      if (!match?.[1]) continue;
      declarations.push({
          kind: entry.kind,
          line: index + 1,
          name: match[1],
      });
      break;
    }
  }

  return declarations;
}

function collectCFamilyFunctionDeclarations(text: string, extension: string, filePath: string): NamedDeclaration[] {
  return collectLanguageFunctionDescriptors(text, extension, filePath).map((entry) => ({
        kind: entry.kind,
        line: entry.startLine,
        name: entry.name,
  }));
}

export {
  collectCFamilyFunctionDeclarations,
  collectPatternDeclarations,
};

export type {
  DeclarationPattern,
  NamedDeclaration,
};
