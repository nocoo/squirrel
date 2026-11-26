import { expect, test } from "@playwright/test";

test.describe("Squirrel Admin E2E", () => {
  test("manages folders, secrets, plaintext reveal, bot tokens, and audit logs", async ({
    page,
  }) => {
    // 1. Dashboard loads
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "概览" }).first()).toBeVisible();
    await expect(page.getByText("托管密钥")).toBeVisible();

    // 2. Navigate to Secrets page and create a folder
    await page.getByRole("link", { name: "密钥库" }).click();
    await expect(page.getByRole("heading", { name: "密钥库" }).first()).toBeVisible();

    await page.getByRole("button", { name: "新建文件夹" }).click();
    await page.getByLabel("文件夹名称").fill("Cloudflare Tools");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("Cloudflare Tools").first()).toBeVisible();

    // 3. Create a secret inside the folder
    await page.getByRole("button", { name: "新增密钥" }).first().click();
    await page.getByLabel("名称").fill("CF DNS Readonly");
    await page.getByLabel("归属服务").fill("cloudflare");
    await page.getByPlaceholder("粘贴 API Key 或 Token").fill("cfut_e2e_secret_987654");
    await page.getByRole("button", { name: "保存" }).click();

    await expect(page.getByText("CF DNS Readonly")).toBeVisible();
    await expect(page.getByText("cfut...7654")).toBeVisible();

    // 4. Reveal plaintext
    await page.getByRole("button", { name: "查看明文 CF DNS Readonly" }).click();
    await expect(page.getByText("cfut_e2e_secret_987654")).toBeVisible();
    await page.getByRole("button", { name: "关闭" }).click();

    // 5. Navigate to Clients page and create a Bot Token scoped to the folder
    await page.getByRole("link", { name: "客户端与凭证" }).click();
    await expect(page.getByRole("heading", { name: "客户端与凭证" }).first()).toBeVisible();

    await page.getByRole("button", { name: "新建 Bot Token" }).first().click();
    await page.getByLabel("消费方名称").fill("E2E Nightly Agent");
    await page.getByRole("checkbox", { name: "Cloudflare Tools" }).click();
    await page.getByRole("button", { name: "创建凭证" }).click();

    await expect(page.getByRole("dialog").getByText(/sq_live_/)).toBeVisible();
    await page.getByRole("button", { name: "我已保存，关闭" }).click();
    await expect(page.getByText("E2E Nightly Agent")).toBeVisible();

    // 6. Verify admin_reveal audit log appears
    await page.getByRole("link", { name: "审计日志" }).click();
    await expect(page.getByRole("heading", { name: "审计日志" }).first()).toBeVisible();
    await expect(page.getByText("admin_reveal")).toBeVisible();
    await expect(page.getByText("cf-dns-readonly")).toBeVisible();

    // 7. Toggle theme and collapse sidebar cleanly
    await page.getByRole("button", { name: /主题|theme/i }).click();
    await page.getByRole("button", { name: "收起侧边栏" }).click();
    await expect(page.getByRole("button", { name: "展开侧边栏" })).toBeVisible();
  });
});
