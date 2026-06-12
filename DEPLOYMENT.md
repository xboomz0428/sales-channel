# HeroHerb 銷售通路系統 - 部署指南

## 前置條件

- GitHub 帳號
- Vercel 帳號（可用 GitHub 帳號註冊）
- Supabase 帳號（可選，用於資料庫）
- Google Places API Key

## 第一步：上傳到 GitHub

### 1.1 建立 GitHub Repository

1. 前往 [github.com/new](https://github.com/new)
2. 填入以下信息：
   - **Repository name**: `sales-channel`
   - **Description**: HeroHerb B2B 銷售通路開發系統
   - **Visibility**: 選擇 Public 或 Private
   - **Initialize with**: **不勾選任何選項**（因為本地已有文件）
3. 點擊「Create repository」

### 1.2 推送本地 Code 到 GitHub

複製下面的命令，將 `<your-username>` 替換為你的 GitHub 用戶名：

```bash
cd "C:\Users\Username\sales-channel"

# 添加遠程倉庫
git remote add origin https://github.com/<your-username>/sales-channel.git

# 重命名分支為 main（如果還不是）
git branch -M main

# 推送到 GitHub
git push -u origin main
```

完成後，你可以在 GitHub 上看到所有代碼。

---

## 第二步：部署到 Vercel

### 2.1 連接 GitHub 到 Vercel

1. 前往 [vercel.com/dashboard](https://vercel.com/dashboard)
2. 使用 GitHub 帳號登入（如果還未登入）
3. 點擊「Add New」→「Project」

### 2.2 導入 Repository

1. 在「Import Git Repository」部分
2. 搜尋並選擇 `sales-channel` repository
3. 點擊「Import」

### 2.3 配置環境變數

在「Environment Variables」部分，添加以下變數：

#### 必須配置

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=your-google-places-key
```

#### 取得 Supabase 密鑰

1. 前往 [supabase.com](https://supabase.com)
2. 登入後，點擊你的 Project
3. 進入「Settings」→「API」
4. 複製以下信息：
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon (public) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role (secret) → `SUPABASE_SERVICE_ROLE_KEY`

#### 取得 Google Places API Key

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新 Project
3. 啟用「Places API」
4. 建立「API Key」認證
5. 複製 API Key → `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`

### 2.4 完成部署

1. 確認所有環境變數已設置
2. 點擊「Deploy」
3. 等待部署完成（通常 2-5 分鐘）
4. 部署完成後，你會獲得一個 Vercel URL

---

## 第三步：自動部署設置

### Vercel 自動部署

每次你推送 code 到 GitHub `main` 分支時，Vercel 會自動：
1. 檢測到新的 Push
2. 運行 `npm run build`
3. 部署到生產環境

### 查看部署日誌

1. 前往 Vercel Dashboard
2. 選擇 `sales-channel` Project
3. 點擊「Deployments」查看部署歷史
4. 點擊任何部署查看完整日誌

---

## 第四步：設置資料庫（Supabase）

### 4.1 初始化資料庫結構

1. 在 Supabase 中建立 SQL Editor
2. 運行以下 SQL 創建表格：

```sql
-- 商家名單表
CREATE TABLE leads (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  industry VARCHAR(100),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 品牌表
CREATE TABLE brands (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  industry VARCHAR(100),
  store_count INTEGER,
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 商機表
CREATE TABLE opportunities (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT REFERENCES brands(id),
  potential_value DECIMAL(12, 2),
  expected_close_date DATE,
  probability INTEGER,
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 跟進記錄表
CREATE TABLE follow_ups (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT REFERENCES leads(id),
  contact_method VARCHAR(50),
  status VARCHAR(50),
  due_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 啟用 Row Level Security（RLS）

1. 在 Supabase 中，為每個表啟用 RLS
2. 創建適當的 RLS 策略

---

## 常見問題

### Q: 如何更新已部署的應用？
**A:** 在本地修改代碼後：
```bash
git add .
git commit -m "Your commit message"
git push origin main
```
Vercel 會自動偵測並部署。

### Q: 如何回滾到之前的版本？
**A:** 在 Vercel Dashboard 的 Deployments 頁面，點擊想要的版本，選擇「Redeploy」。

### Q: 如何增加 Custom Domain？
**A:** 
1. 在 Vercel Project Settings
2. 進入「Domains」
3. 添加你的自定義域名
4. 按照指示更新 DNS 記錄

### Q: 環境變數何時更新？
**A:** 修改環境變數後，新的部署會使用更新的變數。舊部署不受影響。

### Q: 如何查看應用日誌？
**A:** 
1. Vercel Dashboard → Project → Deployments
2. 點擊「Logs」標籤查看實時日誌

---

## 監控與維護

### 性能監控

- **Vercel Analytics**: 自動追蹤核心網頁關鍵指標
- **定期檢查**: 每週查看 Deployment 日誌和錯誤報告

### 安全檢查

- ✅ 定期更新 npm 依賴: `npm update`
- ✅ 檢查安全漏洞: `npm audit`
- ✅ 環境變數只在 Vercel 中配置，不提交到 Git

### 備份

- GitHub 自動保存所有版本歷史
- Supabase 提供自動備份功能

---

## 下一步

1. ✅ 上傳到 GitHub
2. ✅ 部署到 Vercel
3. 配置 Supabase 資料庫
4. 集成 Google Places API
5. 測試完整功能
6. 邀請團隊成員協作

---

## 需要幫助？

- Vercel 文件: https://vercel.com/docs
- Next.js 文件: https://nextjs.org/docs
- Supabase 文件: https://supabase.com/docs
- GitHub 文件: https://docs.github.com

聯繫: xboomz@gmail.com
