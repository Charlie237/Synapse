# 实施计划：Gallery 增强功能

## 概述

按照设计文档，分阶段实现七项增强功能。先完成后端数据完整性修复（向量清理、缩略图清理、移除 tags 表），再实现排序功能，然后是地图视图和相似图片推荐，最后是主题切换。每个阶段都包含对应的测试任务。

## 任务

- [x] 1. 向量索引清理与缩略图清理（需求 1 & 2）
  - [x] 1.1 在 `backend/core/indexer.py` 中实现 `remove_from_dino_index` 和 `remove_from_clip_index` 函数
    - 从内存字典中删除指定 image_id 的向量
    - 重新保存 NPZ 文件
    - 若 image_id 不存在则静默跳过，返回 bool 表示是否实际移除
    - _需求：1.1, 1.2, 1.3, 1.4_

  - [ ]* 1.2 编写向量索引移除的属性测试
    - **属性 1：向量索引移除** — 移除后 image_id 不在索引中，其他条目不变
    - **验证需求：1.1, 1.2**

  - [ ]* 1.3 编写向量索引移除持久化往返的属性测试
    - **属性 2：向量索引移除持久化往返** — 移除后保存再加载，被移除的 ID 不存在，其余条目完整
    - **验证需求：1.3**

  - [x] 1.4 增强 `backend/api/images.py` 的 `DELETE /api/images/{image_id}` 端点

  - [x] 1.5 增强 `backend/api/duplicates.py` 的 `resolve_duplicates` 端点
    - 对每个 `delete_ids` 中的图片执行相同的向量清理和缩略图清理流程
    - _需求：1.5, 2.1_

  - [ ]* 1.6 编写批量删除清理向量的属性测试
    - **属性 3：批量删除清理所有向量** — 批量删除后 DINO 和 CLIP 索引中不包含任何 delete_ids
    - **验证需求：1.5**

  - [ ]* 1.7 编写删除时清理缩略图的属性测试
    - **属性 4：删除时清理缩略图文件** — 删除后缩略图文件不存在于磁盘
    - **验证需求：2.1**

- [x] 2. 检查点 — 确保所有测试通过

- [x] 3. 移除 tags 表（需求 4）
  - [x] 3.1 修改 `backend/db/schema.sql`
    - 移除 `CREATE TABLE IF NOT EXISTS tags` 语句
    - 移除 `CREATE INDEX IF NOT EXISTS idx_tags_tag` 和 `idx_tags_image_id` 索引语句
    - _需求：4.1, 4.2_

  - [x] 3.2 在 `backend/db/database.py` 的迁移逻辑中添加 `DROP TABLE IF EXISTS tags`
    - _需求：4.3_

- [x] 4. 图片排序功能（需求 3）
  - [x] 4.1 修改 `backend/db/queries.py` 的 `get_images_paginated` 函数
    - 新增 `sort_by` 和 `sort_order` 参数
    - `sort_by` 白名单：`created_at`、`taken_at`、`file_size`、`file_path`，无效值回退到 `created_at`
    - `sort_order` 白名单：`asc`、`desc`，无效值回退到 `desc`
    - `taken_at` 排序时 NULL 值排在最后（使用 `CASE WHEN ... IS NULL THEN 1 ELSE 0 END`）
    - _需求：3.3, 3.4, 3.5_

  - [x] 4.2 修改 `backend/api/images.py` 的 `GET /api/images` 端点
    - 新增 `sort_by` 和 `sort_order` 查询参数，传递给 `get_images_paginated`
    - _需求：3.4_

  - [ ]* 4.3 编写排序结果有序性的属性测试
    - **属性 5：排序结果有序性** — 对任意有效排序字段和方向，返回结果严格有序
    - **验证需求：3.4**

  - [ ]* 4.4 编写 taken_at NULL 排序的属性测试
    - **属性 6：taken_at 为 NULL 时排在最后** — 无论升序降序，NULL 值排在有值记录之后
    - **验证需求：3.5**

  - [x] 4.5 在 `src/pages/GalleryPage.tsx` 中添加排序控件（Sort_Controller）
    - 在 header 区域添加排序字段下拉菜单（导入时间、拍摄时间、文件大小、文件名）
    - 添加排序方向切换按钮（升序/降序）
    - 默认"导入时间 降序"
    - _需求：3.1, 3.2, 3.3_

  - [x] 4.6 修改 `src/api/client.ts` 的 `getImages` 方法
    - 新增 `sort_by` 和 `sort_order` 参数，拼接到请求 URL
    - _需求：3.4_

- [x] 5. 检查点 — 确保所有测试通过

- [x] 6. 地图视图（需求 5）
  - [x] 6.1 数据库 schema 变更
    - 在 `backend/db/schema.sql` 的 images 表中添加 `latitude REAL` 和 `longitude REAL` 字段
    - 在 `backend/db/database.py` 迁移逻辑中添加 `ALTER TABLE images ADD COLUMN latitude REAL` 和 `ALTER TABLE images ADD COLUMN longitude REAL`
    - _需求：5.2_

  - [x] 6.2 修改 `backend/core/pipeline.py` 的 EXIF 提取逻辑
    - 将 `read_exif_date` 重构为 `read_exif_metadata`，同时返回日期和 GPS 坐标
    - 从 EXIF GPSInfo tag（tag ID 34853）提取 GPS 数据，将 DMS 格式转换为十进制度数
    - GPS 坐标超出有效范围（纬度 ±90，经度 ±180）时视为无效，返回 None
    - 更新 `import_image_fast` 函数调用和 `insert_image` 调用以传递 latitude/longitude
    - _需求：5.1, 5.2_

  - [x] 6.3 修改 `backend/db/queries.py` 的 `insert_image` 函数
    - 新增 `latitude` 和 `longitude` 参数
    - 更新 INSERT 语句
    - _需求：5.2_

  - [ ]* 6.4 编写 GPS EXIF 提取准确性的属性测试
    - **属性 7：GPS EXIF 提取准确性** — 提取的坐标与 EXIF 编码的原始值一致（浮点精度内）
    - **验证需求：5.1**

  - [x] 6.5 创建 `backend/api/map.py`，实现 `GET /api/map/images` 端点
    - 返回所有 latitude 和 longitude 均非 NULL 的图片
    - 返回字段：id、latitude、longitude、thumbnail
    - 在 `backend/api/routes.py` 中注册路由
    - _需求：5.3, 5.6_

  - [ ]* 6.6 编写地图 API GPS 过滤的属性测试
    - **属性 8：地图 API 精确过滤 GPS 图片** — 返回集合恰好等于 latitude 和 longitude 均非 NULL 的图片集合
    - **验证需求：5.3, 5.6**

  - [x] 6.7 安装前端依赖并创建 `src/pages/MapPage.tsx`
    - 安装 `leaflet`、`react-leaflet`、`@types/leaflet`
    - 使用 leaflet + OpenStreetMap 瓦片渲染交互式地图
    - 地图标记点点击时显示缩略图弹窗
    - _需求：5.4, 5.5_

  - [x] 6.8 修改 `src/api/client.ts` 添加地图 API 方法
    - 添加 `getMapImages` 方法和 `MapImage` 类型
    - _需求：5.3_

  - [x] 6.9 在侧边栏和路由中集成 MapPage
    - 在 `src/components/Sidebar.tsx` 的 `libraryItems` 中添加 Map 入口
    - 在 `src/App.tsx` 中添加 `/map` 路由
    - _需求：5.7_

- [x] 7. 检查点 — 确保所有测试通过

- [x] 8. 相似图片推荐（需求 6）
  - [x] 8.1 创建 `backend/api/similar.py`，实现 `GET /api/images/{image_id}/similar` 端点
    - 从 DINO 索引获取目标图片特征向量
    - 调用 `search_dino_index` 搜索最相似的 `limit + 1` 张图片
    - 过滤掉查询图片自身，返回前 `limit`（默认 12）张结果
    - 图片不在索引中时返回空列表
    - 图片不存在时返回 HTTP 404
    - 在 `backend/api/routes.py` 中注册路由
    - _需求：6.1, 6.2, 6.3, 6.4_

  - [ ]* 8.2 编写相似图片 API 约束的属性测试
    - **属性 9：相似图片 API 约束** — 结果数量 ≤ 12，不含查询图片，分数在 [-1,1]，按相似度降序
    - **验证需求：6.1, 6.2, 6.3**

  - [x] 8.3 修改 `src/api/client.ts` 添加相似图片 API 方法
    - 添加 `getSimilarImages` 方法和 `SimilarImage` 类型
    - _需求：6.1_

  - [x] 8.4 在 `src/components/ImageViewer.tsx` 中添加相似图片推荐区域
    - 在图片查看器底部添加可折叠的相似图片区域
    - 使用水平滚动的缩略图列表展示
    - 点击推荐图片时切换到该图片的查看视图
    - _需求：6.5, 6.6_

- [x] 9. 暗色/亮色主题切换（需求 7）
  - [x] 9.1 修改 `src/styles/globals.css`，定义两套 CSS 变量
    - `:root` 定义亮色主题变量（浅色背景、深色文字）
    - `.dark` 定义暗色主题变量（当前配色方案作为基础）
    - _需求：7.7_

  - [x] 9.2 创建 `src/hooks/useTheme.tsx`
    - 实现 `ThemeProvider` 和 `useTheme` hook
    - 通过在 `<html>` 元素上切换 `dark` class 来切换主题
    - 主题偏好存储在 `localStorage` 的 `theme` key 中
    - 默认暗色主题
    - localStorage 不可用或值无效时回退到暗色主题
    - _需求：7.3, 7.4, 7.5, 7.6_

  - [ ]* 9.3 编写主题持久化往返的属性测试
    - **属性 10：主题持久化往返** — 设置主题后从 localStorage 读取返回相同值
    - **验证需求：7.4, 7.5**

  - [x] 9.4 在 `src/App.tsx` 中集成 `ThemeProvider`
    - 用 `ThemeProvider` 包裹应用
    - 将硬编码的暗色样式类替换为 CSS 变量引用
    - _需求：7.3_

  - [x] 9.5 在 `src/pages/SettingsPage.tsx` 中添加主题切换控件
    - 提供暗色/亮色主题选择
    - 切换时立即应用，无需刷新
    - _需求：7.1, 7.2_

- [x] 10. 最终检查点 — 确保所有测试通过

## 备注

- 标记 `*` 的任务为可选测试任务，可跳过以加快 MVP 进度
- 每个任务都引用了对应的需求编号以确保可追溯性
- 属性测试后端使用 `hypothesis` 库，前端使用 `fast-check` 库
- 检查点任务用于阶段性验证，确保增量正确性
