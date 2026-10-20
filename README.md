# deepseek-chan-sleep-shutdown

任务完成后自动关机 —— 深夜月亮主题的 DeepSeek Harness 插件（零依赖，Windows）。

跑长任务（批量迁移、模型生成、过夜任务）时，点一下右下角的鲸鱼娘按钮，
让 DeepSeek-chan 陪你等到任务结束、再安静睡去：任务成功完成后电脑自动关机，
倒计时期间可一键取消。

[English](README.en.md)

## 形象与设计

- **鲸鱼娘按钮**：圆角胶囊按钮内嵌吉祥物图片（```assets/mascot-awake.webp``` 清醒 / ```assets/mascot-sleep.webp``` 睡觉）
  - 空闲：清醒鲸鱼娘 + 文本「任务完成后关机」
  - 开启：睡觉鲸鱼娘 + 「已开启·任务完成后关机」
- **深夜月亮配色**：底色 #1a1c2e、辅色 #8b8ff5、月牙点缀 #ffd166；玻璃拟态 + 柔光晕
- **开启动效**：呼吸光晕 CSS 动画 + 月牙微光 + 「Zzz」上浮微动效
- **倒计时**：进度环画在按钮外圈（conic-gradient），剩余秒数实时显示在按钮上
- **图片缺失优雅降级**：assets 图片加载失败（onerror）时按钮自动退化为纯文本胶囊，功能不受影响

## 功能

- **可拖动**：拖到任意位置，位置自动记住（localStorage 持久化，视口内钳制）
- **自动避让**：其他插件的角落弹窗与按钮重叠时，按钮自动让开，弹窗消失后归位
- **可取消倒计时**：任务完成 → 60 秒倒计时横幅（深夜配色卡片，实时剩余秒数）
  +「取消关机」按钮（```POST /cancel``` → ```shutdown /a```）；横幅跟随按钮位置
- **新任务打断**：倒计时期间任一会话开始新任务 → 自动撤消关机，模式保持开启
- **取消即退出**：点「取消关机」= 取消本次关机 + 退出模式
- **仅成功时关机**：本批次有会话出错则不关机，横幅提示原因，模式保持开启
- **多会话判定**：全部 root 会话空闲才算任务完成（子代理并入其 root 统计）
- **SPA 自愈**：每 500ms 检查按钮/横幅是否被前端重渲染移除并自动挂回

## 安装

npm（发布后）：

```sh
dsh plugin --profile web add deepseek-chan-sleep-shutdown
```

或从 GitHub：

```sh
dsh plugin --profile web add github:weiplwei/DeepSeek-chan-sleep-shutdown
```

重启 DSH 后生效：右下角出现鲸鱼娘按钮。若按钮未出现，刷新页面（Ctrl+R）。

> 也支持本地路径 / tarball 安装：```dsh plugin --profile web add ./deepseek-chan-sleep-shutdown```

## 使用

1. 点右下角「任务完成后关机」→ 鲸鱼娘入睡、按钮呼吸发光（已开启）；按钮可拖到任意位置
2. 正常跑任务
3. 全部会话空闲且无错误 → 按钮外圈出现进度环，按钮上显示剩余秒数，上方弹出倒计时横幅
4. 倒计时内点「取消关机」→ 本次关机取消、模式退出；不点则到点关机

## 配置

编辑 profile 的 ```cordis.patch.yml```（或设置 > 插件配置）：

```yaml
- id: deepseek-chan-sleep-shutdown
  config:
    countdownSec: 60      # 倒计时秒数（10–600，默认 60）
    marginSec: 5          # 系统 shutdown /t 额外余量（0–60，默认 5）
    onlyOnSuccess: true   # 仅成功时关机（false = 完成即关，含出错）
```

## 行为细节

| 项 | 说明 |
|---|---|
| 触发时机 | 模式开启后，全部 root 会话从 running 回到 idle |
| 成功判定 | 本批次无 ```agent/error```（仅 ```onlyOnSuccess: true``` 时） |
| 倒计时 | ```countdownSec``` 秒，按钮外圈进度环 + 横幅实时显示，可点「取消关机」 |
| 系统指令 | 倒计时开始时执行 ```shutdown /s /t <countdownSec + marginSec>``` |
| 取消方式 | GUI 取消按钮（退出模式）/ 倒计时内发新消息（保持模式） |
| 状态查询 | ```GET http://127.0.0.1:<port>/api/deepseek-chan-sleep-shutdown/state``` |
| 图片路由 | ```GET /api/deepseek-chan-sleep-shutdown/img/sleep.webp``` 与 ```/img/awake.webp```（长缓存，缺失时 404） |

## 运行日志

```$DSH_HOME/deepseek-chan-sleep-shutdown.log```（挂载、武装、触发、取消全记录）。

## 本地验证（test/harness，无需真实 DSH）

```sh
node test/harness/server.js
# 输出监听地址后用浏览器打开，即可看到鲸鱼娘按钮的完整 UI（mock 状态）
```

详见 ```test/harness/README.md```。

## 已知限制

- **仅 Windows**：执行 ```shutdown.exe```；其他平台插件保持惰性并记日志
- 模式状态在内存中：DSH 重启后默认关闭，需重新点按钮
- 页面需刷新一次才出现按钮（脚本随 index 响应注入）
- 鲸鱼娘图片缺失时按钮退化为纯文本（不报错、不影响功能）

## 卸载

```sh
dsh plugin --profile web remove deepseek-chan-sleep-shutdown
```

## 致谢与参考

- 服务端逻辑基于 [dsh-shutdown-after-task](https://github.com/virggle/dsh-shutdown-after-task)（MIT）
- 事件挂接参考 [yang040709/dsh-win-toast-notify](https://github.com/yang040709/dsh-win-toast-notify)（MIT）

## License

MIT
