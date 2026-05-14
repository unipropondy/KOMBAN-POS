/**
 * Professional PDF Report Generator
 * Generates enterprise-style A4 PDF reports for sales, settlements, and financial reports
 * Used for downloads, email attachments, and printing
 */

const PdfPrinter = require('pdfmake');

const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
};

const printer = new PdfPrinter(fonts);

/**
 * Generates a comprehensive sales report PDF definition
 * @param {Object} reportData - Report data from database/API
 * @returns {Object} pdfmake document definition
 */
const generateSalesReportPdf = (reportData) => {
  const {
    companyName = 'AL-HAZIMA RESTAURANT PTE LTD',
    companyAddress = 'No 6 Chiming Glen Rasta Road, SINGAPORE 589729',
    companyPhone = '+65 6840000',
    period = '01-05-2026 to 31-05-2026',
    netSales = 0,
    serviceCharge = 0,
    taxCollected = 0,
    roundedBy = 0,
    totalRevenue = 0,
    totalSales = 0,
    totalOrders = 0,
    totalItems = 0,
    voidQty = 0,
    voidAmount = 0,
    totalDiscount = 0,
    paymentBreakdown = {},
    currencySymbol = '$'
  } = reportData || {};

  const content = [];

  // ========== HEADER SECTION ==========
  content.push({
    margin: [0, 0, 0, 20],
    table: {
      widths: ['15%', '70%', '15%'],
      body: [
        [
          { text: '🏢', fontSize: 28, alignment: 'center', color: '#2c3e50' },
          {
            stack: [
              { text: companyName, fontSize: 14, bold: true, alignment: 'center', color: '#2c3e50' },
              { text: companyAddress, fontSize: 10, alignment: 'center', color: '#555' },
              { text: `Phone: ${companyPhone}`, fontSize: 9, alignment: 'center', color: '#555' }
            ]
          },
          { text: '', alignment: 'right' }
        ]
      ],
      layout: 'noBorders'
    }
  });

  // Horizontal divider
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 540, y2: 0, lineWidth: 2, lineColor: '#2c3e50' }],
    margin: [0, 0, 0, 15]
  });

  // ========== REPORT TITLE ==========
  content.push({
    text: 'CONSOLIDATED SALES REPORT SUMMARY',
    fontSize: 18,
    bold: true,
    alignment: 'center',
    color: '#2c3e50',
    margin: [0, 0, 0, 15]
  });

  // ========== PERIOD SECTION ==========
  content.push({
    table: {
      widths: ['*'],
      body: [
        [{
          text: `Period: ${period}`,
          fontSize: 11,
          bold: true,
          alignment: 'center',
          fillColor: '#f5f5f5',
          border: [1, 1, 1, 1],
          borderColor: '#2c3e50',
          margin: [10, 10, 10, 10],
          color: '#2c3e50'
        }]
      ]
    },
    margin: [0, 0, 0, 20]
  });

  // ========== MAIN REPORT TABLE ==========
  const mainTable = [];

  // Report Total Section
  mainTable.push([
    { text: 'Report Total', fontSize: 11, bold: true, fillColor: '#2c3e50', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8] },
    { text: '', border: [1, 1, 1, 1] }
  ]);

  mainTable.push([
    { text: 'Net Sales', fontSize: 10, fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
    { text: `${currencySymbol}${Number(netSales).toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] }
  ]);

  mainTable.push([
    { text: 'Service Charge', fontSize: 10, fillColor: '#fff', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
    { text: `${currencySymbol}${Number(serviceCharge).toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor: '#fff', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] }
  ]);

  mainTable.push([
    { text: 'Tax Collected', fontSize: 10, fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
    { text: `${currencySymbol}${Number(taxCollected).toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] }
  ]);

  mainTable.push([
    { text: 'Rounding & Excess', fontSize: 10, fillColor: '#fff', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
    { text: `${currencySymbol}${Number(roundedBy).toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor: '#fff', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] }
  ]);

  mainTable.push([
    { text: 'Total Revenue', fontSize: 12, bold: true, fillColor: '#34495e', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8] },
    { text: `${currencySymbol}${Number(totalRevenue).toFixed(2)}`, fontSize: 12, bold: true, alignment: 'right', fillColor: '#34495e', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8] }
  ]);

  // Sales Section
  mainTable.push([
    { text: 'Sales', fontSize: 11, bold: true, fillColor: '#2c3e50', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8] },
    { text: '', border: [1, 1, 1, 1] }
  ]);

  mainTable.push([
    { text: 'Total Sales', fontSize: 10, fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
    { text: `${currencySymbol}${Number(totalSales).toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] }
  ]);

  // Tax & SVC Section
  mainTable.push([
    { text: 'Tax & SVC', fontSize: 11, bold: true, fillColor: '#2c3e50', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8] },
    { text: '', border: [1, 1, 1, 1] }
  ]);

  mainTable.push([
    { text: 'Service Charge', fontSize: 10, fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
    { text: `${currencySymbol}${Number(serviceCharge).toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] }
  ]);

  mainTable.push([
    { text: 'Tax Collected', fontSize: 10, fillColor: '#fff', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
    { text: `${currencySymbol}${Number(taxCollected).toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor: '#fff', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] }
  ]);

  // Discount Section
  mainTable.push([
    { text: 'Discount', fontSize: 11, bold: true, fillColor: '#2c3e50', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8] },
    { text: '', border: [1, 1, 1, 1] }
  ]);

  mainTable.push([
    { text: 'Total Discount', fontSize: 10, fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
    { text: `${currencySymbol}${Number(totalDiscount).toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6], color: '#c0392b' }
  ]);

  content.push({
    table: { widths: ['65%', '35%'], body: mainTable, dontBreakRows: true },
    layout: 'noBorders',
    margin: [0, 0, 0, 20]
  });

  // ========== PAYMENT BREAKDOWN SECTION ==========
  const validPaymentModes = ['CASH', 'NETS', 'PAYNOW', 'CARD', 'CDC', 'UPI / GPAY', 'UPI', 'GPAY', 'PHONEPE', 'AMEX', 'DINERS', 'MASTER', 'VISA'];
  const filteredPayments = {};

  if (paymentBreakdown && typeof paymentBreakdown === 'object') {
    for (const [key, value] of Object.entries(paymentBreakdown)) {
      const normalizedKey = String(key).toUpperCase().trim();
      // Skip invalid payment modes
      if (normalizedKey === 'UNSPECIFIED' || normalizedKey === 'UNKNOWN' || normalizedKey === '') continue;
      // Check if it's a valid mode
      if (validPaymentModes.some(mode => normalizedKey.includes(mode) || mode.includes(normalizedKey))) {
        filteredPayments[normalizedKey] = Number(value) || 0;
      }
    }
  }

  if (Object.keys(filteredPayments).length > 0) {
    const paymentTable = [];
    paymentTable.push([
      { text: 'Payment Mode', fontSize: 11, bold: true, fillColor: '#2c3e50', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8] },
      { text: 'Amount', fontSize: 11, bold: true, fillColor: '#2c3e50', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8], alignment: 'right' }
    ]);

    let alternateRow = false;
    for (const [mode, amount] of Object.entries(filteredPayments).sort()) {
      const bgColor = alternateRow ? '#ecf0f1' : '#fff';
      paymentTable.push([
        { text: mode, fontSize: 10, fillColor: bgColor, border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
        { text: `${currencySymbol}${Number(amount).toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor: bgColor, border: [1, 1, 1, 1], margin: [8, 6, 8, 6] }
      ]);
      alternateRow = !alternateRow;
    }

    content.push({
      table: { widths: ['65%', '35%'], body: paymentTable, dontBreakRows: true },
      layout: 'noBorders',
      margin: [0, 0, 0, 20]
    });
  }

  // ========== ORDER SUMMARY SECTION ==========
  const summaryTable = [];
  summaryTable.push([
    { text: 'Order Summary', fontSize: 11, bold: true, fillColor: '#2c3e50', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8] },
    { text: '', border: [1, 1, 1, 1] }
  ]);

  summaryTable.push([
    { text: 'Total Orders', fontSize: 10, fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
    { text: String(Number(totalOrders) || 0), fontSize: 10, alignment: 'right', fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] }
  ]);

  summaryTable.push([
    { text: 'Total Items', fontSize: 10, fillColor: '#fff', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
    { text: String(Number(totalItems) || 0), fontSize: 10, alignment: 'right', fillColor: '#fff', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] }
  ]);

  if (Number(voidQty) > 0) {
    summaryTable.push([
      { text: 'Void/Cancelled Qty', fontSize: 10, fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
      { text: String(Number(voidQty)), fontSize: 10, alignment: 'right', fillColor: '#ecf0f1', border: [1, 1, 1, 1], margin: [8, 6, 8, 6], color: '#c0392b' }
    ]);
  }

  if (Number(voidAmount) > 0) {
    summaryTable.push([
      { text: 'Void/Cancelled Amount', fontSize: 10, fillColor: '#fff', border: [1, 1, 1, 1], margin: [8, 6, 8, 6] },
      { text: `${currencySymbol}${Number(voidAmount).toFixed(2)}`, fontSize: 10, alignment: 'right', fillColor: '#fff', border: [1, 1, 1, 1], margin: [8, 6, 8, 6], color: '#c0392b' }
    ]);
  }

  content.push({
    table: { widths: ['65%', '35%'], body: summaryTable, dontBreakRows: true },
    layout: 'noBorders',
    margin: [0, 0, 0, 30]
  });

  // ========== SIGNATURE & FOOTER SECTION ==========
  content.push({
    columns: [
      {
        stack: [
          { text: '___________________', fontSize: 9 },
          { text: 'Cashier Signature', fontSize: 9, color: '#666', margin: [0, 2, 0, 0] }
        ],
        alignment: 'center',
        width: '50%'
      },
      {
        stack: [
          { text: '___________________', fontSize: 9 },
          { text: 'Authorized Signature', fontSize: 9, color: '#666', margin: [0, 2, 0, 0] }
        ],
        alignment: 'center',
        width: '50%'
      }
    ],
    columnGap: 20,
    margin: [0, 20, 0, 15]
  });

  // Printed date and powered by
  content.push({
    columns: [
      {
        text: `Printed: ${new Date().toLocaleString('en-SG')}`,
        fontSize: 8,
        color: '#999'
      },
      {
        text: 'Powered by UNIPRO',
        fontSize: 8,
        color: '#999',
        alignment: 'right'
      }
    ],
    margin: [0, 0, 0, 0]
  });

  return {
    content,
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 60],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      lineHeight: 1.4
    },
    footer: function(currentPage, pageCount) {
      return {
        text: `Page ${currentPage} of ${pageCount}`,
        alignment: 'center',
        fontSize: 8,
        color: '#999',
        margin: [0, 10, 0, 0]
      };
    }
  };
};

/**
 * Creates a PDF buffer from a document definition
 * @param {Object} docDefinition - pdfmake document definition
 * @returns {Promise<Buffer>} PDF as buffer
 */
const createPdfBinary = (docDefinition) => {
  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on('data', chunk => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', err => reject(err));
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generateSalesReportPdf,
  createPdfBinary,
  printer
};
