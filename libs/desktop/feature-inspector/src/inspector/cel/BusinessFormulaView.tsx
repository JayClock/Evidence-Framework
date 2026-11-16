import { useState } from 'react';
import {
  replaceBusinessFormulaToken,
  type BusinessFormulaToken,
  type CelCandidate,
} from '@evidence-poc/evidence-model-core';

export const BusinessFormulaView = ({
  expression,
  tokens,
  candidates,
  onCommit,
}: {
  expression: string;
  tokens: readonly BusinessFormulaToken[];
  candidates: readonly CelCandidate[];
  onCommit: (expression: string) => void;
}) => {
  const [error, setError] = useState('');
  const operatorChoices: Record<string, readonly [string, string][]> = {
    '+': [
      ['+', '加'],
      ['-', '减'],
      ['*', '乘 ×'],
      ['/', '除 ÷'],
      ['%', '取余'],
    ],
    '==': [
      ['==', '等于'],
      ['!=', '不等于'],
      ['>', '大于'],
      ['<', '小于'],
      ['>=', '大于等于'],
      ['<=', '小于等于'],
    ],
    '&&': [
      ['&&', '并且'],
      ['||', '或者'],
    ],
  };
  const operatorsFor = (text: string) =>
    Object.values(operatorChoices).find((choices) =>
      choices.some(([value]) => value === text),
    );
  const commit = (token: BusinessFormulaToken, value: string) => {
    const next = replaceBusinessFormulaToken(
      expression,
      token,
      value,
      candidates,
    );
    if (next === null) {
      setError('修改无效，未保存。请检查取值或切换 CEL 源码。');
      return;
    }
    setError('');
    if (next !== expression) onCommit(next);
  };
  return (
    <div>
      <div
        aria-label="业务公式"
        className="flex flex-wrap items-center gap-1 rounded border border-evidence-line bg-[#fbfcfe] p-2 text-[11px]"
      >
        {tokens.map((token, index) =>
          token.kind === 'attribute' ? (
            <select
              key={index}
              aria-label={`公式属性 ${index + 1}`}
              value={token.text}
              onChange={(event) => commit(token, event.target.value)}
              className="max-w-64 rounded bg-[#eef2f7] p-1"
            >
              {candidates
                .filter(
                  (candidate) =>
                    candidate.ref !== undefined &&
                    candidate.cardinality !== 'many',
                )
                .flatMap((candidate) =>
                  candidate.attributes.map((attribute) => (
                    <option
                      key={`${candidate.alias}.${attribute.name}`}
                      value={`${candidate.alias}.${attribute.name}`}
                    >
                      {candidate.label}.{attribute.label}
                    </option>
                  )),
                )}
            </select>
          ) : token.kind === 'literal' ? (
            <input
              key={`${expression}:${index}`}
              aria-label={`公式常量 ${index + 1}`}
              defaultValue={token.text}
              className="w-24 rounded border border-evidence-line p-1"
              onBlur={(event) => commit(token, event.target.value)}
            />
          ) : operatorsFor(token.text) !== undefined ? (
            <select
              key={index}
              aria-label={`公式运算符 ${index + 1}`}
              value={token.text}
              onChange={(event) => commit(token, event.target.value)}
            >
              {operatorsFor(token.text)?.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <span key={index} className="whitespace-pre-wrap">
              {token.label}
            </span>
          ),
        )}
      </div>
      {error ? (
        <p role="alert" className="text-[11px] text-[#b42318]">
          {error}
        </p>
      ) : null}
    </div>
  );
};
