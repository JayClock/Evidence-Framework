import type { ASTNode } from '@marcbachmann/cel-js';

export const CEL_COLLECTION_MACROS = new Set([
  'all',
  'exists',
  'exists_one',
  'filter',
  'map',
]);

type Local = {
  value: ASTNode;
  scope: CelScope;
  iteration: boolean;
};

/** Lexical bindings retain the scope in which their value was declared. */
export type CelScope = ReadonlyMap<string, Local>;

/** Children of the native CEL AST; function names and member keys are not ids. */
const children = (node: ASTNode): readonly ASTNode[] => {
  switch (node.op) {
    case 'value':
    case 'id':
      return [];
    case '.':
    case '.?':
      return [node.args[0]];
    case 'call':
      return node.args[1];
    case 'rcall':
      return [node.args[1], ...node.args[2]];
    case '!_':
    case '-_':
      return [node.args];
    case 'map':
      return node.args.flat();
    default:
      return node.args;
  }
};

/** Walk the native AST in source order, without leaking macro locals. */
export const walkCelAst = (
  ast: ASTNode,
  visit: (node: ASTNode, scope: CelScope) => void,
): void => {
  const walk = (node: ASTNode, scope: CelScope): void => {
    visit(node, scope);
    if (node.op === 'rcall') {
      const [method, receiver, args] = node.args;
      const collection = CEL_COLLECTION_MACROS.has(method);
      const bind =
        method === 'bind' &&
        receiver.op === 'id' &&
        receiver.args === 'cel' &&
        !scope.has('cel');
      const [binder] = args;
      if ((collection || bind) && binder?.op === 'id') {
        walk(receiver, scope);
        const value = collection ? receiver : args[1];
        if (bind && value !== undefined) walk(value, scope);
        const nested = new Map(scope);
        if (value !== undefined) {
          nested.set(binder.args, { value, scope, iteration: collection });
        }
        args.slice(bind ? 2 : 1).forEach((body) => walk(body, nested));
        return;
      }
    }
    children(node).forEach((child) => walk(child, scope));
  };
  walk(ast, new Map());
};

export interface CelReference {
  root: string;
  members: readonly { name: string; offset: number; length: number }[];
  iterated: boolean;
}

/** Resolve a static read through lexical aliases, not through transformed data. */
export const resolveCelReference = (
  node: ASTNode,
  scope: CelScope,
): CelReference | null => {
  if (node.op === 'id') {
    const local = scope.get(node.args);
    if (local === undefined) {
      return { root: node.args, members: [], iterated: false };
    }
    const reference = resolveCelReference(local.value, local.scope);
    return reference === null
      ? null
      : {
          ...reference,
          iterated: reference.iterated || local.iteration,
        };
  }
  if (
    node.op === '.' ||
    node.op === '.?' ||
    node.op === '[]' ||
    node.op === '[?]'
  ) {
    const [object, key] = node.args;
    const reference = resolveCelReference(object, scope);
    const member =
      typeof key === 'string'
        ? { name: key, offset: node.pos, length: node.end - node.pos }
        : key.op === 'value' && typeof key.args === 'string'
          ? { name: key.args, offset: key.start, length: key.end - key.start }
          : null;
    return reference === null || member === null
      ? null
      : {
          ...reference,
          members: [...reference.members, member],
        };
  }
  if (node.op === 'rcall') {
    const [method, receiver, args] = node.args;
    // A filter preserves entities; a map only does so for an identity transform.
    if (
      method === 'filter' ||
      (method === 'map' &&
        args[0]?.op === 'id' &&
        args.at(-1)?.op === 'id' &&
        args.at(-1)?.args === args[0].args)
    ) {
      return resolveCelReference(receiver, scope);
    }
  }
  return null;
};
