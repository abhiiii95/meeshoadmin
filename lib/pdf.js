import pdfParse from 'pdf-parse/lib/pdf-parse.js';

// Returns one array of positioned text items per page: [{ str, x, y }]
// (y grows upwards, as in PDF coordinates)
export async function extractPages(buffer) {
  const pages = [];
  await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const content = await pageData.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });
      pages.push(
        content.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] }))
      );
      return '';
    },
  });
  return pages;
}
