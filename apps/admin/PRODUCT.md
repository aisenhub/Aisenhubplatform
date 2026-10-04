# Admin 产品背景

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

系统管理员。用户确认高频任务是平台与账户管理。

## Product Purpose

管理自营平台的账户、套餐、订阅、兑换码、文件、计费、运维任务与审计。

## Operating Context

Global 管理入口与由 URL 确定的平台工作区；桌面密集操作为主，窄屏也须能导航、查看详情和处理错误。

## Capabilities and Constraints

使用现有 Next.js、Base UI 与同源 Admin API。保留服务端权限、MFA、幂等、结果未确认与审计边界；不增加后端能力或虚构数据。本次用户要求所有验证仅在本地执行。

## Brand Commitments

名称 Aisenhub。用户明确将视觉方向交由 Agent 决定，无须保留旧风格。

## Product Principles

- 平台范围和操作对象始终明确。
- 优先让管理员找到并完成任务。
- 高风险操作保留影响说明、确认和失败恢复。
- 错误与旧数据可区分，数据来源失败不能表现为成功。
