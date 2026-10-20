# test/harness — 本地 UI 验证 / Local UI harness

零依赖 Node HTTP 服务器（随机端口），用于在不启动真实 DSH 的情况下验证
deepseek-chan-sleep-shutdown 的完整前端：

- `GET /` — 深色 index 页，注入插件真实 UI_JS（等同 tapIndex 效果）
- `GET /api/deepseek-chan-sleep-shutdown/ui.js` — 返回 `index.js` 导出的 UI_JS
- `GET /api/deepseek-chan-sleep-shutdown/img/sleep.webp` / `awake.webp` — 读包内 assets（缺失 404，按钮降级）
- `GET /api/deepseek-chan-sleep-shutdown/state` — mock 状态 JSON
- `POST /arm` / `/disarm` / `/cancel` — 更新 mock 状态
- `POST /demo-countdown` / `/demo-fired` — 演示倒计时进度环与 fired 横幅

## 启动 / Launch

```sh
node test/harness/server.js
```

输出监听地址（随机端口），浏览器打开即可看到鲸鱼娘按钮：

## UI_JS 语法门禁 / Syntax gate

```sh
node test/harness/check-ui.js
```

把 index.js 导出的 UI_JS 写入临时文件并跑 `node --check`：
exit 0 = 注入脚本可执行（HTTP 200 本身不证明 JS 可执行，验收必须过这一步）。


- 初始：清醒形象 + 「任务完成后关机」
- 点按钮 / POST /arm：入睡形象 + 呼吸光晕 + Zzz + 月牙点亮
- POST /demo-countdown：按钮外圈 conic-gradient 进度环 + 按钮上剩余秒数
- POST /cancel：横幅消失、回到空闲

## English

Zero-dependency Node http server on a random port serving the plugin's real
UI_JS with mock state. Launch with `node test/harness/server.js` and open the
printed URL. No DSH, no shutdown.exe — POST routes only mutate the mock.
