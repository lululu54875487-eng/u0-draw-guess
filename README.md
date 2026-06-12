# 小u0畫畫猜猜

可愛低飽和水藍色風格的「你畫我猜」網頁遊戲第一版。玩家可以開房間，把連結貼到 LINE，朋友點進來就能一起畫畫猜答案。

## 功能

- 開新房間與房間邀請連結
- 玩家暱稱、玩家列表與分數
- HTML Canvas 手機觸控畫畫
- Socket.IO 即時同步畫筆、清空畫布、猜答案與聊天
- 房主開始/下一題
- 房主可選題庫分類：全部混合、食物飲料、生活小物、可愛動物、聚會搞笑、只玩自訂題目
- 房主可新增自訂題目，一行一題
- 每回合 80 秒倒數
- 浮水印：`creat by 璐璐璐 · Yuna 團購群專用 · 請勿外流`

## 本機執行

需要 Node.js 18 以上。

```sh
npm install
npm start
```

開啟：

```text
http://localhost:3000
```

## 部署

這個專案需要可長時間執行 Node.js 的服務，因為 Socket.IO 要維持即時連線。可以部署到 Render、Railway、Fly.io 或其他 Node.js 主機。

基本設定：

- Build command: `npm install`
- Start command: `npm start`
- Port: 使用平台提供的 `PORT` 環境變數，程式已支援

## 專案結構

```text
server.js
public/
  index.html
  styles.css
  client.js
```
