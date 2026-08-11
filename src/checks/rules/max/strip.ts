type StripState = {
  escaped: boolean;
  inBlockComment: boolean;
  inDouble: boolean;
  inLineComment: boolean;
  inSingle: boolean;
  inTemplate: boolean;
};

function createStripState(): StripState {
  return {
    escaped: false,
    inBlockComment: false,
    inDouble: false,
    inLineComment: false,
    inSingle: false,
    inTemplate: false,
  };
}

function isQuoted(state: StripState): boolean {
  return state.inSingle || state.inDouble || state.inTemplate;
}

function consumeCommentState(state: StripState, character: string, nextCharacter: string): string | null {
  if (state.inLineComment) {
    if (character === "\n") {
      state.inLineComment = false;
      return "\n";
    }
    return " ";
  }

  if (!state.inBlockComment) return null;
  if (character === "*" && nextCharacter === "/") {
    state.inBlockComment = false;
    return "  ";
  }
  return character === "\n" ? "\n" : " ";
}

function updateQuoteState(state: StripState, character: string): string {
  if (state.escaped) {
    state.escaped = false;
    return " ";
  }

  if (isQuoted(state) && character === "\\") {
    state.escaped = true;
    return " ";
  }

  if (!state.inDouble && !state.inTemplate && character === "'") state.inSingle = !state.inSingle;
  else if (!state.inSingle && !state.inTemplate && character === "\"") state.inDouble = !state.inDouble;
  else if (!state.inSingle && !state.inDouble && character === "`") state.inTemplate = !state.inTemplate;

  return isQuoted(state)
  ? character === "\n" ? "\n" : " "
  : character;
}

function stripCommentsAndStrings(text: string): string {
  let result = "";
  const state = createStripState();

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    const nextCharacter = text[index + 1] ?? "";
    const commentValue = consumeCommentState(state, character, nextCharacter);

    if (commentValue != null) {
      result += commentValue;
      if (!state.inBlockComment && character === "*" && nextCharacter === "/") index += 1;
      continue;
    }

    if (!isQuoted(state) && character === "/" && (nextCharacter === "/" || nextCharacter === "*")) {
      state.inLineComment = nextCharacter === "/";
      state.inBlockComment = nextCharacter === "*";
      result += "  ";
      index += 1;
      continue;
    }

    result += updateQuoteState(state, character);
  }

  return result;
}

export { stripCommentsAndStrings };
