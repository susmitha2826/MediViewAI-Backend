import dicomParser from 'dicom-parser';
import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

export const convertDicomToPng = (buffer, outputFileName) => {
  const dataSet = dicomParser.parseDicom(buffer);
  const rows = dataSet.uint16('x00280010'); // Rows
  const cols = dataSet.uint16('x00280011'); // Columns
  const pixelElement = dataSet.elements.x7fe00010;

  const pixelData = dataSet.byteArray.slice(pixelElement.dataOffset, pixelElement.dataOffset + pixelElement.length);

  const canvas = createCanvas(cols, rows);
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(cols, rows);

  for (let i = 0; i < pixelData.length; i++) {
    const val = pixelData[i];
    imgData.data[i * 4] = val;
    imgData.data[i * 4 + 1] = val;
    imgData.data[i * 4 + 2] = val;
    imgData.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);

  const outputDir = path.join(process.cwd(), 'uploads/xrays');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, outputFileName);
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));

  return outputPath; // path to PNG file
};
