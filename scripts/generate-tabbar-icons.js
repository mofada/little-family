// 生成小程序自定义 TabBar 图标：挂历/印章语言的自绘线条图标。
// 24×24 设计网格，统一 1.5 描边、方头线帽，输出 81×81（3 倍图）。
const fs = require('fs');
const path = require('path');

const shapes = {
  // 屋檐 + 门
  home: `
    <path d="M3.4 10.9 12 3.9l8.6 7" />
    <path d="M6 10.9v9.6h12v-9.6" />
    <path d="M10.4 20.5v-5.4h3.2v5.4" />`,
  // 一个祖先节点分叉成两个孩子
  tree: `
    <circle cx="12" cy="4.7" r="1.7" />
    <path d="M12 6.4v4.4" />
    <path d="M12 10.8 6.9 15.4M12 10.8l5.1 4.6" />
    <circle cx="6.6" cy="17.1" r="1.7" />
    <circle cx="17.4" cy="17.1" r="1.7" />`,
  // 时间轴：一条线、两个刻度、一个“此刻”实心点
  timeline: `
    <path d="M4.6 12h14.8" />
    <path d="M7.7 9.9v4.2M16.3 9.9v4.2" />
    <circle cx="12" cy="12" r="1.6" fill="COLOR" stroke="none" />`,
  // 日历格 + 一个被标记的日子
  birthday: `
    <rect x="4.2" y="6" width="15.6" height="14.4" rx="0.6" />
    <rect x="4.2" y="9.7" width="15.6" height="1.7" fill="COLOR" stroke="none" />
    <rect x="10.7" y="14.6" width="2.6" height="2.6" fill="COLOR" stroke="none" />`,
  // 印章方框里一个人
  profile: `
    <rect x="3.9" y="3.9" width="16.2" height="16.2" rx="0.8" />
    <circle cx="12" cy="9.7" r="2.5" />
    <path d="M7.7 18.1c.8-2.7 2.3-4.1 4.3-4.1s3.5 1.4 4.3 4.1" />`
};

const colors = [
  { suffix: '', color: '#9b7b74' },
  { suffix: '-active', color: '#d4756a' }
];

const outputDir = path.join(__dirname, '../apps/miniprogram/assets/tabbar');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const render = (body, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="81" height="81" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">${body.replace(/COLOR/g, color)}
</svg>
`;

for (const [name, body] of Object.entries(shapes)) {
  for (const { suffix, color } of colors) {
    const outputPath = path.join(outputDir, `${name}${suffix}.svg`);
    fs.writeFileSync(outputPath, render(body, color), 'utf8');
    console.log(`Generated SVG: ${outputPath}`);
  }
}
