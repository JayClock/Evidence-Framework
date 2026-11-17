# 文件

- [静态检查、CEL 与样例求值](checks-and-simulation.md) - FM check v6 报告证明什么、不证明什么：静态一致性与 scope 完整性、breach flow 声明与 lint 建议、native CEL 的精确整数与内联 examples oracle、flow 依赖聚合的错误码，以及这些结论如何成为 native sensors 与 stage gate 的输入。
- [受控模型变更、会话与历史](commands-and-session.md) - Immer recipe、guarded mutators 与标准 RFC 6902 如何构成原子模型事务，以及四个领域算子的共享注册表、历史、选择、同步事件和 Agent/MCP 边界的真实安全语义。
- [模型源格式、Bundle 与文件边界](source-formats.md) - .evidence/fm 源树与 *.evidence.json bundle 两种等价格式的常量、非源目录、原子幂等写出、digest 与读取期间变化、桌面监听与 CLI pack/unpack/inspect 落点。
