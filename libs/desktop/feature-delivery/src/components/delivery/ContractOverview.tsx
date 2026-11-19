import type { DeliveryPreview } from '@evidence-poc/desktop-contracts/projects';
import type { LiveRouteBinding } from '@evidence-poc/desktop-contracts/delivery';

const KIND_LABELS: Record<string, string> = {
  channel: '渠道前置',
  fulfillment: '核心履约',
  domain: '领域计算',
  capability: '能力支撑',
};

/** Human-readable contract facts alongside the machine-readable files. */
export const ContractOverview = ({
  preview,
  bindings,
}: {
  preview: DeliveryPreview;
  bindings: readonly LiveRouteBinding[];
}) => (
  <div className="flex flex-col gap-5 p-5 text-xs [overflow-wrap:anywhere]">
    <section>
      <h3 className="mb-2 font-semibold">服务边界 {preview.services.length}</h3>
      {preview.services.length ? (
        <table className="w-full text-left">
          <thead className="text-workbench-muted">
            <tr>
              {['服务', '类型', '上下文', '路由', '说明'].map((label) => (
                <th key={label} scope="col" className="pr-2 pb-1">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.services.map((service) => (
              <tr
                key={service.id}
                data-service={service.id}
                className="border-t border-workbench-border align-top [&>td]:py-1.5 [&>td]:pr-2"
              >
                <td>{service.name}</td>
                <td>{KIND_LABELS[service.kind] ?? service.kind}</td>
                <td>{service.contextRef}</td>
                <td>
                  {service.routeCount}{' '}
                  <code className="block">
                    {service.routePrefixes.join(' · ')}
                  </code>
                </td>
                <td>{service.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>尚无服务边界。</p>
      )}
    </section>
    <section>
      <h3 className="mb-2 font-semibold">跨边界调用 {preview.links.length}</h3>
      {preview.links.length ? (
        <ul className="divide-y divide-workbench-border">
          {preview.links.map((link) => (
            <li key={link.id} data-link={link.id} className="py-1.5">
              {link.from} → {link.to} · {link.label} ·{' '}
              {link.mode === 'sync'
                ? '同步调用'
                : link.mode === 'async'
                  ? '异步回调'
                  : link.mode}
            </li>
          ))}
        </ul>
      ) : (
        <p>各服务之间没有直接调用。</p>
      )}
    </section>
    <section aria-label="路由契约">
      <h3 className="mb-2 font-semibold">路由契约 {preview.routes.length}</h3>
      {bindings.length ? (
        <ul className="divide-y divide-workbench-border">
          {bindings.map((route) => (
            <li key={route.id} className="py-1.5">
              <code>
                {route.method} {route.path}
              </code>{' '}
              ·{' '}
              {route.exposure === 'internal'
                ? '内部操作'
                : route.roleRefs.join('、')}
            </li>
          ))}
        </ul>
      ) : (
        <p>尚无投影路由。</p>
      )}
    </section>
    <section>
      <h3 className="mb-2 font-semibold">
        尚未闭环的能力 {preview.limitations.length}
      </h3>
      {preview.limitations.length ? (
        <ul className="list-disc pl-4">
          {preview.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>没有未闭环项。</p>
      )}
    </section>
  </div>
);
