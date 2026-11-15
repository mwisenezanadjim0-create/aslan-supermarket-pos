// public/js/barcode-gen.js - Code128 Barcode Generator for Labels & Receipts
// Generates clean, scalable SVG barcodes without any external dependencies

(function(window) {
  'use strict';

  // Code 128B pattern table (107 patterns)
  // Each pattern is an array of widths: [bar1, space1, bar2, space2, bar3, space3]
  const CODE128_PATTERNS = [
    [2,1,2,2,2,2], [2,2,2,1,2,2], [2,2,2,2,2,1], [1,2,1,2,2,3], [1,2,1,3,2,2], // 0-4
    [1,3,1,2,2,2], [1,2,2,2,1,3], [1,2,2,3,1,2], [1,3,2,2,1,2], [2,2,1,2,1,3], // 5-9
    [2,2,1,3,1,2], [2,3,1,2,1,2], [1,1,2,2,3,2], [1,2,2,1,3,2], [1,2,2,2,3,1], // 10-14
    [1,1,3,2,2,2], [1,2,3,1,2,2], [1,2,3,2,2,1], [2,2,3,2,1,1], [2,2,1,1,3,2], // 15-19
    [2,2,1,2,3,1], [2,1,3,2,1,2], [2,2,3,1,1,2], [3,1,2,1,3,1], [3,1,1,2,2,2], // 20-24
    [3,2,1,1,2,2], [3,2,1,2,2,1], [3,1,2,2,1,2], [3,2,2,1,1,2], [3,2,2,2,1,1], // 25-29
    [2,1,2,1,2,3], [2,1,2,3,2,1], [2,3,2,1,2,1], [1,1,1,3,2,3], [1,3,1,1,2,3], // 30-34
    [1,3,1,3,2,1], [1,1,2,3,1,3], [1,3,2,1,1,3], [1,3,2,3,1,1], [2,1,1,3,1,3], // 35-39
    [2,3,1,1,1,3], [2,3,1,3,1,1], [1,1,2,1,3,3], [1,1,2,3,3,1], [1,3,2,1,3,1], // 40-44
    [1,1,3,1,2,3], [1,1,3,3,2,1], [1,3,3,1,2,1], [3,1,3,1,2,1], [2,1,1,3,3,1], // 45-49
    [2,3,1,1,3,1], [2,1,3,1,1,3], [2,1,3,3,1,1], [2,1,3,1,3,1], [3,1,1,1,2,3], // 50-54
    [3,1,1,3,2,1], [3,3,1,1,2,1], [3,1,2,1,1,3], [3,1,2,3,1,1], [3,3,2,1,1,1], // 55-59
    [3,1,4,1,1,1], [2,2,1,4,1,1], [4,3,1,1,1,1], [1,1,1,2,2,4], [1,1,1,4,2,2], // 60-64
    [1,2,1,1,2,4], [1,2,1,4,2,1], [1,4,1,1,2,2], [1,4,1,2,2,1], [1,1,2,2,1,4], // 65-69
    [1,1,2,4,1,2], [1,2,2,1,1,4], [1,2,2,4,1,1], [1,4,2,1,1,2], [1,4,2,2,1,1], // 70-74
    [2,4,1,2,1,1], [2,2,1,1,1,4], [4,1,3,1,1,1], [2,4,1,1,1,2], [1,3,4,1,1,1], // 75-79
    [1,1,1,2,4,2], [1,2,1,1,4,2], [1,2,1,2,4,1], [1,1,4,2,1,2], [1,2,4,1,1,2], // 80-84
    [1,2,4,2,1,1], [4,1,1,2,1,2], [4,2,1,1,1,2], [4,2,1,2,1,1], [2,1,2,1,4,1], // 85-89
    [2,1,4,1,2,1], [4,1,2,1,2,1], [1,1,1,1,4,3], [1,1,1,3,4,1], [1,3,1,1,4,1], // 90-94
    [1,1,4,1,1,3], [1,1,4,3,1,1], [4,1,1,1,1,3], [4,1,1,3,1,1], [1,1,3,1,4,1], // 95-99
    [1,1,4,1,3,1], [3,1,1,1,4,1], [4,1,1,1,3,1], [2,1,1,4,1,2], [2,1,1,2,1,4], // 100-104
    [2,1,1,2,3,2], [2,3,3,1,1,1,2] // 105 (Start B), 106 (Stop)
  ];

  const START_B = 104;
  const STOP = 106;

  function charToCode128B(char) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) {
      return code - 32;
    }
    return 0; // fallback space
  }

  function generateCode128SVG(text, options = {}) {
    const height = options.height || 45;
    const barWidth = options.barWidth || 2;
    const quietZone = options.quietZone !== undefined ? options.quietZone : 10;
    const showText = options.showText !== undefined ? options.showText : true;

    // Convert text characters to values
    const values = [START_B];
    let checksum = START_B;

    for (let i = 0; i < text.length; i++) {
      const val = charToCode128B(text[i]);
      values.push(val);
      checksum += val * (i + 1);
    }

    values.push(checksum % 103);
    values.push(STOP);

    // Build modules array (true = bar, false = space)
    const modules = [];

    // Left quiet zone
    for (let q = 0; q < quietZone; q++) modules.push(false);

    for (const val of values) {
      const pattern = CODE128_PATTERNS[val];
      if (!pattern) continue;
      let isBar = true;
      for (const w of pattern) {
        for (let b = 0; b < w; b++) {
          modules.push(isBar);
        }
        isBar = !isBar;
      }
    }

    // Right quiet zone
    for (let q = 0; q < quietZone; q++) modules.push(false);

    const totalWidth = modules.length * barWidth;
    const svgHeight = showText ? height + 16 : height;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${svgHeight}" width="${totalWidth}" height="${svgHeight}" class="barcode-svg">`;
    svg += `<rect width="100%" height="100%" fill="#ffffff"/>`;

    // Render bars
    let x = 0;
    for (let i = 0; i < modules.length; i++) {
      if (modules[i]) {
        // Find length of consecutive bars
        let barLen = 1;
        while (i + 1 < modules.length && modules[i + 1]) {
          barLen++;
          i++;
        }
        svg += `<rect x="${x}" y="0" width="${barLen * barWidth}" height="${height}" fill="#000000"/>`;
        x += barLen * barWidth;
      } else {
        x += barWidth;
      }
    }

    if (showText) {
      svg += `<text x="${totalWidth / 2}" y="${height + 13}" font-family="monospace" font-size="12" font-weight="bold" text-anchor="middle" fill="#000000">${text}</text>`;
    }

    svg += `</svg>`;
    return svg;
  }

  window.BarcodeGen = {
    generateSVG: generateCode128SVG
  };
})(window);
