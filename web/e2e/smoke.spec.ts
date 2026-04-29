// Playwright スモークテスト
//
// MVP では認証フローを E2E でカバーしない（Google OAuth は実機テストに任せる）。
// 認証不要な公開ページの表示と、未認証時のリダイレクト動作のみ確認する。
//
// 実行手順:
//   1. 別ターミナルで pnpm dev を起動しておく
//   2. cd web && pnpm test:e2e

import { expect, test } from "@playwright/test";

test.describe("認証ガード", () => {
  test("ルートは未認証時に /login へリダイレクトされる", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });

  test("/dashboard は未認証時に /login へリダイレクト", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });

  test("/shopping は未認証時に /login へリダイレクト", async ({ page }) => {
    await page.goto("/shopping");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });
});

test.describe("/login 画面", () => {
  test("Google ログインボタンが表示される", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "OkazuLink" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Google でログイン/ })).toBeVisible();
  });

  test("not_allowed エラーパラメータでメッセージが表示される", async ({ page }) => {
    await page.goto("/login?error=not_allowed");
    await expect(
      page.getByText("このメールアドレスは利用許可されていません"),
    ).toBeVisible();
  });
});
