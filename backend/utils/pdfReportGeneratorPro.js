/**
 * Professional Enterprise PDF Report Generator v2.0
 * Production-ready with pixel-perfect layout, branding, and advanced features
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
 * Format currency with proper formatting
 * @param {number} amount - Amount to format
 * @param {string} symbol - Currency symbol
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount, symbol = '$') => {
  const num = Number(amount) || 0;
  return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * Generate professional A4 sales report PDF
 * @param {Object} reportData - Complete report data object
 * @returns {Object} pdfmake document definition
 */
const generateSalesReportPdf = (reportData = {}) => {
  const {
    // Company Info
    companyName = 'AL-HAZIMA RESTAURANT PTE LTD',
    companyAddress = 'No 6 Chiming Glen Rasta Road, SINGAPORE 589729',
    companyPhone = '+65 6840000',
    companyEmail = 'info@restaurant.com',
    companyGst = 'UEN: 123456789',
    companyLogo = null,

    // Report Info
    period = '01-05-2026 to 31-05-2026',
    reportType = 'CONSOLIDATED SALES REPORT SUMMARY',
    generatedDate = new Date(),

    // Financial Data
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

    // Payment Breakdown
    paymentBreakdown = {},

    // Settings
    currencySymbol = '$',
    watermark = null, // 'PAID', 'CONFIDENTIAL', etc.
    includeWatermark = false,

    // Options
    showVoidSection = true,
    showDiscountSection = true,
    showPaymentBreakdown = true,
    showOrderSummary = true,
    hideUnnecessarySections = true
  } = reportData;

  const content = [];

  // ========== HEADER SECTION ==========
  const headerContent = [];

  const headerTable = [
    [
      {
        stack: [
          companyLogo
            ? { image: companyLogo, width: 60, height: 60 }
            : { 
                canvas: [
                  { type: 'rect', x: 0, y: 0, w: 50, h: 50, r: 8, color: '#2c3e50' },
                  { type: 'rect', x: 5, y: 5, w: 40, h: 40, r: 4, color: '#fff' }
                ],
                relativePosition: { x: 0, y: 0 }
              },
          !companyLogo && { text: 'LOGO', fontSize: 10, bold: true, color: '#2c3e50', margin: [0, -35, 0, 0], alignment: 'center' }
        ],
        width: '20%'
      },
      {
        stack: [
          { text: companyName.toUpperCase(), fontSize: 16, bold: true, alignment: 'center', color: '#2c3e50', letterSpacing: 1 },
          { text: companyAddress, fontSize: 9, alignment: 'center', color: '#555', margin: [0, 4, 0, 2] },
          { text: `Phone: ${companyPhone}  •  Email: ${companyEmail}`, fontSize: 8, alignment: 'center', color: '#666' },
          { text: companyGst, fontSize: 9, bold: true, alignment: 'center', color: '#2c3e50', margin: [0, 4, 0, 0] }
        ],
        width: '80%',
        margin: [0, 5, 0, 0]
      }
    ]
  ];

  content.push({
    table: {
      widths: ['20%', '80%'],
      body: headerTable
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 15]
  });

  // Horizontal divider line
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: '#2c3e50' }],
    margin: [0, 0, 0, 15]
  });

  // ========== REPORT TITLE ==========
  content.push({
    text: reportType,
    fontSize: 18,
    bold: true,
    alignment: 'center',
    color: '#2c3e50',
    margin: [0, 0, 0, 12]
  });

  // ========== PERIOD SECTION ==========
  content.push({
    table: {
      widths: ['*'],
      body: [
        [{
          text: `REPORT PERIOD: ${period}`,
          fontSize: 10,
          bold: true,
          alignment: 'center',
          fillColor: '#2c3e50',
          color: '#ffffff',
          margin: [0, 5, 0, 5]
        }]
      ]
    },
    margin: [0, 0, 0, 20]
  });

  // ========== MAIN REPORT TABLE ==========
  const mainTable = [];

  // Report Total Section
  mainTable.push([
    {
      text: 'REPORT SUMMARY',
      fontSize: 10,
      bold: true,
      fillColor: '#34495e',
      color: '#ffffff',
      colSpan: 2,
      alignment: 'left',
      margin: [10, 6, 0, 6],
      border: [false, false, false, false]
    },
    {}
  ]);

  const reportTotalRows = [
    ['Net Sales', formatCurrency(netSales, currencySymbol), '#ecf0f1'],
    ['Service Charge', formatCurrency(serviceCharge, currencySymbol), '#fff'],
    ['Tax Collected', formatCurrency(taxCollected, currencySymbol), '#ecf0f1'],
    ['Rounding & Excess', formatCurrency(roundedBy, currencySymbol), '#fff']
  ];

  reportTotalRows.forEach(([label, value, bgColor]) => {
    mainTable.push([
      {
        text: label,
        fontSize: 10,
        fillColor: bgColor,
        border: [1, 1, 1, 1],
        borderWidth: 0.5,
        margin: [8, 5, 8, 5],
        color: '#333'
      },
      {
        text: value,
        fontSize: 10,
        alignment: 'right',
        fillColor: bgColor,
        border: [1, 1, 1, 1],
        borderWidth: 0.5,
        margin: [8, 5, 8, 5],
        color: '#333'
      }
    ]);
  });

  // Total Revenue - Highlighted
  mainTable.push([
    {
      text: 'TOTAL REVENUE',
      fontSize: 11,
      bold: true,
      fillColor: '#2c3e50',
      color: '#ffffff',
      margin: [10, 8, 0, 8],
      border: [false, false, false, false]
    },
    {
      text: formatCurrency(totalRevenue, currencySymbol),
      fontSize: 12,
      bold: true,
      alignment: 'right',
      fillColor: '#2c3e50',
      color: '#ffffff',
      margin: [0, 8, 10, 8],
      border: [false, false, false, false]
    }
  ]);

  mainTable.push([{ text: '', colSpan: 2, margin: [0, 5, 0, 5], border: [false, false, false, false] }, {}]);

  mainTable.push([
    {
      text: 'SALES BREAKDOWN',
      fontSize: 10,
      bold: true,
      fillColor: '#34495e',
      color: '#ffffff',
      colSpan: 2,
      alignment: 'left',
      margin: [10, 6, 0, 6],
      border: [false, false, false, false]
    },
    {}
  ]);

  mainTable.push([
    {
      text: 'Total Sales',
      fontSize: 10,
      fillColor: '#ecf0f1',
      border: [1, 1, 1, 1],
      borderWidth: 0.5,
      margin: [8, 5, 8, 5]
    },
    {
      text: formatCurrency(totalSales, currencySymbol),
      fontSize: 10,
      alignment: 'right',
      fillColor: '#ecf0f1',
      border: [1, 1, 1, 1],
      borderWidth: 0.5,
      margin: [8, 5, 8, 5]
    }
  ]);

  // Spacing row
  mainTable.push([{ text: '', colSpan: 2, margin: [0, 5, 0, 5], border: [false, false, false, false] }, {}]);

  // Tax & SVC Section
  mainTable.push([
    {
      text: 'TAXES & CHARGES',
      fontSize: 10,
      bold: true,
      fillColor: '#34495e',
      color: '#ffffff',
      colSpan: 2,
      alignment: 'left',
      margin: [10, 6, 0, 6],
      border: [false, false, false, false]
    },
    {}
  ]);

  mainTable.push([
    { text: 'Service Charge', fontSize: 10, fillColor: '#f8f9fa', margin: [10, 5, 0, 5], border: [false, false, false, false] },
    { text: formatCurrency(serviceCharge, currencySymbol), fontSize: 10, alignment: 'right', fillColor: '#f8f9fa', margin: [0, 5, 10, 5], border: [false, false, false, false] }
  ]);

  mainTable.push([
    { text: 'Tax Collected (GST)', fontSize: 10, fillColor: '#ffffff', margin: [10, 5, 0, 5], border: [false, false, false, false] },
    { text: formatCurrency(taxCollected, currencySymbol), fontSize: 10, alignment: 'right', fillColor: '#ffffff', margin: [0, 5, 10, 5], border: [false, false, false, false] }
  ]);

  // Spacing row
  mainTable.push([{ text: '', colSpan: 2, margin: [0, 5, 0, 5], border: [false, false, false, false] }, {}]);

  // Discount Section - Only show if needed
  if (!hideUnnecessarySections || showDiscountSection || Number(totalDiscount) > 0) {
    mainTable.push([
      {
        text: 'DISCOUNTS',
        fontSize: 10,
        bold: true,
        fillColor: '#34495e',
        color: '#ffffff',
        colSpan: 2,
        alignment: 'left',
        margin: [10, 6, 0, 6],
        border: [false, false, false, false]
      },
      {}
    ]);

    mainTable.push([
      { text: 'Total Discount Applied', fontSize: 10, fillColor: '#f8f9fa', margin: [10, 5, 0, 5], border: [false, false, false, false] },
      {
        text: `- ${formatCurrency(totalDiscount, currencySymbol)}`,
        fontSize: 10,
        alignment: 'right',
        fillColor: '#f8f9fa',
        margin: [0, 5, 10, 5],
        color: '#c0392b',
        border: [false, false, false, false]
      }
    ]);
  }

  content.push({
    table: {
      widths: ['*', 'auto'],
      body: mainTable
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0
    },
    margin: [0, 0, 0, 20]
  });

  // ========== PAYMENT BREAKDOWN SECTION ==========
  if (showPaymentBreakdown && paymentBreakdown && Object.keys(paymentBreakdown).length > 0) {
    const validPaymentModes = ['CASH', 'NETS', 'PAYNOW', 'CARD', 'CDC', 'UPI', 'GPAY', 'AMEX', 'DINERS', 'VISA', 'MASTER'];
    const filteredPayments = {};

    for (const [key, value] of Object.entries(paymentBreakdown)) {
      const normalizedKey = String(key).toUpperCase().trim();
      if (normalizedKey === 'UNSPECIFIED' || normalizedKey === 'UNKNOWN' || normalizedKey === '') continue;
      if (validPaymentModes.some(mode => normalizedKey.includes(mode) || mode.includes(normalizedKey))) {
        filteredPayments[normalizedKey] = Number(value) || 0;
      }
    }

    if (Object.keys(filteredPayments).length > 0) {
      const paymentTable = [];
      paymentTable.push([
        { text: 'SETTLEMENT BREAKDOWN', fontSize: 10, bold: true, fillColor: '#34495e', color: '#ffffff', colSpan: 2, margin: [10, 6, 0, 6], border: [false, false, false, false] },
        {}
      ]);

      let alternateRow = false;
      for (const [mode, amount] of Object.entries(filteredPayments).sort()) {
        const bgColor = alternateRow ? '#f8f9fa' : '#ffffff';
        paymentTable.push([
          { text: mode, fontSize: 10, fillColor: bgColor, margin: [10, 5, 0, 5], border: [false, false, false, false] },
          { text: formatCurrency(amount, currencySymbol), fontSize: 10, alignment: 'right', fillColor: bgColor, margin: [0, 5, 10, 5], border: [false, false, false, false] }
        ]);
        alternateRow = !alternateRow;
      }

      content.push({
        table: { widths: ['*', 'auto'], body: paymentTable },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
        margin: [0, 0, 0, 20]
      });
    }
  }

  // ========== ORDER SUMMARY SECTION ==========
  if (showOrderSummary) {
    const summaryTable = [];
    summaryTable.push([
      { text: 'OPERATIONAL SUMMARY', fontSize: 10, bold: true, fillColor: '#34495e', color: '#ffffff', colSpan: 2, margin: [10, 6, 0, 6], border: [false, false, false, false] },
      {}
    ]);

    const summaryRows = [
      ['Total Orders Processed', String(Number(totalOrders) || 0), '#f8f9fa'],
      ['Total Items Sold', String(Number(totalItems) || 0), '#ffffff']
    ];

    if (Number(voidQty) > 0) {
      summaryRows.push(['Total Void/Cancelled Items', String(Number(voidQty) || 0), '#f8f9fa']);
      summaryRows.push(['Total Void/Cancelled Value', formatCurrency(voidAmount, currencySymbol), '#ffffff']);
    }

    summaryRows.forEach(([label, value, bgColor]) => {
      summaryTable.push([
        { text: label, fontSize: 10, fillColor: bgColor, margin: [10, 5, 0, 5], border: [false, false, false, false] },
        {
          text: value,
          fontSize: 10,
          alignment: 'right',
          fillColor: bgColor,
          margin: [0, 5, 10, 5],
          color: (label.includes('Void') || label.includes('Cancelled')) ? '#c0392b' : '#333',
          border: [false, false, false, false]
        }
      ]);
    });

    content.push({
      table: { widths: ['*', 'auto'], body: summaryTable },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
      margin: [0, 0, 0, 30]
    });
  }

  content.push({
    columns: [
      {
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1 }] },
          { text: 'CASHIER SIGNATURE', fontSize: 8, bold: true, margin: [0, 5, 0, 0] },
          { text: `NAME: ________________`, fontSize: 7, color: '#888', margin: [0, 2, 0, 0] }
        ],
        alignment: 'center'
      },
      {
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1 }] },
          { text: 'MANAGER SIGNATURE', fontSize: 8, bold: true, margin: [0, 5, 0, 0] },
          { text: `DATE: ________________`, fontSize: 7, color: '#888', margin: [0, 2, 0, 0] }
        ],
        alignment: 'center'
      }
    ],
    margin: [0, 40, 0, 20]
  });

  // Footer Print Info
  content.push({
    text: `Report Generated on: ${formatDate(generatedDate)} at ${generatedDate.toLocaleTimeString()}`,
    fontSize: 7,
    color: '#aaa',
    alignment: 'center',
    margin: [0, 10, 0, 0]
  });

  // Build document definition with metadata
  const docDef = {
    content,
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    pageOrientation: 'portrait',
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      lineHeight: 1.3
    },
    footer: (currentPage, pageCount) => {
      return {
        columns: [
          { text: 'UNIPRO POS - Enterprise Reporting', fontSize: 7, color: '#ccc', margin: [40, 20, 0, 0] },
          { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7, alignment: 'right', color: '#ccc', margin: [0, 20, 40, 0] }
        ]
      };
    },
    info: {
      title: `Sales Report - ${period}`,
      author: 'UNIPRO POS'
    }
  };

  // Add watermark if enabled
  if (includeWatermark && watermark) {
    docDef.watermark = {
      text: watermark,
      color: [200, 200, 200],
      opacity: 0.1,
      bold: true,
      italics: false
    };
  }

  return docDef;
};

/**
 * Creates a PDF buffer from a document definition
 * @param {Object} docDefinition - pdfmake document definition
 * @returns {Promise<Buffer>} PDF as buffer
 */
const createPdfBinary = (docDefinition) => {
  return new Promise((resolve, reject) => {
    try {
      if (!docDefinition || !docDefinition.content) {
        throw new Error('Invalid document definition');
      }

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];

      pdfDoc.on('data', chunk => chunks.push(chunk));
      pdfDoc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (!buffer || buffer.length === 0) {
          reject(new Error('PDF generation produced empty buffer'));
        } else {
          resolve(buffer);
        }
      });
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
  formatCurrency,
  formatDate,
  printer
};
