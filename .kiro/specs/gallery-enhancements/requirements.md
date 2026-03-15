# 需求文档

## 简介

DINO Gallery 是一个基于 Tauri 2 + React + Python FastAPI 的桌面智能图库应用，使用 DINOv2 进行视觉相似度检测，Chinese-CLIP 进行语义搜索。本需求文档涵盖六项增强功能：修复删除图片时的资源清理问题、增加图片排序、移除未使用的 tags 表、增加地图视图、相似图片推荐、以及暗色/亮色主题切换。

## 术语表

- **Gallery_App**: DINO Gallery 桌面应用程序整体
- **Backend**: Python FastAPI 后端 sidecar 进程，负责数据库操作、AI 推理和文件管理
- **Frontend**: React 19 + TypeScript 前端界面
- **Delete_Handler**: 后端处理图片删除请求的模块（`DELETE /api/images/{id}`）
- **Vector_Index**: 基于 numpy NPZ 文件的向量索引存储（包含 DINO 和 CLIP 两个索引）
- **Thumbnail_Manager**: 缩略图生成与管理模块，缩略图存储在 `{data_dir}/thumbnails/` 目录
- **Image_List**: 前端图片列表展示组件，支持虚拟滚动
- **Sort_Controller**: 前端排序控制组件，允许用户选择排序字段和排序方向
- **Schema_Manager**: 数据库 schema 管理模块，包含 schema.sql 和迁移逻辑
- **Map_View**: 地图视图页面，在地图上展示带有 GPS 坐标的照片
- **EXIF_Parser**: EXIF 元数据解析模块，从图片中提取拍摄日期、GPS 坐标等信息
- **Similarity_Engine**: 基于 DINOv2 特征向量的相似图片推荐引擎
- **Theme_Manager**: 主题管理模块，负责暗色/亮色主题的切换与持久化

## 需求

### 需求 1：删除图片时清理向量索引

**用户故事：** 作为用户，我希望删除图片时系统自动清理关联的向量索引数据，以避免孤立数据占用存储空间并影响搜索结果准确性。

#### 验收标准

1. WHEN 用户删除一张图片, THE Delete_Handler SHALL 从 DINO Vector_Index 中移除该图片对应的特征向量
2. WHEN 用户删除一张图片, THE Delete_Handler SHALL 从 CLIP Vector_Index 中移除该图片对应的特征向量
3. WHEN 向量移除完成后, THE Delete_Handler SHALL 将更新后的 Vector_Index 持久化到 NPZ 文件
4. WHEN 删除的图片在 Vector_Index 中不存在对应向量时, THE Delete_Handler SHALL 跳过向量清理步骤并继续完成删除操作
5. WHEN 批量解决重复图片时, THE Delete_Handler SHALL 对每张被删除的图片执行相同的向量清理流程

### 需求 2：删除图片时清理缩略图文件

**用户故事：** 作为用户，我希望删除图片时系统自动清理对应的缩略图文件，以避免磁盘上残留无用文件。

#### 验收标准

1. WHEN 用户删除一张图片, THE Delete_Handler SHALL 删除该图片在 `{data_dir}/thumbnails/` 目录下对应的缩略图文件
2. WHEN 缩略图文件不存在或路径为空时, THE Delete_Handler SHALL 跳过缩略图清理步骤并继续完成删除操作
3. IF 缩略图文件删除失败（如权限问题）, THEN THE Delete_Handler SHALL 记录错误日志并继续完成数据库记录的删除

### 需求 3：图片排序功能

**用户故事：** 作为用户，我希望能够按不同字段对图库中的图片进行排序，以便快速找到需要的图片。

#### 验收标准

1. THE Sort_Controller SHALL 提供以下排序字段选项：导入时间（created_at）、拍摄时间（taken_at）、文件大小（file_size）、文件名（file_path）
2. THE Sort_Controller SHALL 提供升序和降序两种排序方向
3. THE Sort_Controller SHALL 默认使用"导入时间 降序"作为初始排序方式
4. WHEN 用户选择排序字段或排序方向时, THE Image_List SHALL 按照选定的排序条件重新请求并展示图片
5. WHEN 排序字段为 taken_at 且部分图片缺少拍摄时间时, THE Backend SHALL 将缺少拍摄时间的图片排在有拍摄时间的图片之后

### 需求 4：移除未使用的 tags 表

**用户故事：** 作为开发者，我希望移除数据库中未使用的 tags 表及其相关索引，以保持代码库整洁。

#### 验收标准

1. THE Schema_Manager SHALL 从 schema.sql 中移除 tags 表的 CREATE TABLE 语句
2. THE Schema_Manager SHALL 从 schema.sql 中移除 idx_tags_tag 和 idx_tags_image_id 索引的 CREATE INDEX 语句
3. THE Schema_Manager SHALL 在数据库迁移逻辑中添加 DROP TABLE IF EXISTS tags 语句，以清理已有数据库中的 tags 表

### 需求 5：地图视图

**用户故事：** 作为用户，我希望在地图上查看带有 GPS 信息的照片拍摄位置，以便按地理位置浏览照片。

#### 验收标准

1. THE EXIF_Parser SHALL 从图片 EXIF 数据中提取 GPS 纬度和经度信息
2. WHEN 图片包含有效 GPS 坐标时, THE Backend SHALL 将纬度和经度存储到 images 表的 latitude 和 longitude 字段
3. THE Backend SHALL 提供 API 端点返回所有包含 GPS 坐标的图片列表（含 id、latitude、longitude、thumbnail）
4. THE Map_View SHALL 使用交互式地图组件展示照片标记点
5. WHEN 用户点击地图上的照片标记时, THE Map_View SHALL 显示该照片的缩略图预览
6. WHEN 图片不包含 GPS 信息时, THE Map_View SHALL 不在地图上显示该图片
7. THE Frontend SHALL 在侧边栏导航中添加"Map"入口链接到 Map_View 页面

### 需求 6：相似图片推荐

**用户故事：** 作为用户，我希望在查看某张图片时能看到视觉上相似的图片推荐，以便发现相关照片。

#### 验收标准

1. THE Similarity_Engine SHALL 提供 API 端点，接收一个 image_id 并返回视觉上最相似的图片列表
2. THE Similarity_Engine SHALL 使用 DINOv2 Vector_Index 中的特征向量计算余弦相似度
3. THE Similarity_Engine SHALL 返回相似度最高的前 12 张图片（不包含查询图片自身）
4. WHEN 查询图片在 Vector_Index 中不存在特征向量时, THE Similarity_Engine SHALL 返回空列表
5. THE Frontend SHALL 在图片查看器（ImageViewer）中展示相似图片推荐区域
6. WHEN 用户点击推荐的相似图片时, THE Frontend SHALL 切换到该图片的查看视图

### 需求 7：暗色/亮色主题切换

**用户故事：** 作为用户，我希望能够在暗色和亮色主题之间切换，以适应不同的使用环境和个人偏好。

#### 验收标准

1. THE Theme_Manager SHALL 提供暗色（dark）和亮色（light）两种主题模式
2. THE Theme_Manager SHALL 在 Settings 页面提供主题切换控件
3. WHEN 用户切换主题时, THE Frontend SHALL 立即应用新主题的配色方案，无需刷新页面
4. THE Theme_Manager SHALL 将用户选择的主题偏好持久化到本地存储（localStorage）
5. WHEN 应用启动时, THE Theme_Manager SHALL 从本地存储读取并应用用户之前选择的主题
6. WHEN 本地存储中无主题偏好记录时, THE Theme_Manager SHALL 默认使用暗色主题
7. THE Frontend SHALL 使用 CSS 变量定义主题色值，亮色主题使用浅色背景和深色文字配色方案
