# Vercel 部署指南

## 準備工作清單

- [ ] Supabase 專案已建立並配置
- [ ] 資料庫 schema 已執行
- [ ] 本地環境變數已設置 (`.env.local`)
- [ ] 所有頁面已連接真實 API 並在本地測試
- [ ] 所有前端頁面都能正確載入資料

## 第一步：配置 Vercel 環境變數

### 1. 登入 Vercel

訪問 [vercel.com](https://vercel.com) 並登入您的帳號。

### 2. 進入專案設置

1. 找到您的專案 `sales-channel`
2. 進入 **Settings** → **Environment Variables**

### 3. 新增環境變數

添加以下 3 個變數（從 Supabase 複製）：

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**設定作用域：** 選擇 `Production`, `Preview`, `Development`

### 4. 保存環境變數

點擊 **Save** 按鈕

## 第二步：部署到 Vercel

### 方案 A：自動部署（推薦）

Vercel 已與 GitHub 連接。只需推送到 GitHub：

```bash
git push origin master
```

Vercel 會自動檢測並開始部署。進度可在 [vercel.com](https://vercel.com) 查看。

### 方案 B：手動部署

```bash
# 安裝 Vercel CLI（如未安裝）
npm i -g vercel

# 登入
vercel login

# 部署
vercel --prod
```

## 第三步：驗證部署

### 檢查部署狀態

1. 訪問 Vercel Dashboard
2. 找到您的部署（應該會顯示綠色 ✓ 成功標誌）
3. 點擊部署卡片查看日誌

### 測試生產環境

1. 訪問您的 Vercel URL：`https://sales-channel-<your-team>.vercel.app`
2. 測試核心功能：
   - [ ] 名單總覽能載入品牌資料
   - [ ] 儀表板能顯示統計數據
   - [ ] 客情維護能顯示客戶清單
   - [ ] 今日跟進能載入任務

## 常見問題排除

### 部署失敗：環境變數錯誤

**症狀：** 部署失敗，日誌顯示 "Supabase URL undefined"

**解決方案：**
1. 確認環境變數已在 Vercel Dashboard 保存
2. 確認變數作用域包括 `Production`
3. 重新部署：`vercel --prod`

### API 返回 401/403

**症狀：** 生產環境中 API 無法連接 Supabase

**解決方案：**
1. 檢查 `SUPABASE_SERVICE_ROLE_KEY` 是否正確
2. 確認 Supabase RLS 策略允許匿名訪問（開發環境）或正確配置認證
3. 檢查 Supabase 專案的 API 限流設置

### 頁面加載緩慢

**症狀：** 生產環境頁面加載較慢

**解決方案：**
1. 檢查 Vercel Analytics（Settings → Analytics）
2. 優化 Supabase 查詢（添加索引）
3. 考慮使用邊際緩存

## 域名設置（可選）

如果您有自己的域名：

1. 進入 Vercel 專案設置 → **Domains**
2. 添加您的域名
3. 按照說明更新 DNS 記錄
4. 等待 DNS 傳播（通常 24 小時內）

## 後續優化

### 1. 啟用 Edge 緩存

在 Vercel 中配置快取：

```
Cache-Control: public, max-age=3600, s-maxage=3600
```

### 2. 監控性能

設置 Vercel Analytics 和 Web Vitals 監控

### 3. 設置預警

配置部署失敗通知（Vercel Dashboard → Notifications）

### 4. 自動化回滾

配置自動回滾：Settings → Deployments → Auto-rollback

## CI/CD 最佳實踐

### Git 工作流

```bash
# 功能分支
git checkout -b feature/name
git push origin feature/name

# 建立 Pull Request
gh pr create

# 合併後自動部署
git merge --squash feature/name
git push origin master  # 自動部署到 Vercel
```

### 預發環境測試

每個 PR 都會自動生成預發環境：
- Vercel 會建立 Preview URL
- 點擊 PR 中的「Visit Preview」測試
- 合併時刪除預發環境

## 生產環境清單

上線前確認：

- [ ] 所有頁面能載入實際資料
- [ ] API 響應時間 < 1 秒
- [ ] 沒有控制台錯誤
- [ ] 手機版本可用
- [ ] 環境變數已設置（Production）
- [ ] HTTPS 已啟用（Vercel 自動）
- [ ] 資料庫備份已啟用（Supabase）
- [ ] 監控告警已配置

## 回滾步驟（如需要）

### 快速回滾

1. Vercel Dashboard → Deployments
2. 找到上一個穩定的部署
3. 點擊「Redeploy」

### Git 回滾

```bash
git revert HEAD
git push origin master
```

## 聯絡支援

- **Vercel 支援：** support@vercel.com
- **Supabase 支援：** https://supabase.com/docs/support

## 下一步

- [ ] 設置使用者認證（Supabase Auth）
- [ ] 啟用實時數據更新（Supabase Realtime）
- [ ] 配置分析和監控
- [ ] 優化圖片和資源
