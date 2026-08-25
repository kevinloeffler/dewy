/**
 * The parsed shape of a student program.
 *
 * Every node carries the 1-indexed `line` it started on. That is the whole
 * reason this AST exists rather than a `Function` built from the source:
 * the interpreter reports the line before running each statement, and the
 * editor draws its executing-line marker from it.
 */

export type BinaryOperator = '===' | '!==' | '<' | '>' | '<=' | '>=' | '+' | '-' | '*' | '/' | '%';

export type Expr =
    | { kind: 'number'; value: number; line: number }
    | { kind: 'string'; value: string; line: number }
    | { kind: 'boolean'; value: boolean; line: number }
    | { kind: 'null'; line: number }
    | { kind: 'name'; name: string; line: number }
    | { kind: 'call'; callee: string; args: Expr[]; line: number }
    | { kind: 'unary'; operator: '!' | '-'; operand: Expr; line: number }
    | { kind: 'binary'; operator: BinaryOperator; left: Expr; right: Expr; line: number }
    | { kind: 'logical'; operator: '&&' | '||'; left: Expr; right: Expr; line: number };

export type Block = {
    statements: Stmt[];
    line: number;
};

export type Stmt =
    | { kind: 'expression'; expression: Expr; line: number }
    | { kind: 'let'; name: string; value: Expr; line: number }
    | { kind: 'assign'; name: string; value: Expr; line: number }
    | { kind: 'if'; test: Expr; consequent: Block; alternate: Block | null; line: number }
    | { kind: 'while'; test: Expr; body: Block; line: number }
    | { kind: 'repeat'; count: Expr; body: Block; line: number }
    | { kind: 'function'; name: string; parameters: string[]; body: Block; line: number }
    | { kind: 'return'; value: Expr | null; line: number };

export type Program = {
    body: Stmt[];
};
