import { requireNativeBinding } from "#q6u4pcd984qa";

type CommentStripResult = {
  changed: boolean;
  text: string;
  commentCount: number;
  lineComments: number;
  blockComments: number;
};

type CommentStripOptions = {
  exclude?: string[];
};

function stripComments(text: string, extension: string, options: CommentStripOptions = {}): CommentStripResult {
  return JSON.parse(requireNativeBinding().stripComments(JSON.stringify({
          text,
          extension,
          excludedCommentPatterns: options.exclude ?? [],
  }))) as CommentStripResult;
}

export { stripComments };
export type { CommentStripOptions, CommentStripResult };
