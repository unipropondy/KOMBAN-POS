const express = require('express');
const router = express.Router();
const PdfPrinter = require('pdfmake');
const { createMailTransporter } = require('../utils/mailTransporter');

// Define fonts for pdfmake
const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
};
const printer = new PdfPrinter(fonts);

// Helper to generate professional A4 PDF document definition
const generatePdfDocDefinition = (data) => {
  const symbol = data.currencySymbol || '$';
  const content = [];
  
  // ========== HEADER SECTION ==========
  content.push({
    stack: [
      { text: data.companyName || 'AL-HAZIMA RESTAURANT PTE LTD', style: 'companyName', alignment: 'center' },
      { text: data.companyAddress || 'No 4, Cheong Chin Nam Road, SINGAPORE 599729', fontSize: 10, alignment: 'center', color: '#555', margin: [0, 2, 0, 0] },
      { text: `Phone: ${data.companyPhone || '65130000'}`, fontSize: 10, alignment: 'center', color: '#555', margin: [0, 2, 0, 0] }
    ],
    margin: [0, 0, 0, 15]
  });
  
  // Horizontal divider
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#34495e' }],
    margin: [0, 0, 0, 15]
  });
  
  // ========== REPORT TITLE ==========
  content.push({
    text: 'CONSOLIDATED SALES REPORT',
    style: 'reportTitle',
    margin: [0, 0, 0, 15],
    alignment: 'center'
  });
  
  // ========== INFO BAR ==========
  content.push({
    table: {
      widths: ['*'],
      body: [
        [{
          stack: [
            {
              columns: [
                { text: `Period: ${data.period || new Date().toLocaleDateString()}`, alignment: 'center' },
                { text: `|`, width: 'auto', color: '#ccc' },
                { text: `Cashier: ${data.cashierName || 'SR'}`, alignment: 'center' },
                { text: `|`, width: 'auto', color: '#ccc' },
                { text: `RefNo: ${data.refNo || 'SR' + Math.floor(Math.random()*1000000).toString().padStart(6, '0')}`, alignment: 'center' }
              ],
              columnGap: 10
            }
          ],
          fillColor: '#f8f9fa',
          border: [1, 1, 1, 1],
          borderColor: '#dee2e6',
          margin: [8, 8, 8, 8],
          fontSize: 10,
          bold: true
        }]
      ]
    },
    margin: [0, 0, 0, 20]
  });
  
  // ========== MAIN REPORT TABLE ==========
  const tableBody = [];
  
  // Table Header
  tableBody.push([
    { text: 'PARTICULARS', style: 'tableHeader', fillColor: '#34495e', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8] },
    { text: 'QTY', style: 'tableHeader', fillColor: '#34495e', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8], alignment: 'center' },
    { text: `AMOUNT (${symbol})`, style: 'tableHeader', fillColor: '#34495e', color: '#fff', border: [1, 1, 1, 1], margin: [8, 8, 8, 8], alignment: 'right' }
  ]);
  
  // Section: Revenue Summary
  tableBody.push([
    { text: 'Revenue Summary', style: 'sectionHeader', fillColor: '#e9ecef', border: [1, 1, 1, 1], margin: [8, 5, 8, 5], colSpan: 3 },
    {},
    {}
  ]);
  
  tableBody.push([
    { text: 'Net Sales', style: 'rowLabel', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: '-', alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: (data.netSales || 0).toFixed(2), style: 'currencyValue', alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
  ]);
  tableBody.push([
    { text: 'Service Charge', style: 'rowLabel', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: '-', alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: (data.serviceCharge || 0).toFixed(2), style: 'currencyValue', alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
  ]);
  tableBody.push([
    { text: 'Tax Collected', style: 'rowLabel', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: '-', alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: (data.taxCollected || 0).toFixed(2), style: 'currencyValue', alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
  ]);
  tableBody.push([
    { text: 'Rounding & Excess', style: 'rowLabel', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: '-', alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: (data.roundedBy || 0).toFixed(2), style: 'currencyValue', alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
  ]);
  tableBody.push([
    { text: 'Total Revenue', style: 'rowLabel', bold: true, border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: String(data.totalOrders || 0), alignment: 'center', bold: true, border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: (data.totalRevenue || 0).toFixed(2), style: 'currencyValue', bold: true, alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
  ]);

  // Section: Payment Breakdown
  tableBody.push([
    { text: 'Payment Breakdown', style: 'sectionHeader', fillColor: '#e9ecef', border: [1, 1, 1, 1], margin: [8, 5, 8, 5], colSpan: 3 },
    {},
    {}
  ]);
  
  if (Array.isArray(data.paymentBreakdown)) {
    let totalQty = 0;
    let totalAmt = 0;
    data.paymentBreakdown.forEach(m => {
      totalQty += m.qty || 0;
      totalAmt += m.amount || 0;
      tableBody.push([
        { text: m.name, style: 'rowLabel', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
        { text: String(m.qty || 0), alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
        { text: (m.amount || 0).toFixed(2), style: 'currencyValue', alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
      ]);
    });
    
    tableBody.push([
      { text: 'Total Collected', style: 'rowLabel', bold: true, border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
      { text: String(totalQty), alignment: 'center', bold: true, border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
      { text: totalAmt.toFixed(2), style: 'currencyValue', bold: true, alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
    ]);
  } else if (data.paymentBreakdown && typeof data.paymentBreakdown === 'object') {
    // Legacy support
    let totalAmt = 0;
    Object.entries(data.paymentBreakdown).forEach(([k, v]) => {
      totalAmt += Number(v) || 0;
      tableBody.push([
        { text: k.toUpperCase(), style: 'rowLabel', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
        { text: '-', alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
        { text: (Number(v) || 0).toFixed(2), style: 'currencyValue', alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
      ]);
    });
    tableBody.push([
      { text: 'Total Collected', style: 'rowLabel', bold: true, border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
      { text: '-', alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
      { text: totalAmt.toFixed(2), style: 'currencyValue', bold: true, alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
    ]);
  }

  // Section: Item Wise Sales
  if (data.items && data.items.length > 0) {
    tableBody.push([
      { text: 'Item Wise Sales Analysis', style: 'sectionHeader', fillColor: '#e9ecef', border: [1, 1, 1, 1], margin: [8, 5, 8, 5], colSpan: 3 },
      {},
      {}
    ]);
    
    data.items.forEach(item => {
      tableBody.push([
        { text: item.name, style: 'rowLabel', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
        { text: String(item.qty || 0), alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
        { text: (item.amount || 0).toFixed(2), style: 'currencyValue', alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
      ]);
    });
  }

  // Section: Order Analytics
  tableBody.push([
    { text: 'Order Analytics', style: 'sectionHeader', fillColor: '#e9ecef', border: [1, 1, 1, 1], margin: [8, 5, 8, 5], colSpan: 3 },
    {},
    {}
  ]);
  
  const billCount = data.totalOrders || 0;
  const avgBill = billCount > 0 ? (data.totalRevenue || 0) / billCount : 0;

  tableBody.push([
    { text: 'Total Bills', style: 'rowLabel', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: String(billCount), alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: (data.totalRevenue || 0).toFixed(2), style: 'currencyValue', alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
  ]);
  tableBody.push([
    { text: 'Average Bill Value', style: 'rowLabel', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: '-', alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: avgBill.toFixed(2), style: 'currencyValue', alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] }
  ]);

  // Section: Void/Cancellation Summary
  tableBody.push([
    { text: 'Void/Cancellation Summary', style: 'sectionHeader', fillColor: '#e9ecef', border: [1, 1, 1, 1], margin: [8, 5, 8, 5], colSpan: 3 },
    {},
    {}
  ]);
  tableBody.push([
    { text: 'Total Void Items', style: 'rowLabel', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: String(data.voidQty || 0), alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: (data.voidAmount || 0).toFixed(2), style: 'currencyValue', alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5], color: '#c0392b' }
  ]);
  
  tableBody.push([
    { text: 'Total Cancelled Bills', style: 'rowLabel', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: String(data.cancelledCount || 0), alignment: 'center', border: [1, 1, 1, 1], margin: [8, 5, 8, 5] },
    { text: (data.cancelledAmount || 0).toFixed(2), style: 'currencyValue', alignment: 'right', border: [1, 1, 1, 1], margin: [8, 5, 8, 5], color: '#c0392b' }
  ]);

  // Add the table to content
  content.push({
    table: {
      widths: ['*', 60, 100],
      body: tableBody,
      dontBreakRows: true
    },
    margin: [0, 0, 0, 30]
  });
  
  // ========== SIGNATURE SECTION ==========
  content.push({
    columns: [
      {
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.5 }] },
          { text: 'Cashier Signature', fontSize: 9, color: '#444', margin: [0, 5, 0, 0] }
        ],
        alignment: 'center'
      },
      {
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.5 }] },
          { text: 'Authorized Signature', fontSize: 9, color: '#444', margin: [0, 5, 0, 0] }
        ],
        alignment: 'center'
      }
    ],
    margin: [0, 50, 0, 20]
  });
  
  // Footer: Printed On & Powered by
  content.push({
    columns: [
      {
        text: `Printed On: ${new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
        fontSize: 8,
        color: '#888'
      },
      {
        text: 'Powered by UNIPRO',
        fontSize: 8,
        color: '#888',
        alignment: 'right'
      }
    ],
    margin: [0, 20, 0, 0]
  });
  
  return {
    content,
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    styles: {
      companyName: { fontSize: 18, bold: true, color: '#34495e' },
      reportTitle: { fontSize: 14, bold: true, color: '#34495e', letterSpacing: 1 },
      tableHeader: { fontSize: 10, bold: true },
      sectionHeader: { fontSize: 10, bold: true, color: '#34495e' },
      rowLabel: { fontSize: 10, color: '#212529' },
      currencyValue: { fontSize: 10, color: '#212529' }
    },
    defaultStyle: {
      font: 'Roboto'
    }
  };
};

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

router.post('/download-pdf', async (req, res) => {
  try {
    const { reportData } = req.body;
    if (!reportData) return res.status(400).json({ error: 'Report data is required' });
    
    const docDef = generatePdfDocDefinition(reportData);
    const pdfBuffer = await createPdfBinary(docDef);
    
    const filename = `Sales_Report_${reportData.filterType || 'Report'}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF Generation Error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// 🔹 DEBUG EMAIL CONNECTION
router.get('/debug-email', async (req, res) => {
  try {
    console.log("[export/debug] Testing email configuration...");
    const { transporter, from } = createMailTransporter();
    
    // Attempt to verify the connection
    await transporter.verify();
    
    console.log("[export/debug] SMTP verification successful for:", from);
    res.json({
      success: true,
      message: "SMTP Connection is working correctly!",
      user: from,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("[export/debug] SMTP verification failed:", err);
    res.status(500).json({
      success: false,
      message: "SMTP Connection Failed",
      error: err.message,
      code: err.code,
      hint: "Ensure EMAIL_USER and EMAIL_PASS are set correctly in Railway and that you are using an App Password for Gmail."
    });
  }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "protonmail.com",
];
const KNOWN_DOMAIN_TYPOS = {
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "outllok.com": "outlook.com",
  "hotnail.com": "hotmail.com",
};

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function suggestEmailTypos(normalizedEmail) {
  const atIndex = normalizedEmail.indexOf("@");
  if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) return null;
  const local = normalizedEmail.slice(0, atIndex);
  const domain = normalizedEmail.slice(atIndex + 1);
  if (COMMON_EMAIL_DOMAINS.includes(domain)) return null;
  if (KNOWN_DOMAIN_TYPOS[domain]) {
    return `${local}@${KNOWN_DOMAIN_TYPOS[domain]}`;
  }
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of COMMON_EMAIL_DOMAINS) {
    const distance = levenshteinDistance(domain, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  if (!best || bestDistance > 2) return null;
  return `${local}@${best}`;
}

function normalizeAndValidateRecipient(email) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return { ok: false, error: "Recipient email is required" };
  }
  const atIndex = normalized.indexOf("@");
  const domain = atIndex > 0 ? normalized.slice(atIndex + 1) : "";
  if (KNOWN_DOMAIN_TYPOS[domain]) {
    return {
      ok: false,
      error: "Recipient email domain looks misspelled",
      suggestion: `${normalized.slice(0, atIndex)}@${KNOWN_DOMAIN_TYPOS[domain]}`,
    };
  }
  if (!EMAIL_REGEX.test(normalized)) {
    return {
      ok: false,
      error: "A valid recipient email address is required",
      suggestion: suggestEmailTypos(normalized),
    };
  }
  return { ok: true, email: normalized, suggestion: suggestEmailTypos(normalized) };
}

function isInvalidRecipientError(mailErr) {
  const smtpCode = Number(mailErr?.responseCode);
  const raw = `${mailErr?.response || ""} ${mailErr?.message || ""}`.toLowerCase();
  return (
    smtpCode === 511 ||
    smtpCode === 550 ||
    smtpCode === 551 ||
    raw.includes("5.1.1") ||
    raw.includes("mailbox not found") ||
    raw.includes("no mailbox here by that name") ||
    raw.includes("user unknown") ||
    raw.includes("recipient address rejected")
  );
}

router.post('/email-pdf', async (req, res) => {
  let pdfBuffer;
  try {
    const { reportData, email } = req.body;
    if (!reportData) {
      return res.status(400).json({ success: false, error: 'Report data is required' });
    }
    const recipientCheck = normalizeAndValidateRecipient(email);
    if (!recipientCheck.ok) {
      return res.status(400).json({
        success: false,
        error: recipientCheck.error,
        suggestion: recipientCheck.suggestion,
      });
    }
    const to = recipientCheck.email;
    console.log("[export/email-pdf] Recipient:", to);

    console.log('[export/email-pdf] Generating PDF attachment…');
    const docDef = generatePdfDocDefinition(reportData);
    pdfBuffer = await createPdfBinary(docDef);

    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      console.error('[export/email-pdf] PDF buffer is empty or invalid');
      return res.status(500).json({
        success: false,
        error: 'PDF generation produced an empty file',
      });
    }

    const filename = `Sales_Report_${reportData.filterType || 'Report'}_${new Date().toISOString().split('T')[0]}.pdf`;
    console.log(`[export/email-pdf] PDF ready: ${filename} (${pdfBuffer.length} bytes)`);

    let transporter;
    let from;
    try {
      ({ transporter, from } = createMailTransporter());
    } catch (cfgErr) {
      console.error('[export/email-pdf] Mail configuration error:', cfgErr.message, cfgErr.hint || '');
      const status = cfgErr.code === 'MAIL_NOT_CONFIGURED' ? 503 : 500;
      return res.status(status).json({
        success: false,
        error: cfgErr.message,
        details: cfgErr.hint || cfgErr.message,
        code: cfgErr.code || 'MAIL_CONFIG',
      });
    }

    if (process.env.MAIL_SKIP_VERIFY !== '1') {
      try {
        console.log('[export/email-pdf] Verifying SMTP connection (set MAIL_SKIP_VERIFY=1 to skip)…');
        await transporter.verify();
        console.log('[export/email-pdf] SMTP verify OK');
      } catch (verifyErr) {
        console.error('[export/email-pdf] SMTP verify failed:', verifyErr);
        return res.status(502).json({
          success: false,
          error: 'Could not connect to the mail server or authentication failed',
          details: verifyErr.message || String(verifyErr),
        });
      }
    }

    const mailOptions = {
      from,
      to,
      subject: `Sales Report - ${reportData.period || 'Report'}`,
      text: `Please find the attached sales report for the period: ${reportData.period || 'N/A'}.`,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('[export/email-pdf] sendMail accepted:', {
        recipient: to,
        messageId: info.messageId,
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected,
      });
      return res.status(200).json({
        success: true,
        message: 'Sales report sent successfully',
        email: to,
        status: 'sent',
      });
    } catch (mailErr) {
      const smtpCode = Number(mailErr?.responseCode) || null;
      const smtpResponse = mailErr?.response || "";
      console.error('[export/email-pdf] sendMail failed:', {
        recipient: to,
        smtpCode,
        smtpResponse,
        message: mailErr?.message || String(mailErr),
      });
      if (isInvalidRecipientError(mailErr)) {
        return res.status(400).json({
          success: false,
          error: 'Recipient email address does not exist',
          details: smtpResponse || mailErr?.message || 'Mailbox not found or rejected by SMTP server',
          code: 'INVALID_RECIPIENT',
          recipient: to,
          smtpCode,
        });
      }
      return res.status(502).json({
        success: false,
        error: 'The mail server rejected the message or the send failed',
        details: smtpResponse || mailErr?.message || String(mailErr),
        code: 'SMTP_SEND_FAILED',
        recipient: to,
        smtpCode,
      });
    }
  } catch (err) {
    console.error('[export/email-pdf] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate or send the sales report email',
      details: err.message || String(err),
    });
  }
});

module.exports = router;
