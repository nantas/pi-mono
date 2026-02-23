# MEM0_URL 环境变量支持

## 日期
2026-02-23

## 目标
为 `packages/mom/src/tools/opencode.ts` 增加 `MEM0_URL` 环境变量配置能力，避免 mem0 服务地址硬编码。

## 变更内容
- 在文件顶部（import 后）新增常量：
  - `const MEM0_URL: string = process.env.MEM0_URL || "http://localhost:7889";`
- 将 `writeMemory` 中的请求地址由硬编码替换为：
  - ``${MEM0_URL}/memories``
- 将 `pollTaskStatus` 中的请求地址由硬编码替换为：
  - ``${MEM0_URL}/memories/tasks/${taskId}``

## 影响说明
- 未设置 `MEM0_URL` 时，默认连接本地 `http://localhost:7889`。
- 设置 `MEM0_URL` 后，可将 mem0 请求路由到指定服务地址。
- 仅修改 URL 配置来源，不改变原有请求体和轮询逻辑。

## 涉及文件
- `packages/mom/src/tools/opencode.ts`
- `docs/plans/2026-02-23-mem0-url-env-support.md`

## 验证
- 执行 `pnpm build`，确认编译通过。
