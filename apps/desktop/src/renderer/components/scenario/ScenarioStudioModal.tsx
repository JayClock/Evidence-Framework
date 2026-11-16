import { useMemo, useState } from 'react';
import {
  buildDeliveryRoutes,
  projectAcceptanceTests,
} from '@evidence-poc/evidence-api/delivery';
import {
  cloneScenarioExamples,
  evaluateScenario,
  replaceScenarioExamples,
  scenarioExamples,
  validateTypedValue,
  type ScenarioExample,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';
import type { ModelExampleAST } from '@evidence-poc/evidence-schema';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@evidence-poc/desktop-ui-kit';

const fieldClass =
  'rounded border border-evidence-line bg-white px-2 py-1 text-[12px]';
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const parseField = (value: string, type: string): unknown => {
  if (type === 'bool') return value === 'true';
  if (type === 'decimal') return value;
  if (['int', 'uint', 'double'].includes(type)) {
    const number = Number(value);
    return value.trim() &&
      Number.isFinite(number) &&
      (!['int', 'uint'].includes(type) || Number.isSafeInteger(number))
      ? number
      : value;
  }
  if (['map', 'list', 'money', 'dynamic'].includes(type)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

/** The only persisted suite remains entity examples[].test. A modal edits a snapshot. */
export const ScenarioStudioModal = ({
  session,
  onClose,
  onPlay,
}: {
  session: ModelSession;
  onClose: () => void;
  onPlay: (flow: string) => void;
}) => {
  const [base, setBase] = useState(() => session.getDocument());
  const flows = useMemo(
    () =>
      [
        ...new Set(
          base.entities.flatMap((e) =>
            (e.examples ?? []).flatMap((x) => (x.test ? [x.test.flow] : [])),
          ),
        ),
      ].sort(),
    [base],
  );
  const [flow, setFlow] = useState(flows[0] ?? '');
  const [items, setItems] = useState<ScenarioExample[]>(() =>
    scenarioExamples(base, flows[0] ?? ''),
  );
  const [newName, setNewName] = useState('');
  const [selected, setSelected] = useState(0);
  const [entityRef, setEntityRef] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const stale = base !== session.getDocument();
  const routes = useMemo(() => {
    try {
      return {
        values: buildDeliveryRoutes(base).filter((r) => r.method === 'POST'),
      };
    } catch (error) {
      return { values: [], error: message(error) };
    }
  }, [base]);
  const candidate = useMemo(() => {
    try {
      const model = structuredClone(base);
      if (flow) replaceScenarioExamples(model, flow, items);
      return { model, results: flow ? evaluateScenario(model, flow) : [] };
    } catch (error) {
      return { error: message(error), results: [] };
    }
  }, [base, flow, items]);
  const item = items[selected];
  const entity = base.entities.find((e) => e.id === item?.entityRef);
  const route = routes.values.find((r) => r.entityRef === item?.entityRef);
  const negative = (item?.example.test?.expectedStatus ?? 201) >= 400;
  const enteredValues = negative
    ? (item?.example.test?.inputs ?? item?.example.value)
    : item?.example.value;
  const editField = (
    example: ModelExampleAST,
    name: string,
    value: string,
    type: string,
  ) => {
    const values = negative
      ? (example.test!.inputs ??= structuredClone(example.value))
      : example.value;
    if (!value) delete values[name];
    else
      values[name] = parseField(
        value,
        type,
      ) as ModelExampleAST['value'][string];
  };
  const patch = (change: (example: ModelExampleAST) => void) => {
    setItems((current) =>
      current.map((entry, i) => {
        if (i !== selected) return entry;
        const next = structuredClone(entry);
        change(next.example);
        return next;
      }),
    );
    setNotice('');
    setDirty(true);
  };
  const create = (clone: boolean) => {
    const name = newName.trim();
    if (!name || flows.includes(name) || name === flow) {
      setNotice('请填写未使用的场景名称。');
      return;
    }
    setItems(clone ? cloneScenarioExamples(base, flow, name) : []);
    setFlow(name);
    setSelected(0);
    setNewName('');
    setDirty(true);
    setNotice('');
  };
  const save = (play: boolean) => {
    if (stale || !candidate.model || !items.length) return;
    try {
      session.mutate(
        (draft) => replaceScenarioExamples(draft, flow, items),
        '保存业务场景',
      );
      setBase(session.getDocument());
      setDirty(false);
      setNotice('场景已写入模型编辑会话；请保存项目落盘。未执行后端验收。');
      if (play) onPlay(flow);
    } catch (error) {
      setNotice(message(error));
    }
  };
  const requestClose = () => {
    if (dirty)
      setNotice('还有未保存的场景编辑。请先保存，或点击“丢弃场景编辑”后关闭。');
    else onClose();
  };
  const allFlows = flows.includes(flow) || !flow ? flows : [...flows, flow];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <header className="space-y-2 border-b p-4">
          <DialogTitle>业务场景推演</DialogTitle>
          <DialogDescription>
            填表声明多个例子，在本地核对规则，再交给现有 HTTP
            验收链路。推演不是后端执行。
          </DialogDescription>
        </header>
        <div className="space-y-2 border-b p-3">
          <label>
            当前场景{' '}
            <select
              aria-label="当前推演场景"
              className={fieldClass}
              value={flow}
              disabled={dirty}
              onChange={(e) => {
                setFlow(e.target.value);
                setItems(scenarioExamples(base, e.target.value));
                setSelected(0);
                setNotice('');
              }}
            >
              {!allFlows.length ? (
                <option value="">尚无场景，请创建</option>
              ) : null}
              {allFlows.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <input
            aria-label="新场景名称"
            className={`${fieldClass} ml-2`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例如：超时未付款"
          />
          <button
            type="button"
            className={`${fieldClass} ml-2`}
            disabled={dirty}
            onClick={() => create(false)}
          >
            创建空白场景
          </button>
          <button
            type="button"
            className={`${fieldClass} ml-2`}
            disabled={!flow || dirty}
            onClick={() => create(true)}
          >
            复制当前场景
          </button>
          <label className="ml-2">
            场景类型{' '}
            <select
              aria-label="场景类型"
              className={fieldClass}
              disabled={!items.length}
              value={
                items[0]?.example.test?.tags?.find((tag) =>
                  [
                    'happy_path',
                    'breach_timeout',
                    'breach_compensation',
                    'custom',
                  ].includes(tag),
                ) ?? 'custom'
              }
              onChange={(e) => {
                setItems(
                  items.map((entry) => {
                    const next = structuredClone(entry);
                    next.example.test!.tags = [
                      ...(next.example.test!.tags ?? []).filter(
                        (tag) =>
                          ![
                            'happy_path',
                            'breach_timeout',
                            'breach_compensation',
                            'custom',
                          ].includes(tag),
                      ),
                      e.target.value,
                    ];
                    return next;
                  }),
                );
                setDirty(true);
              }}
            >
              <option value="custom">自定义</option>
              <option value="happy_path">正常履约</option>
              <option value="breach_timeout">超时场景</option>
              <option value="breach_compensation">补偿场景</option>
            </select>
          </label>
          {dirty ? (
            <button
              type="button"
              className={`${fieldClass} ml-2`}
              onClick={() => {
                setItems(scenarioExamples(base, flow));
                setDirty(false);
                setNotice('已丢弃未保存的场景编辑。');
              }}
            >
              丢弃场景编辑
            </button>
          ) : null}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr_280px] overflow-auto text-[12px]">
          <aside className="space-y-2 border-r p-3">
            <h3>场景步骤（顺序由依据与业务时刻确定）</h3>
            {items.map((entry, i) => (
              <button
                key={`${entry.entityRef}:${i}`}
                type="button"
                aria-pressed={i === selected}
                className={`${fieldClass} block w-full text-left`}
                onClick={() => setSelected(i)}
              >
                {entry.example.label}
              </button>
            ))}
            <label>
              添加业务操作
              <select
                aria-label="添加业务操作"
                className={`${fieldClass} w-full`}
                value={entityRef}
                onChange={(e) => setEntityRef(e.target.value)}
              >
                <option value="">选择单据</option>
                {routes.values.map((r) => (
                  <option key={r.id} value={r.entityRef}>
                    {base.entities.find((e) => e.id === r.entityRef)?.label ??
                      r.entityRef}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={fieldClass}
              disabled={!flow || !entityRef}
              onClick={() => {
                const chosen = routes.values.find(
                  (r) => r.entityRef === entityRef,
                );
                if (!chosen) return;
                const label = `${flow} · ${base.entities.find((e) => e.id === entityRef)?.label ?? entityRef} · ${items.length + 1}`;
                setItems([
                  ...items,
                  {
                    entityRef,
                    example: {
                      label,
                      value: {},
                      test: {
                        flow,
                        actingRoleRef: chosen.allowedPartyRoleRefs[0] ?? '',
                        asOf: '',
                      },
                    },
                  },
                ]);
                setSelected(items.length);
                setDirty(true);
                setNotice('');
              }}
            >
              添加步骤
            </button>
            {routes.error ? (
              <p role="alert">无法投影操作：{routes.error}</p>
            ) : null}
          </aside>
          <section className="space-y-3 p-3" aria-label="场景事实录入">
            {!item ? (
              <p>
                没有自动生成的业务事实。请选择单据添加步骤，或复制已有场景。
              </p>
            ) : (
              <>
                <label className="block">
                  步骤名称
                  <input
                    className={`${fieldClass} w-full`}
                    aria-label="步骤名称"
                    value={item.example.label}
                    onChange={(e) => {
                      // Labels are canonical dependency identities: changing a referenced label would orphan later steps.
                      const previous = `${item.entityRef}#${item.example.label}`;
                      const next = `${item.entityRef}#${e.target.value}`;
                      setItems(
                        items.map((entry, i) => {
                          const copy = structuredClone(entry);
                          if (i === selected)
                            copy.example.label = e.target.value;
                          if (copy.example.test?.basedOn)
                            copy.example.test.basedOn =
                              copy.example.test.basedOn.map((ref) =>
                                ref === previous ? next : ref,
                              );
                          if (copy.example.test?.pathParameters)
                            for (const source of Object.values(
                              copy.example.test.pathParameters,
                            ))
                              if (source.exampleRef === previous)
                                source.exampleRef = next;
                          return copy;
                        }),
                      );
                      setDirty(true);
                    }}
                  />
                </label>
                <label className="block">
                  业务背景
                  <textarea
                    aria-label="业务背景"
                    className={`${fieldClass} w-full`}
                    value={item.example.description ?? ''}
                    onChange={(e) =>
                      patch((x) => {
                        if (e.target.value) x.description = e.target.value;
                        else delete x.description;
                      })
                    }
                  />
                </label>
                <label className="block">
                  业务时刻（含时区）
                  <input
                    className={`${fieldClass} w-full`}
                    aria-label="业务时刻"
                    placeholder="2026-01-01T10:00:00Z"
                    value={item.example.test?.asOf ?? ''}
                    onChange={(e) =>
                      patch((x) => {
                        x.test!.asOf = e.target.value;
                      })
                    }
                  />
                </label>
                <label className="block">
                  操作角色
                  <select
                    className={`${fieldClass} w-full`}
                    aria-label="操作角色"
                    value={item.example.test?.actingRoleRef ?? ''}
                    onChange={(e) =>
                      patch((x) => {
                        x.test!.actingRoleRef = e.target.value;
                      })
                    }
                  >
                    {[
                      ...new Set([
                        item.example.test?.actingRoleRef ?? '',
                        ...(route?.allowedPartyRoleRefs ?? []),
                      ]),
                    ].map((ref) => (
                      <option key={ref} value={ref}>
                        {base.entities.find((e) => e.id === ref)?.label ?? ref}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  预期 HTTP 状态（仅声明）
                  <input
                    aria-label="预期HTTP状态"
                    className={fieldClass}
                    type="number"
                    min="200"
                    max="599"
                    value={item.example.test?.expectedStatus ?? ''}
                    placeholder="使用路由默认成功状态"
                    onChange={(e) =>
                      patch((x) => {
                        if (!e.target.value) {
                          delete x.test!.expectedStatus;
                          delete x.test!.inputs;
                        } else {
                          x.test!.expectedStatus = Number(e.target.value);
                          if (x.test!.expectedStatus < 400)
                            delete x.test!.inputs;
                        }
                      })
                    }
                  />
                </label>
                <fieldset className="space-y-1">
                  <legend>前置凭证（明确选择，不猜测业务顺序）</legend>
                  {items.map((entry, i) =>
                    i === selected ? null : (
                      <label key={i} className="block">
                        <input
                          type="checkbox"
                          checked={
                            item.example.test?.basedOn?.includes(
                              `${entry.entityRef}#${entry.example.label}`,
                            ) ?? false
                          }
                          onChange={(e) =>
                            patch((x) => {
                              const ref = `${entry.entityRef}#${entry.example.label}`;
                              x.test!.basedOn = e.target.checked
                                ? [...(x.test!.basedOn ?? []), ref]
                                : (x.test!.basedOn ?? []).filter(
                                    (r) => r !== ref,
                                  );
                            })
                          }
                        />{' '}
                        {entry.example.label}
                      </label>
                    ),
                  )}
                </fieldset>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>业务字段</th>
                      <th>事实 / 人工预期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entity?.attributes?.map((attribute) => {
                      const value = enteredValues?.[attribute.name];
                      const problem =
                        value === undefined
                          ? null
                          : validateTypedValue(
                              value,
                              attribute.valueType ?? 'dynamic',
                            );
                      return (
                        <tr key={attribute.name}>
                          <td className="pr-2">
                            {attribute.label}
                            {attribute.derivedByRuleRef && !negative
                              ? '（预期派生值，可空）'
                              : attribute.required
                                ? ' *'
                                : ''}
                          </td>
                          <td>
                            {attribute.valueType === 'bool' ? (
                              <select
                                className={fieldClass}
                                aria-label={attribute.label}
                                value={value === undefined ? '' : String(value)}
                                onChange={(e) =>
                                  patch((x) =>
                                    editField(
                                      x,
                                      attribute.name,
                                      e.target.value,
                                      'bool',
                                    ),
                                  )
                                }
                              >
                                <option value="">未填写</option>
                                <option value="true">是</option>
                                <option value="false">否</option>
                              </select>
                            ) : (
                              <input
                                className={`${fieldClass} w-full`}
                                aria-label={attribute.label}
                                value={
                                  value === undefined
                                    ? ''
                                    : typeof value === 'object'
                                      ? JSON.stringify(value)
                                      : String(value)
                                }
                                onChange={(e) =>
                                  patch((x) =>
                                    editField(
                                      x,
                                      attribute.name,
                                      e.target.value,
                                      attribute.valueType ?? 'dynamic',
                                    ),
                                  )
                                }
                              />
                            )}
                            {problem ? (
                              <p className="text-amber-700">{problem}</p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button
                  type="button"
                  className={fieldClass}
                  onClick={() => {
                    setItems(items.filter((_, i) => i !== selected));
                    setSelected(0);
                    setDirty(true);
                  }}
                >
                  删除当前步骤
                </button>
              </>
            )}
          </section>
          <aside
            className="space-y-3 border-l p-3"
            aria-label="本地规则推演结果"
          >
            <h3 className="font-semibold">本地规则推演 · 非 HTTP 验收</h3>
            {candidate.error ? (
              <p role="status" className="break-words text-amber-700">
                请补齐用例：{candidate.error}
              </p>
            ) : null}
            {candidate.results.map((result) => (
              <article
                key={result.ref}
                className="space-y-1 break-words border-b pb-2"
              >
                <h4>{result.ref}</h4>
                {result.gaps.map((gap) => (
                  <p key={gap} className="text-amber-700">
                    {gap}
                  </p>
                ))}
                {result.rules.map((r) => (
                  <p
                    key={r.ruleRef}
                    className={r.error ? 'text-amber-700' : ''}
                  >
                    {r.label}：{r.error ?? JSON.stringify(r.value)}
                  </p>
                ))}
              </article>
            ))}
          </aside>
        </div>
        <footer className="space-y-2 border-t p-3 text-[12px]">
          {stale ? (
            <p role="alert">
              模型已改变（含撤销／外部修改）；请关闭并重新打开，避免覆盖新版本。
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className={fieldClass}
              disabled={stale || !candidate.model || !items.length}
              onClick={() => save(false)}
            >
              保存场景到模型
            </button>
            <button
              type="button"
              className={fieldClass}
              disabled={stale || !candidate.model || !items.length}
              onClick={() => save(true)}
            >
              保存并放映
            </button>
            <button
              type="button"
              className={fieldClass}
              disabled={stale || !candidate.model || !items.length}
              onClick={() => {
                try {
                  const scoped = structuredClone(candidate.model!);
                  for (const e of scoped.entities)
                    if (e.examples)
                      e.examples = e.examples.filter(
                        (x) => x.test?.flow === flow,
                      );
                  const result = projectAcceptanceTests(scoped);
                  setNotice(
                    `可生成 ${result.flows.reduce((n, f) => n + f.steps.length, 0)} 步 HTTP 验收；保存后从交付中心导出 StepCI / Hurl。尚未运行后端。`,
                  );
                } catch (error) {
                  setNotice(`验收投影尚未就绪：${message(error)}`);
                }
              }}
            >
              检查 HTTP 验收投影
            </button>
            <button type="button" className={fieldClass} onClick={requestClose}>
              关闭场景工作台
            </button>
          </div>
          {notice ? (
            <p role="status" className="break-words">
              {notice}
            </p>
          ) : null}
        </footer>
      </DialogContent>
    </Dialog>
  );
};
