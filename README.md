# 基米杀 / Kimi Kill

## 中文

基米杀是一个浏览器里的猫猫卡牌小游戏，玩法灵感接近身份局、对抗局和爆炸求生局的混合体。项目目前是纯前端实现，不需要构建步骤，直接用浏览器打开或通过本地静态服务访问即可游玩。

### 当前功能

- 单机模式：支持经典五猫争霸、1v1 极速喵斗、1v1 至尊猫王对决、爆炸猫窝。
- 联机模式：基于 PeerJS 点对点连接，支持建房、加入房间、房主广播、断线提示和机器人补位。
- 联机同步：客户端只接收必要的公开状态和自己的手牌；牌堆会以数量/风险摘要同步，减少延迟和信息泄露。
- 联机质量面板：游戏内会显示到房主的延迟、最近同步包大小、同步时间和在线情况，方便判断卡顿来源。
- 掉线回座：游戏中掉线会先变红灯并交给机器人托管，使用同一浏览器和昵称重新加入可回到原座位。
- 角色系统：每只猫有不同血量、技能和角色说明。
- 卡牌系统：包含攻击、防御、回血、锦囊、爆炸牌、埋屎牌等。
- 体验元素：角色图片、卡牌图片、音效、BGM、行动提示、结算奖项和移动端适配。
- 资源优化：默认使用 `assets/optimized/` 中的轻量 JPG 图，原始 PNG 保留在 `assets/` 下便于后续重新导出。

### 启动方式

最简单的方式是直接打开 `index.html`。

如果浏览器限制本地资源加载，可以在项目目录启动一个静态服务：

```bash
python -m http.server 8765
```

然后访问：

```text
http://localhost:8765/index.html
```

### 联机配置

项目默认只内置公开 STUN 配置，避免把 TURN 账号、密码等长期凭据暴露在前端源码里。默认配置位于 `net-config.js`：

```js
window.KIMI_NET_CONFIG = {
    debug: 1,
    config: {
        iceServers: [
            { urls: "stun:stun.relay.metered.ca:80" }
        ]
    }
};
```

如果需要更稳定的跨网络联机，可以参考 `net-config.example.js`，在本地把自己的 TURN 服务加入 `iceServers`。不要把真实 TURN 用户名和密码提交到公开仓库或公开网页中。

### 项目结构

```text
index.html          页面结构和脚本入口
style.css           页面样式和移动端布局
data.js             卡牌、角色、BGM 等静态数据
net-config.js       PeerJS / WebRTC 网络配置
net.js              联机房间、连接、广播和断线处理
game.js             核心规则、回合、结算、机器人和渲染入口
game-ui-helpers.js  卡牌推荐、行动提示、爆炸风险和角色说明
assets/             角色图、卡牌图、音效和 BGM
```

### 开发建议

- 继续拆分 `game.js`：下一步可以拆出 `game-rules.js`、`game-bots.js`、`game-render.js`。
- 给核心规则加轻量测试：优先覆盖摸牌、死亡结算、爆炸牌、响应流程。
- 联机发布前需要单独处理 TURN 凭据：推荐由后端临时签发，或只在私有部署中填写。
- 如果首局图片加载仍慢，可以把 `assets/` 放到更快的静态托管或 CDN；游戏会在菜单阶段提前预热图片。
- 当前轻量图约 0.77MB，原始 PNG 约 8.04MB；如果要进一步优化，可以换成 WebP/AVIF 导出流程。
- 双端联机实测请按 `docs/联机测试清单.md` 执行。
- 基础规则 smoke test 可打开 `tests/smoke-tests.html` 运行。
- 如果要公开发布，建议固定 PeerJS 依赖来源，或把依赖下载到本地以降低 CDN 风险。

## English

Kimi Kill is a browser-based cat card game that mixes hidden-role combat, duel modes, and an exploding-deck survival mode. The project is currently implemented as a static frontend app, so it does not require a build step.

### Features

- Single-player modes: classic five-cat match, fast 1v1 duel, supreme cat king duel, and exploding cat room.
- Multiplayer mode: PeerJS-based peer-to-peer rooms with host broadcast, joining, disconnect notices, and bot filling.
- Multiplayer sync: clients receive only necessary public state plus their own hands; deck details are reduced to count/risk metadata to lower latency and avoid information leaks.
- Connection quality panel: the in-game UI shows host latency, recent sync payload size, sync age, and online status to help diagnose lag.
- Reconnect to seat: disconnected players turn red and are temporarily controlled by a bot; joining again from the same browser and nickname can restore the original seat.
- Hero system: each cat has unique health, skills, and flavor text.
- Card system: attack, defense, healing, tactic cards, exploding cards, defuse cards, and more.
- Presentation: hero art, card art, sound effects, BGM, action hints, end-game awards, and mobile-friendly layout.
- Asset optimization: the game uses lightweight JPG files under `assets/optimized/` by default, while original PNG files remain under `assets/` for future exports.

### Running The Game

The simplest way is to open `index.html` in a browser.

If your browser restricts local asset loading, start a static server from the project directory:

```bash
python -m http.server 8765
```

Then open:

```text
http://localhost:8765/index.html
```

### Multiplayer Configuration

The project now ships with a public STUN-only default config so TURN usernames and passwords are not hard-coded into frontend source. The default config lives in `net-config.js`:

```js
window.KIMI_NET_CONFIG = {
    debug: 1,
    config: {
        iceServers: [
            { urls: "stun:stun.relay.metered.ca:80" }
        ]
    }
};
```

For more reliable connectivity across strict networks, copy `net-config.example.js` and add your own TURN server to `iceServers` in a private/local deployment. Do not commit real TURN credentials to a public repository or expose them on a public static site.

### Project Structure

```text
index.html          Page structure and script entry
style.css           Styling and responsive layout
data.js             Static cards, heroes, and BGM data
net-config.js       PeerJS / WebRTC network configuration
net.js              Multiplayer rooms, connections, broadcasts, disconnect handling
game.js             Core rules, turns, settlement, bots, and render entry points
game-ui-helpers.js  Card recommendations, action hints, explosion risk, hero metadata
assets/             Hero images, card images, sound effects, and BGM
```

### Development Notes

- Continue splitting `game.js`: good next targets are `game-rules.js`, `game-bots.js`, and `game-render.js`.
- Add lightweight tests for core rules: drawing, death settlement, explosion cards, and response flows first.
- Handle TURN credentials separately before publishing multiplayer: use temporary server-issued credentials or private deployment-only values.
- If first-game image loading is still slow, host `assets/` on faster static storage or a CDN; the game now warms up images from the menu stage.
- The lightweight images are about 0.77 MB versus about 8.04 MB for the original PNG set; WebP/AVIF export would be the next step for even better compression.
- Run the two-client multiplayer checklist in `docs/联机测试清单.md`.
- Open `tests/smoke-tests.html` for basic rule smoke tests.
- For public releases, consider pinning or vendoring PeerJS instead of relying only on a CDN.
