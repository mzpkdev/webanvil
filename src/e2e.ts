import { test } from "@playwright/test"

export { defineConfig, devices, expect, test } from "@playwright/test"

export const describe = test.describe
export const context = test.describe
export const it = test
