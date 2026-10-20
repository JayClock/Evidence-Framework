# 环境漂移：为什么 Agent 昨天能跑，今天就不行了

## Bad Smell

Evidence 早期的 Skills 测试入口有两种写法：一处直接调用 `python3`，另一处写死某台机器上的 Python 3.12 绝对路径。前者取决于系统把命令指向哪个解释器，后者依赖那台机器的目录。换个环境，同一份代码连测试入口都可能启动不了。

解释器存在也不够。系统 Python 可能低于 Skills 要求的 3.10，也可能版本符合，却没有安装 `jsonschema`、`celpy` 或 `yaml`。如果只看后续测试报错，排查很容易从业务代码开始，忽略真正执行命令的环境。

## Solution

### 测试入口先选择合适的解释器

项目用 [Python 解释器选择器](../../tools/python/python.mjs)替换了这两种调用方式。`skills:test`、`skills:test:fm` 和 `skills:test:api` 都先经过选择器，再执行对应测试。入口同时声明需要导入的模块，解释器版本和依赖一起检查。

设置了 `PYTHON` 时，选择器只检查指定解释器。没有显式指定时，按 `python3.13`、`python3.12`、`python3.11`、`python3.10`、`python3`、`python` 的顺序，选择首个版本与模块都符合要求的候选。这样，系统默认解释器过旧，或者较新解释器缺少依赖时，都有明确的选择规则。

找不到合适候选，入口以退出码 `4` 结束，并列出各候选失败的原因和依赖安装建议。显式指定的 `PYTHON` 不可用时也直接报错，避免悄悄换用另一套环境。选定解释器后，脚本转发测试参数，并保留实际测试进程的退出码。

### 用锁文件和仓库配置准备环境

Node 依赖通过 `package-lock.json` 记录，[本地开发指南](../howtos/local-development.md)采用 `npm ci` 安装。Java 构建统一使用仓库根的 Gradle Wrapper，[Wrapper 配置](../../gradle/wrapper/gradle-wrapper.properties)固定 Gradle 版本与分发包校验和，[根构建文件](../../build.gradle)声明 Java 17 工具链。准备环境时可以直接核对这些文件，不依赖机器上碰巧装了哪个 Gradle。

项目自有的建模与交付 Skills 放在 `.agents/skills/`，方法、脚本、Schema 和测试随仓库版本一起管理。各 Skill 用 `requirements.txt` 声明 Python 依赖，测试入口再检查实际解释器能否导入所需模块。

### 把环境选择本身纳入测试

[选择器回归](../../tools/python/python.spec.mjs)通过注入模拟进程调用，覆盖命令不存在、版本过旧、缺少模块、显式指定解释器和参数转发等情况。比如较新的 Python 缺少依赖时，测试要求继续选择满足条件的候选；显式指定的解释器缺少依赖时，即使另一个候选可用，也要求返回错误。

这些用例由 `npm run python:test` 执行，并已接入根目录的 `npm test`。测试还检查真实入口能返回符合版本要求的解释器，或者在找不到时给出安装建议。

[测试指南](../engineering/testing.md)把解释器解析失败与业务检查失败分开处理。执行记录保留实际环境、退出码和诊断，环境缺失只阻塞依赖它的检查。恢复后从原检查继续，不通过改业务断言来适应错误的运行环境。
