export type Literal = {
  type: 'Literal';
  value: number | string | boolean;
};

export type Path = {
  type: 'Path';
  value: string;
};

export type FunctionCall = {
  type: 'FunctionCall';
  name: string;
  args: Expr[];
};

export type Group = {
  type: 'Group';
  expression: Expr;
};

export type UnaryExpr = {
  type: 'UnaryExpr';
  op: '!' | '-';
  operand: Expr;
};

export type BinaryExpr = {
  type: 'BinaryExpr';
  op: BinaryOp;
  left: Expr;
  right: Expr;
};

export type BinaryOp = '+' | '-' | '*' | '/' | '==' | '!=' | '<' | '>' | '<=' | '>=' | '&&' | '||';

export type Expr = Literal | Path | FunctionCall | Group | UnaryExpr | BinaryExpr;

export type AssignOp = '=' | '+=' | '-=' | '*=' | '/=';

export type Assignment = {
  type: 'Assignment';
  path: Path;
  op: AssignOp;
  expr: Expr;
};

export type Condition = {
  type: 'Condition';
  expression: Expr;
};

export type Effect = {
  type: 'Effect';
  assignment: Assignment;
};

export type ASTNode = Expr | Assignment | Condition | Effect;

// Public API aliases — avoid clashing with domain-level Condition/Effect names in consumers.
export type ConditionNode = Condition;
export type EffectNode = Effect;
