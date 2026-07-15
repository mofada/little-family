const fs = require('fs');
const path = require('path');

const icons = [
  { name: 'home', lucide: 'home' },
  { name: 'tree', lucide: 'git-branch' },
  { name: 'birthday', lucide: 'cake' },
  { name: 'timeline', lucide: 'clock' },
  { name: 'profile', lucide: 'user' }
];

const colors = [
  { suffix: '', color: '#9b7b74' },
  { suffix: '-active', color: '#d4756a' }
];

const outputDir = path.join(__dirname, '../apps/miniprogram/assets/tabbar');
const lucideDir = path.join(__dirname, '../node_modules/lucide-static/icons');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generate() {
  for (const icon of icons) {
    const svgPath = path.join(lucideDir, `${icon.lucide}.svg`);
    if (!fs.existsSync(svgPath)) {
      console.error(`Lucide icon not found: ${icon.lucide}`);
      continue;
    }
    let svgContent = fs.readFileSync(svgPath, 'utf8');

    for (const colorObj of colors) {
      const coloredSvg = svgContent
        .replace(/stroke="[^"]*"/g, `stroke="${colorObj.color}"`)
        .replace('width="24"', 'width="81"')
        .replace('height="24"', 'height="81"');
      
      const outputPath = path.join(outputDir, `${icon.name}${colorObj.suffix}.svg`);
      fs.writeFileSync(outputPath, coloredSvg);
      console.log(`Generated SVG: ${outputPath}`);
    }
  }
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
