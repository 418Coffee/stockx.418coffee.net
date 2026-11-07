import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const unsupported = () => new Error('Unsupported layout. Use an original two-page A4 StockX DPD PDF matching the supported format.');
const near = (a, b, tolerance = 0.6) => Math.abs(a - b) <= tolerance;

// Coordinates are PDF points, measured from the bottom left. These rules describe
// the supplied StockX DPD template (November 2026); they are not universal crops.
const regions = [
  { page: 0, box: [55, 580, 430, 630], at: [30, 745] }, // deadline and order
  { page: 0, box: [435, 580, 535.28, 725], at: [455, 673] }, // identification QR, quiet zone and caption
  { page: 0, box: [55, 505, 540, 570], at: [30, 595] }, // complete product table
  { page: 1, box: [30, 420.945, 511.4175, 741.89], at: [30, 235] }, // entire carrier image, at 1:1 scale
];

async function validate(source, doc) {
  if (source.getPageCount() !== 2 || source.getPages().some(page => {
    const { x, y, width, height } = page.getMediaBox();
    return !near(x,0) || !near(y,0) || !near(width,595.28) || !near(height,841.89);
  })) throw unsupported();
  if (doc.numPages !== 2) throw unsupported();
  const pages = [];
  for (let n = 1; n <= 2; n++) {
    const page = await doc.getPage(n);
    if (page.rotate !== 0 || !page.view.every((v, i) => near(v, [0, 0, 595.28, 841.89][i]))) throw unsupported();
    if ((await page.getAnnotations()).length) throw unsupported();
    const text = (await page.getTextContent()).items.filter(i => i.str?.trim());
    const ops = await page.getOperatorList();
    pages.push({ text, ops });
  }
  // Semantic anchors and positions establish that crops fall in the intended sections.
  const anchors = [
    ['Must ship by:', 60, 611.89], ['Order Number:', 60, 589.89],
    ['For StockX Use', 445.28, 600.89], ['Only', 445.28, 588.89],
    ['Name', 64, 547.89], ['Size', 250.912, 547.89],
    ['Style ID', 321.004, 547.89], ['Price', 484.532, 547.89],
    ['Shipping Instructions', 60, 457.89],
  ];
  for (const [label, x, y] of anchors) {
    if (!pages[0].text.some(i => i.str.trim() === label && near(i.transform[4], x) && near(i.transform[5], y))) throw unsupported();
  }
  const order = p => p.text.map(i => i.str).join(' ').match(/\b\d{2}-[A-Z0-9]{10}\b/)?.[0];
  if (!order(pages[0]) || order(pages[0]) !== order(pages[1])) throw new Error('The order numbers are missing or do not match.');
  if (!pages[1].text.some(i => i.str === 'Attach the label below to the shipping box.' && near(i.transform[5], 781.89))) throw unsupported();
  // Product rows must fit fully inside the retained table, allowing descenders.
  const product = pages[0].text.filter(i => i.transform[5] < 540 && i.transform[5] > 480);
  if (product.length < 4 || product.some(i => i.transform[5] - i.height * 0.3 < 505 || i.transform[4] < 55 || i.transform[4] + i.width > 540)) throw new Error('The product details do not fit the supported layout.');
  // Verify image placement matrices and dimensions, not PDF object numbers.
  const dimensions = [[[414,82],[2560,1076],[116,116],[180,180]], [[1200,800]]];
  const expected = [
    [[100, 0, 0, 19.806763285, 435.28, 754.083236715], [166.542750929, 0, 0, 70, 60, 635.89], [100, 0, 0, 100, 435.28, 612.89], [80, 0, 0, 80, 60, 85.09]],
    [[481.4175, 0, 0, 320.945, 30, 420.945]],
  ];
  for (let p = 0; p < 2; p++) {
    let matrix = [1, 0, 0, 1, 0, 0]; const stack = []; const images = [];
    const { fnArray, argsArray } = pages[p].ops;
    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i], a = argsArray[i];
      if (fn === OPS.save) stack.push([...matrix]);
      else if (fn === OPS.restore) matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) {
        const [a0,b,c,d,e,f] = matrix, [g,h,j,k,l,m] = a;
        matrix = [a0*g+c*h,b*g+d*h,a0*j+c*k,b*j+d*k,a0*l+c*m+e,b*l+d*m+f];
      } else if (fn === OPS.paintImageXObject) images.push({ matrix: [...matrix], width: a[1], height: a[2] });
      else if ([OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintFormXObjectBegin].includes(fn)) throw unsupported();
    }
    if (images.length !== expected[p].length || expected[p].some((m,j) => !images.some(im => im.width === dimensions[p][j][0] && im.height === dimensions[p][j][1] && im.matrix.every((v,i) => near(v,m[i],0.02))))) throw unsupported();
    if (p === 1 && (images[0].width !== 1200 || images[0].height !== 800)) throw unsupported();
  }
}

export default {
  id: 'stockx-dpd-2026',
  label: 'StockX DPD',
  pageSize: [595.28, 841.89],
  regions,
  validate,
};
