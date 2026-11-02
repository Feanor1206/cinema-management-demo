import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, role: 'Quản lý' | 'Thu ngân') {
  await page.goto('/');
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible();
}

test('manager searches and edits a movie', async ({ page }, testInfo) => {
  await login(page, 'Quản lý');
  await page.getByRole('navigation').getByRole('button', { name: 'Phim' }).click();
  await page.getByLabel('Tìm phim').fill('Đào');
  const first = page.locator('article').filter({ hasText: 'P001' });
  await expect(first).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'P005' })).toBeVisible();
  await first.getByRole('button', { name: /Sửa/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Thời lượng (phút)').fill('105');
  await dialog.getByRole('button', { name: 'Lưu thông tin' }).click();
  await expect(dialog).toBeHidden();
  await expect(first).toContainText('105 phút');
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
});

test('cashier sells two seats with points and can read the receipt', async ({ page }, testInfo) => {
  await login(page, 'Thu ngân');
  await page.getByRole('navigation').getByRole('button', { name: 'Bán vé' }).click();
  await page.getByRole('button', { name: /Ghế F05, Standard/ }).click();
  await page.getByRole('button', { name: /Ghế F06, VIP/ }).click();
  await page.getByLabel('Số điện thoại thành viên').fill('0987654321');
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await expect(page.getByText('650 điểm')).toBeVisible();
  await page.getByLabel('Đổi 500 điểm lấy một vé 2D Standard').selectOption('F05');
  await page.getByRole('button', { name: 'Thanh toán', exact: true }).click();
  const receipt = page.getByRole('dialog');
  await expect(receipt).toContainText('Số dư: 160');
  await expect(receipt).toContainText('100.000');
  await expect(receipt).toContainText('F05');
  await expect(receipt).toContainText('F06');
  await page.screenshot({ path: testInfo.outputPath('receipt.png'), fullPage: true });
});

test('report empty state and mobile layout', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, 'Quản lý');
  await page.getByRole('navigation').getByRole('button', { name: 'Doanh thu' }).click();
  await expect(page.getByRole('heading', { name: 'Doanh thu', exact: true })).toBeVisible();
  await page.getByLabel('Từ ngày').fill('2035-01-01');
  await page.getByLabel('Đến ngày').fill('2035-01-02');
  await page.getByRole('button', { name: 'Xem báo cáo' }).click();
  await expect(page.getByText('Không có dữ liệu trong khoảng thời gian này.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});

test('manager creates a showtime and sees an overlapping schedule rejected', async ({ page }) => {
  await login(page, 'Quản lý');
  await page.getByRole('navigation').getByRole('button', { name: 'Lịch chiếu' }).click();
  const openForm = async () => {
    await page.getByRole('button', { name: 'Tạo suất chiếu' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Phim', exact: true }).selectOption('P001');
    await dialog.getByLabel('Phòng chiếu').selectOption('R001');
    await dialog.getByLabel('Thời gian bắt đầu').fill('2040-01-15T10:00');
    return dialog;
  };
  let dialog = await openForm();
  await dialog.getByRole('button', { name: 'Tạo suất chiếu' }).click();
  await expect(dialog).toBeHidden();
  dialog = await openForm();
  await dialog.getByRole('button', { name: 'Tạo suất chiếu' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog).toContainText(/trùng|khoảng|lịch/i);
});

test('report drilldown retains date and group filters through invoice', async ({ page }) => {
  await login(page, 'Quản lý');
  await page.getByRole('navigation').getByRole('button', { name: 'Doanh thu' }).click();
  await page.getByLabel('Nhóm theo').selectOption('cinema');
  await page.getByRole('button', { name: 'Xem báo cáo' }).click();
  const from = await page.getByLabel('Từ ngày').inputValue();
  const to = await page.getByLabel('Đến ngày').inputValue();
  await page.locator('.report-row').first().click();
  await expect(page.getByRole('heading', { name: /Suất chiếu ·/ })).toBeVisible();
  await page
    .getByRole('button', { name: /Xem hóa đơn/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: /Hóa đơn ·/ })).toBeVisible();
  await expect(page.getByLabel('Từ ngày')).toHaveValue(from);
  await expect(page.getByLabel('Đến ngày')).toHaveValue(to);
  await expect(page.getByLabel('Nhóm theo')).toHaveValue('cinema');
  await page.getByRole('button', { name: /^HD/ }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Chi tiết vé');
});
