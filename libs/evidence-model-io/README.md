# evidence-model-io

FM 模型源树的磁盘适配层：读取 `.evidence/fm/` 目录树、打包与解包
`*.evidence.json` 单文件 Bundle、计算模型根指纹。

本包属于 `platform:node`，只被进程侧入口消费（桌面主进程、传感器、CLI）。
纯内存模型逻辑留在 `@evidence-poc/evidence-model-core`，渲染端不需要也不应该
依赖本包。
