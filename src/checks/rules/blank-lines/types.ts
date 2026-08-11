import type ts from "typescript";

type StructuralGroup =
|"directive"
|"import"
|"type"
|"variable"
|"function"
|"class"
|"enum"
|"namespace"
|"export"
|"execution"
|"class-field"
|"class-method"
|"class-accessor"
|"class-constructor"
|"class-static-block";

type StructuralUnit = {
  group: StructuralGroup;
  name?: string;
  startLine: number;
  endLine: number;
  node: ts.Node;
};

type HeaderSegment = {
  startLine: number;
  endLine: number;
  endPos: number;
};

type BoundaryEdit = {
  atLine: number;
  removeCount: number;
  insertCount: number;
};

export type { BoundaryEdit, HeaderSegment, StructuralGroup, StructuralUnit };
