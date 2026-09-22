/// <reference types="node" />
import assert from "node:assert/strict"

import type { Node } from "./api.ts"
import { forecastForMonth, renewalForMonth } from "./finance.ts"

function node(patch: Partial<Node>): Node {
  return {
    id: 1,
    name: "测试节点",
    price: 10,
    currency: "CNY",
    billing_cycle: "monthly",
    expires_at: "2027-01-31",
    ...patch,
  } as Node
}

assert.equal(
  renewalForMonth(node({ billing_cycle: "once" }), "2027-01", false),
  null,
  "一次性购买不应出现在续费预测中",
)

assert.equal(
  renewalForMonth(node({}), "2027-02", false)?.date.getDate(),
  28,
  "1 月 31 日的月付节点在 2 月按月末续费",
)
assert.equal(
  renewalForMonth(node({}), "2027-03", false)?.date.getDate(),
  31,
  "月末日期必须保留原始锚点，不能从 2 月 28 日漂移到 3 月 28 日",
)
assert.equal(
  renewalForMonth(node({ expires_at: "2028-01-31" }), "2028-02", false)?.date.getDate(),
  29,
  "闰年 2 月应使用 29 日",
)

assert.equal(renewalForMonth(node({}), "2027-03", true), null, "不再续费的节点不产生预测支出")
assert.equal(
  forecastForMonth(
    [node({ id: 1, price: 14, currency: "USD" })],
    "2027-01",
    new Set(),
    { CNY: 1, USD: 0.2, EUR: 0.12, GBP: 0.105, JPY: 22.2, HKD: 1.1, CAD: 0.19 },
  )[0]?.amountCny,
  70,
  "预测总额应使用用户保存的汇率",
)

console.log("finance 校验通过")
