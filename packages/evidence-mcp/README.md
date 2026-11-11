# evidence-mcp

把正在运行的 Evidence 桌面端投影成 MCP（Model Context Protocol）服务，供外部智能体
（Claude Code、Cursor、终端 Pi CLI 等）读取当前领域模型并提交补丁。

## 两种运行位置

```text
外部智能体 ──stdio JSON-RPC──> evidence-mcp（本包）──Unix Socket / Named Pipe──> Evidence 桌面端主进程
                                                                                    │
                                                                         渲染进程 ModelSession
```

- **`--mcp-stdio` 子进程**：`runEvidenceMcpStdio({ endpoint })` 启动 Stdio 传输，自身不渲染
  UI，只通过本地套接字转发工具调用；内存占用极低。
- **主进程内直接复用**：桌面端也实现同一个 `EvidenceMcpAppClient`，因此工具语义只有一份。

## 工具

| 工具                    | 读/写 | 用途                                     |
| ----------------------- | ----- | ---------------------------------------- |
| `get_app_state`         | 只读  | 当前项目、选区、传感器门禁、连接数       |
| `get_domain_model`      | 只读  | 领域模型 AST，可按上下文过滤             |
| `get_selected_entity`   | 只读  | 选中对象的定义、关系、派生规则与成对履约 |
| `get_key_data_audit`    | 只读  | 关键数据台账（谁提供、是否待决）         |
| `get_canvas_screenshot` | 只读  | 无编辑器辅助线的 PNG 快照                |
| `apply_model_patch`     | 写入  | 提交 `ModelCommand` 补丁，用户可撤销     |
| `run_stage_gate`        | 只读  | 下游 API / 联合审核页门禁                |

`apply_model_patch` 是唯一写入工具：补丁先由桌面端在克隆图上做静态检查，破坏红线即整体
拒绝，因此外部智能体无法绕过履约建模的不可协商约束。

## 本地套接字安全

`getEvidenceMcpBridgeEndpoint` 按 `userData` 派生短路径，macOS/Linux 落在系统临时目录并把
文件模式收紧到 `0600`，Windows 使用命名管道。业务模型不经过任何网络端口。

## 开发

```bash
nx test evidence-mcp
nx build evidence-mcp
```
