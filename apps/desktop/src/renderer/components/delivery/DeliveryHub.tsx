import { useDeliveryHub } from '../../state/useDeliveryHub';

const KIND_LABELS: Record<string, string> = {
  channel: '渠道前置',
  fulfillment: '核心履约',
  domain: '领域计算',
  capability: '能力支撑',
};

const LINK_MODE_LABELS: Record<string, string> = {
  sync: '同步调用',
  async: '异步回调',
};

export interface DeliveryHubProps {
  rootPath: string;
  onClose: () => void;
}

/**
 * The delivery hand-off, in one panel.
 *
 * It answers the question a modeler asks after the model closes: what does this
 * become? One row per service, one row per crossing, and the work the model still
 * owes stated as an obligation rather than hidden behind a green check.
 */
export const DeliveryHub = ({ rootPath, onClose }: DeliveryHubProps) => {
  const hub = useDeliveryHub(rootPath, true);
  const preview = hub.preview;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="交付中心"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b1a2a33] p-6"
    >
      <div className="flex max-h-[80vh] w-[860px] max-w-full flex-col overflow-hidden rounded-xl border border-evidence-line bg-white shadow-[0_12px_48px_#00000024]">
        <header className="flex items-center justify-between border-b border-evidence-line px-5 py-3">
          <div>
            <p className="text-[10px] tracking-[0.14em] text-evidence-muted">
              DELIVERY HUB
            </p>
            <h2 className="text-[14px] font-medium text-evidence-ink">
              交付物
              {preview === null ? null : (
                <span className="ml-2 text-[11px] text-evidence-muted">
                  {preview.modelName} · {preview.modelVersion}
                </span>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void hub.exportDelivery()}
              disabled={hub.busy || preview === null}
              className="rounded bg-evidence-accent px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40"
            >
              {hub.busy ? '导出中…' : '导出到文件夹'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted hover:text-evidence-ink"
            >
              关闭
            </button>
          </div>
        </header>

        {hub.notice === null ? null : (
          <p
            role="status"
            className={[
              'border-b px-5 py-2 text-[11px]',
              hub.notice.tone === 'saved'
                ? 'border-evidence-line bg-evidence-surface text-evidence-muted'
                : 'border-evidence-evidence bg-[#fdf3f1] text-evidence-evidence',
            ].join(' ')}
          >
            {hub.notice.message}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4 text-[11px] text-evidence-ink">
          {hub.loading ? (
            <p className="text-evidence-muted">正在读取模型并投影交付边界…</p>
          ) : null}

          {hub.error === null ? null : (
            <p className="whitespace-pre-wrap text-[#b42318]">{hub.error}</p>
          )}

          {preview === null ? null : (
            <div className="flex flex-col gap-5">
              <section>
                <h3 className="mb-1 text-[11px] font-medium text-evidence-muted">
                  服务边界 {preview.services.length}
                </h3>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-evidence-muted">
                      <th className="border-b border-evidence-line py-1">服务</th>
                      <th className="border-b border-evidence-line py-1">类型</th>
                      <th className="border-b border-evidence-line py-1">上下文</th>
                      <th className="border-b border-evidence-line py-1">路由</th>
                      <th className="border-b border-evidence-line py-1">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.services.map((service) => (
                      <tr key={service.id} data-service={service.id}>
                        <td className="border-b border-evidence-line py-1 pr-2">
                          {service.name}
                        </td>
                        <td className="border-b border-evidence-line py-1 pr-2">
                          {KIND_LABELS[service.kind] ?? service.kind}
                        </td>
                        <td className="border-b border-evidence-line py-1 pr-2">
                          {service.contextRef}
                        </td>
                        <td className="border-b border-evidence-line py-1 pr-2">
                          {service.routeCount}
                        </td>
                        <td className="border-b border-evidence-line py-1 text-evidence-muted">
                          {service.notes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section>
                <h3 className="mb-1 text-[11px] font-medium text-evidence-muted">
                  跨边界调用 {preview.links.length}
                </h3>
                {preview.links.length === 0 ? (
                  <p className="text-evidence-muted">各服务之间没有直接调用。</p>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-left text-evidence-muted">
                        <th className="border-b border-evidence-line py-1">从</th>
                        <th className="border-b border-evidence-line py-1">到</th>
                        <th className="border-b border-evidence-line py-1">语义</th>
                        <th className="border-b border-evidence-line py-1">方式</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.links.map((link) => (
                        <tr key={link.id} data-link={link.id}>
                          <td className="border-b border-evidence-line py-1 pr-2">
                            {link.from}
                          </td>
                          <td className="border-b border-evidence-line py-1 pr-2">
                            {link.to}
                          </td>
                          <td className="border-b border-evidence-line py-1 pr-2">
                            {link.label}
                          </td>
                          <td className="border-b border-evidence-line py-1">
                            {LINK_MODE_LABELS[link.mode] ?? link.mode}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section>
                <h3 className="mb-1 text-[11px] font-medium text-evidence-muted">
                  尚未闭环的能力 {preview.limitations.length}
                </h3>
                {preview.limitations.length === 0 ? (
                  <p className="text-evidence-muted">没有未闭环项。</p>
                ) : (
                  <ul className="list-disc pl-4 text-evidence-muted">
                    {preview.limitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
