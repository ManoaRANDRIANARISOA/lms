import { nativeImage } from 'electron';
import * as fs from 'fs';

const img = nativeImage.createFromPath('c:\\rep\\School\\assets\\logo.bmp');
if (img.isEmpty()) {
    console.log("Failed to load BMP via nativeImage.");
} else {
    console.log("Success! Image size:", img.getSize());
    fs.writeFileSync('c:\\rep\\School\\assets\\logo.png', img.toPNG());
}
