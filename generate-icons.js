const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

function createIcon(size) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;

  // Colors
  const bg = { r: 248, g: 245, b: 240 };        // #f8f5f0 warm cream
  const accent = { r: 224, g: 122, b: 95 };      // #e07a5f terracotta
  const accentDark = { r: 180, g: 90, b: 65 };   // darker accent
  const white = { r: 255, g: 255, b: 255 };
  const accentLight = { r: 240, g: 180, b: 160 }; // light accent

  function setPixel(x, y, color, alpha = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (size * y + x) * 4;
    if (alpha < 255) {
      const a = alpha / 255;
      const existing = {
        r: png.data[idx],
        g: png.data[idx + 1],
        b: png.data[idx + 2]
      };
      png.data[idx] = Math.round(color.r * a + existing.r * (1 - a));
      png.data[idx + 1] = Math.round(color.g * a + existing.g * (1 - a));
      png.data[idx + 2] = Math.round(color.b * a + existing.b * (1 - a));
      png.data[idx + 3] = 255;
    } else {
      png.data[idx] = color.r;
      png.data[idx + 1] = color.g;
      png.data[idx + 2] = color.b;
      png.data[idx + 3] = 255;
    }
  }

  function dist(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
  }

  function fillCircle(cx, cy, r, color) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = dist(x, y, cx, cy);
        if (d <= r - 0.5) {
          setPixel(x, y, color);
        } else if (d <= r + 0.5) {
          const alpha = Math.round((r + 0.5 - d) * 255);
          setPixel(x, y, color, alpha);
        }
      }
    }
  }

  function fillRoundRect(x1, y1, x2, y2, r, color) {
    for (let y = Math.floor(y1); y <= Math.ceil(y2); y++) {
      for (let x = Math.floor(x1); x <= Math.ceil(x2); x++) {
        let inside = false;
        if (x >= x1 + r && x <= x2 - r) inside = true;
        else if (y >= y1 + r && y <= y2 - r) inside = true;
        else {
          // Check corner circles
          const corners = [
            [x1 + r, y1 + r], [x2 - r, y1 + r],
            [x1 + r, y2 - r], [x2 - r, y2 - r]
          ];
          for (const [ccx, ccy] of corners) {
            if (dist(x, y, ccx, ccy) <= r) { inside = true; break; }
          }
        }
        if (inside && y >= y1 && y <= y2 && x >= x1 && x <= x2) {
          setPixel(x, y, color);
        }
      }
    }
  }

  function fillEllipse(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1) setPixel(x, y, color);
      }
    }
  }

  const s = size / 512; // scale factor

  // Background: rounded square with warm cream
  fillRoundRect(0, 0, size - 1, size - 1, size * 0.2, bg);

  // Subtle gradient-like background circle
  fillCircle(cx, cy, size * 0.42, accentLight);
  fillCircle(cx, cy, size * 0.38, bg);

  // === Draw a frying pan ===

  // Pan body (large circle)
  const panCx = cx - s * 20;
  const panCy = cy - s * 20;
  const panR = s * 130;
  fillCircle(panCx, panCy, panR, accent);

  // Inner pan (darker)
  fillCircle(panCx, panCy, panR - s * 14, accentDark);

  // Pan surface (lighter inner)
  fillCircle(panCx, panCy, panR - s * 24, { r: 200, g: 100, b: 75 });

  // Egg in pan (white)
  fillEllipse(panCx - s * 20, panCy + s * 5, s * 50, s * 42, white);
  // Egg yolk
  fillCircle(panCx - s * 15, panCy, s * 22, { r: 255, g: 200, b: 60 });

  // Pan handle
  const handleStartX = panCx + panR - s * 20;
  const handleStartY = panCy + s * 40;
  fillRoundRect(
    handleStartX, handleStartY - s * 18,
    handleStartX + s * 160, handleStartY + s * 18,
    s * 10, accent
  );
  // Handle end
  fillRoundRect(
    handleStartX + s * 140, handleStartY - s * 22,
    handleStartX + s * 170, handleStartY + s * 22,
    s * 8, accentDark
  );

  // Steam lines above egg
  for (let i = 0; i < 3; i++) {
    const steamX = panCx - s * 40 + i * s * 35;
    const steamStartY = panCy - panR - s * 10;
    for (let y = 0; y < s * 50; y++) {
      const wave = Math.sin(y / (s * 12)) * s * 8;
      const alpha = Math.round(180 * (1 - y / (s * 50)));
      setPixel(steamX + wave, steamStartY - y, { r: 200, g: 200, b: 200 }, alpha);
      setPixel(steamX + wave + 1, steamStartY - y, { r: 200, g: 200, b: 200 }, Math.round(alpha * 0.5));
    }
  }

  // Text "Rezepte" at bottom
  // Simple pixel font for "Rezepte" - draw dots for each letter
  const textY = size - s * 75;
  const dotSize = Math.max(2, Math.round(s * 4));

  // Instead of complex font rendering, draw a subtle accent bar at the bottom
  fillRoundRect(cx - s * 120, size - s * 90, cx + s * 120, size - s * 70, s * 10, accent);

  // Three small dots as decoration
  fillCircle(cx - s * 40, size - s * 80, s * 6, white);
  fillCircle(cx, size - s * 80, s * 6, white);
  fillCircle(cx + s * 40, size - s * 80, s * 6, white);

  return PNG.sync.write(png);
}

const iconsDir = path.join(__dirname, 'public', 'icons');

[192, 512].forEach(size => {
  const pngData = createIcon(size);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), pngData);
  console.log(`icon-${size}.png erstellt (${(pngData.length / 1024).toFixed(1)} KB)`);
});

console.log('Fertig! Icons in public/icons/');
