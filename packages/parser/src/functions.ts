export type ValueType = 'number' | 'string' | 'boolean';

export type FunctionSignature = {
  minArgs: number;
  maxArgs: number;
  argType?: ValueType;
  returns: ValueType;
};

export type FunctionSignatures = Record<string, FunctionSignature>;

export type FunctionHandler = (args: unknown[]) => unknown;

export const BUILTIN_SIGNATURES: FunctionSignatures = {
  random: {minArgs: 1, maxArgs: 2, argType: 'number', returns: 'number'},
  seenCount: {minArgs: 0, maxArgs: 0, returns: 'number'},
};

const randomInt = (min: number, max: number): number => {
  if (min >= max) {
    throw new Error('`random`: min must be less than max');
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// `seenCount` is not here — the evaluator binds it to `Context.seenCount`.
export const BUILTIN_HANDLERS: Record<string, FunctionHandler> = {
  random: args => {
    const [first, second] = args;

    if (typeof first !== 'number' || (second !== undefined && typeof second !== 'number')) {
      throw new TypeError('`random`: arguments must be numbers');
    }

    return second === undefined ? randomInt(1, first) : randomInt(first, second);
  },
};
