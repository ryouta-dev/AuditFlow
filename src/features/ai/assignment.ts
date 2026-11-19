import { maxContext } from '@/lib/ai/contracts';

export const assignmentFormats = '.txt,.md,.pdf,.docx';
const maxFileBytes = 8 * 1024 * 1024;
const maxWordXml = 2 * 1024 * 1024;
const maxPages = 20;

async function pdfText(data: Uint8Array) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const loading = pdfjs.getDocument({
    data,
    useWasm: false,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
  });
  try {
    const doc = await loading.promise;
    const pages = Math.min(doc.numPages, maxPages);
    let text = '';
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const { items } = await page.getTextContent();
      text +=
        items
          .map((item) =>
            'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '',
          )
          .join('') + '\n\n';
      if (text.length > maxContext) break;
    }
    return { text, limited: pages < doc.numPages };
  } finally {
    await loading.destroy();
  }
}

async function docxText(data: Uint8Array) {
  const { unzipSync, strFromU8 } = await import('fflate');
  const zip = unzipSync(data, {
    filter: (entry) =>
      entry.name === 'word/document.xml' &&
      entry.originalSize > 0 &&
      entry.originalSize <= maxWordXml &&
      (entry.compression !== 0 || entry.size <= maxWordXml),
  });
  const xml = zip['word/document.xml'];
  if (!xml) throw new Error('document');
  const source = strFromU8(xml);
  if (/<!DOCTYPE/i.test(source)) throw new Error('document');
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('document');
  return Array.from(doc.getElementsByTagNameNS('*', 'p'))
    .map((p) =>
      Array.from(p.getElementsByTagNameNS('*', 't'))
        .map((text) => text.textContent ?? '')
        .join(''),
    )
    .join('\n');
}

export async function readAssignment(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !assignmentFormats.split(',').includes(`.${extension}`))
    return { error: 'unsupported' } as const;
  if (file.size > maxFileBytes) return { error: 'too_large' } as const;
  try {
    let text: string;
    let limited = false;
    if (extension === 'pdf' || extension === 'docx') {
      const data = new Uint8Array(await file.arrayBuffer());
      if (extension === 'pdf') ({ text, limited } = await pdfText(data));
      else text = await docxText(data);
    } else {
      const data = await file.arrayBuffer();
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(data);
      } catch {
        text = new TextDecoder('windows-1251').decode(data);
      }
      if (text.includes('\u0000')) return { error: 'unreadable' } as const;
    }
    text = text.trim();
    if (text.length < 3) return { error: 'empty' } as const;
    return {
      text: text.slice(0, maxContext).trim(),
      limited: limited || text.length > maxContext,
    };
  } catch {
    return { error: 'unreadable' } as const;
  }
}
