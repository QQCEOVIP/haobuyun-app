const fs = require('fs');
const sharp = require('sharp');

async function convertSvgToPng() {
  const svg = fs.readFileSync('assets/images/icon.svg');
  
  const sizes = [
    { name: 'icon.png', size: 512 },
    { name: 'icon-512.png', size: 512 },
    { name: 'adaptive-icon.png', size: 512 },
    { name: 'ic_launcher_foreground.png', size: 512 },
    { name: 'splash-icon.png', size: 512 },
  ];
  
  for (const s of sizes) {
    await sharp(svg)
      .resize(s.size, s.size)
      .png()
      .toFile(`assets/images/${s.name}`);
    console.log(`Created ${s.name}`);
  }
}

convertSvgToPng().catch(console.error);
