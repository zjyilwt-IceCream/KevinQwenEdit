# KevinQwenEdit · Qwen Image 2.1 换头与姿势编辑

把普通图片编辑、BFS 换头和 Fisher 自由姿势编辑放进一个 ComfyUI 工作流。换头、姿势、PE 提示词增强各有独立开关，不需要切换连线。输出默认保持主图比例、短边 1024，也可以指定宽高。

**姿势编辑器点击“应用到节点”后，节点立即显示人偶预览；保存工作流后再次打开也会恢复。预览无需启动图像生成。**

This package provides four lightweight ComfyUI helper nodes and an example Qwen Image 2.1 workflow for image editing, BFS head swapping, and Fisher pose editing. Model weights and third-party extensions are installed separately.

## 先看使用说明

- [完整安装、模型下载、使用方式与常见问题](docs/使用说明.md)
- [下载工作流 JSON](workflows/KEVIN-QwenImage2.1%20换头+姿势调整编辑整合流.json)（打开后点 Raw / Download raw file）
- [验证记录](docs/验证记录.md)
- [第三方来源与许可](THIRD_PARTY_NOTICES.md)

## 四种模式

| 换头 | 姿势 | 行为 |
| --- | --- | --- |
| 关 | 关 | 按主图片和提示词进行普通图像编辑 |
| 开 | 关 | 使用 BFS Head V1.1 替换主图人物的头部 |
| 关 | 开 | 使用 Fisher 人偶姿势和 VNCCS PoseStudio LoRA 调整人物姿态 |
| 开 | 开 | 先调整姿势，再换头，自动执行两个阶段 |

PE 开关独立工作，支持 TE MAN 的本地官方 PE 或兼容的自定义视觉模型。默认 PE 关闭，增强方式预选本地官方 PE；API 配置为空。

## 安装本节点

在 `ComfyUI/custom_nodes` 中运行：

```bash
git clone https://github.com/zjyilwt-IceCream/KevinQwenEdit.git ComfyUI-KevinQwenEdit
```

也可以用 GitHub 的 **Code → Download ZIP**，解压并把文件夹改名为 `ComfyUI-KevinQwenEdit`，放进 `custom_nodes`。确认 `__init__.py` 位于该文件夹第一层。已有同名旧副本时先备份到 `custom_nodes` 外，避免重复加载。

本节点使用 ComfyUI 已有的 PyTorch、NumPy 和 Pillow。若启动提示缺少 NumPy/Pillow，用 **ComfyUI 自己的 Python** 安装本仓库 `requirements.txt`。无需为本节点重新安装 CUDA 或 PyTorch。

完整示例还需要以下扩展，安装后重启 ComfyUI 并刷新页面：

| 扩展 | 用途 |
| --- | --- |
| [ComfyUI-Fisher-Pose](https://github.com/Work-Fisher/ComfyUI-Fisher-Pose) | 三维人偶编辑器；文件夹必须叫 `ComfyUI-Fisher-Pose` |
| [TE_MAN](https://github.com/tl2012tl/TE_MAN) | 官方/自定义 PE、最终提示词显示 |
| [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) | Set/Get 无线连接 |
| [rgthree-comfy](https://github.com/rgthree/rgthree-comfy) | 原图和结果对比 |

**完整工作流目前在 Windows、Python 3.12.10 上验证。** TE_MAN 上游当前说明支持 Python 3.12/3.13，发布内容包含 Windows `.pyd`；其他系统应先确认 TE_MAN 的可用版本。KevinQwenEdit 本身的源码开放，不代表这些外部依赖使用相同许可。

模型清单与下载地址见[完整说明](docs/使用说明.md)。BFS 是 [Hugging Face 上的 LoRA 模型](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap)，无需安装另一个 BFS 自定义节点。

## 开始使用

1. 把工作流 JSON 拖入 ComfyUI，或存到 `ComfyUI/user/default/workflows` 后打开。
2. 在模型区域选择已经下载的主模型、编码器、VAE 和 LoRA。上传自己的主图片。
3. 按需开启换头、姿势、PE；开启换头时上传头部参考；开启姿势时打开编辑器、摆好人偶并点击“应用到节点”。
4. 确认节点上的人偶预览、输出尺寸和编辑要求，运行工作流。

结果保存在 `ComfyUI/output/KEVIN-QwenImage2.1-换头姿势/`。分享版不附带人物素材，首次导入需要上传自己的图片。

## 提供的节点

| 节点名 | 作用 |
| --- | --- |
| `KevinQwenCanvas` / KEVIN · 统一输出尺寸 | 按主图比例与短边或自定义宽高生成统一画布；宽高对齐 32 |
| `KevinQwenPoseImage` / KEVIN · 自由姿势编辑器 | 调用 Fisher 编辑页面，保存姿势，显示预览并输出人偶图 |
| `KevinQwenTaskPrompt` / KEVIN · 任务指令 | 为姿势、换头阶段保留对应的参考图顺序与任务前缀 |
| `KevinQwenHeadReference` / KEVIN · 头部参考图 | 关闭换头时允许缺省头部图片 |

本仓库负责流程衔接和界面控制。图像生成、换头 LoRA、姿势编辑器、PE 模型分别由其上游项目提供。

## 更新

在 `ComfyUI/custom_nodes/ComfyUI-KevinQwenEdit` 内执行 `git pull --ff-only`，随后重启 ComfyUI、刷新浏览器。ZIP 安装用户可下载新版后替换本节点文件夹，先保留自己的修改。

## 开发与限制

自动开关和 PE 同步依赖示例工作流中的 `kevin_qwen_role`、`kevin_qwen_branch` 属性；单独放入三个布尔节点不会自动建立模式控制。Fisher 编辑器通过同源 iframe 通信。人偶预览写入当前 ComfyUI 的 `temp` 目录，不发送到第三方服务。

界面开关会在浏览器导出任务时同步。直接调用后端 `/prompt` 的脚本需要自行构造正确分支，不能假定后端会执行前端 JavaScript。姿势数据中的 `poseReference` 必须与人偶状态一起保存，不能只修改关节 JSON 而沿用旧截图。

默认 1024 短边已在 16GB 显存环境测试。双开需要两轮采样；更大画布、其他量化和其他环境尚需单独验证。模型属于生成式编辑，小脸、手指、遮挡和背景可能变化。

## 许可

本仓库原创代码和文档采用 [MIT License](LICENSE)。编辑器桥接及预览集成参考并适配了 Work-Fisher 的 MIT 代码，许可副本保留在 [licenses/Work-Fisher-MIT.txt](licenses/Work-Fisher-MIT.txt)。模型和其他扩展遵循各自许可，详见[第三方说明](THIRD_PARTY_NOTICES.md)。
