const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const tabbarDir = path.join(__dirname, '../miniprogram/assets/tabbar');

async function convert() {
  if (!fs.existsSync(tabbarDir)) {
    console.error('Tabbar directory not found');
    return;
  }

  const files = fs.readdirSync(tabbarDir).filter(file => file.endsWith('.svg'));

  for (const file of files) {
    const svgPath = path.join(tabbarDir, file);
    const pngPath = path.join(tabbarDir, file.replace('.svg', '.png'));
    
    const svgData = fs.readFileSync(svgPath);
    const resvg = new Resvg(svgData, {
        fitTo: {
            mode: 'width',
            value: 81,
        },
    });
    
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    
    fs.writeFileSync(pngPath, pngBuffer);
    console.log(`Converted ${file} to PNG`);
  }
}

convert().catch(err => {
  console.error(err);
  process.exit(1);
});
