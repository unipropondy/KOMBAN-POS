/**
 * Enhanced PDF Report Export API Routes v2.0
 * Production-ready with comprehensive error handling, preview endpoint, and dynamic filenames
 */

const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { validateEmail } = require('./emailValidator');
const { generateSalesReportPdf, createPdfBinary, formatDate } = require('./pdfReportGeneratorPro');

// TODO: Configure your email transporter
const emailTransporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER || 'your-email@example.com',
    pass: process.env.EMAIL_PASS || 'your-password'
  }
});

/**
 * Fetch company branding settings from database
 * @param {Object} db - Database connection
 * @returns {Promise<Object>} Company settings object
 */
const getCompanySettings = async (db) => {
  try {
    const query = `
      SELECT 
        companyName,
        companyAddress,
        companyPhone,
        companyEmail,
        companyGst,
        currencySymbol,
        companyLogo
      FROM CompanySettings 
      WHERE isActive = 1
      LIMIT 1
    `;

    const result = await db.query(query);
    if (result.recordsets && result.recordsets[0] && result.recordsets[0].length > 0) {
      return result.recordsets[0][0];
    }

    return {
      companyName: process.env.COMPANY_NAME || 'AL-HAZIMA RESTAURANT PTE LTD',
      companyAddress: process.env.COMPANY_ADDRESS || 'No 6 Chiming Glen Rasta Road, SINGAPORE 589729',
      companyPhone: process.env.COMPANY_PHONE || '+65 6840000',
      companyEmail: process.env.COMPANY_EMAIL || 'info@restaurant.com',
      companyGst: process.env.COMPANY_GST || 'UEN: 123456789',
      currencySymbol: process.env.CURRENCY_SYMBOL || '$'
    };
  } catch (err) {
    console.error('Error fetching company settings:', err);
    return {
      companyName: 'AL-HAZIMA RESTAURANT PTE LTD',
      companyAddress: 'No 6 Chiming Glen Rasta Road, SINGAPORE 589729',
      companyPhone: '+65 6840000',
      companyEmail: 'info@restaurant.com',
      companyGst: 'UEN: 123456789',
      currencySymbol: '$'
    };
  }
};

/**
 * Generate dynamic PDF filename based on report period
 * @param {string} filter - Report filter (daily, weekly, monthly, yearly)
 * @param {string} date - Reference date
 * @returns {string} Filename without extension
 */
const generatePdfFilename = (filter, date) => {
  const d = new Date(date);
  const timestamp = d.toISOString().split('T')[0];

  const filenameMaps = {
    daily: () => `Sales_Report_Daily_${timestamp}`,
    weekly: () => {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const startStr = weekStart.toISOString().split('T')[0];
      const endStr = weekEnd.toISOString().split('T')[0];
      return `Sales_Report_Weekly_${startStr}_to_${endStr}`;
    },
    monthly: () => {
      const monthYear = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return `Sales_Report_Monthly_${monthYear}`;
    },
    yearly: () => `Sales_Report_Yearly_${d.getFullYear()}`,
    default: () => `Sales_Report_${timestamp}`
  };

  const generator = filenameMaps[filter.toLowerCase()] || filenameMaps.default;
  return generator().replace(/\s+/g, '_');
};

/**
 * Validate report request parameters
 * @param {string} filter - Report filter type
 * @param {string} date - Report date
 * @throws {Error} If validation fails
 */
const validateReportParams = (filter, date) => {
  const validFilters = ['daily', 'weekly', 'monthly', 'yearly'];
  if (!validFilters.includes(String(filter).toLowerCase())) {
    throw new Error(`Invalid filter. Must be one of: ${validFilters.join(', ')}`);
  }

  const reportDate = new Date(date);
  if (isNaN(reportDate.getTime())) {
    throw new Error('Invalid date format. Expected valid ISO date string');
  }

  if (reportDate > new Date()) {
    throw new Error('Report date cannot be in the future');
  }
};

/**
 * GET /sales/consolidated-report/preview
 * Preview PDF in browser without downloading
 */
router.get('/consolidated-report/preview', async (req, res) => {
  const startTime = Date.now();

  try {
    const { filter = 'daily', date = new Date().toISOString() } = req.query;

    // Validate inputs
    validateReportParams(filter, date);

    if (!req.app.get('db')) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    const db = req.app.get('db');

    // Fetch company settings and report data in parallel
    const [companySettings, reportData] = await Promise.all([
      getCompanySettings(db),
      fetchConsolidatedReportData(db, filter, date)
    ]);

    if (!reportData || reportData.error) {
      return res.status(404).json({ error: reportData?.error || 'No data available for the selected period' });
    }

    // Generate PDF document definition
    const docDef = generateSalesReportPdf({
      ...companySettings,
      ...reportData,
      includeWatermark: false
    });

    // Create PDF binary
    const pdfBuffer = await createPdfBinary(docDef);

    // Return PDF with appropriate headers for browser preview
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.end(pdfBuffer);

    console.log(`[PDF Preview] Generated in ${Date.now() - startTime}ms, size: ${pdfBuffer.length} bytes`);
  } catch (err) {
    console.error('Preview endpoint error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate PDF preview' });
  }
});

/**
 * POST /sales/consolidated-report/download
 * Download PDF file with dynamic filename
 */
router.post('/consolidated-report/download', async (req, res) => {
  const startTime = Date.now();

  try {
    const { filter = 'daily', date = new Date().toISOString() } = req.body;

    // Validate inputs
    validateReportParams(filter, date);

    if (!req.app.get('db')) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    const db = req.app.get('db');

    // Fetch company settings and report data
    const [companySettings, reportData] = await Promise.all([
      getCompanySettings(db),
      fetchConsolidatedReportData(db, filter, date)
    ]);

    if (!reportData || reportData.error) {
      return res.status(404).json({ error: reportData?.error || 'No data available for the selected period' });
    }

    // Generate PDF
    const docDef = generateSalesReportPdf({
      ...companySettings,
      ...reportData,
      includeWatermark: false
    });

    const pdfBuffer = await createPdfBinary(docDef);

    // Generate filename
    const filename = `${generatePdfFilename(filter, date)}.pdf`;

    // Send file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.end(pdfBuffer);

    console.log(`[PDF Download] ${filename} - Generated in ${Date.now() - startTime}ms, size: ${pdfBuffer.length} bytes`);
  } catch (err) {
    console.error('Download endpoint error:', err);
    res.status(500).json({ error: err.message || 'Failed to download PDF' });
  }
});

/**
 * POST /sales/consolidated-report/email
 * Email PDF report to recipient with retry logic
 */
router.post('/consolidated-report/email', async (req, res) => {
  const startTime = Date.now();
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds

  try {
    const { email, filter = 'daily', date = new Date().toISOString() } = req.body;

    // Validate email
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address provided' });
    }

    // Validate report params
    validateReportParams(filter, date);

    if (!req.app.get('db')) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    const db = req.app.get('db');

    // Fetch data
    const [companySettings, reportData] = await Promise.all([
      getCompanySettings(db),
      fetchConsolidatedReportData(db, filter, date)
    ]);

    if (!reportData || reportData.error) {
      return res.status(404).json({ error: reportData?.error || 'No data available for the selected period' });
    }

    // Generate PDF
    const docDef = generateSalesReportPdf({
      ...companySettings,
      ...reportData,
      includeWatermark: true,
      watermark: 'COPY'
    });

    const pdfBuffer = await createPdfBinary(docDef);
    const filename = `${generatePdfFilename(filter, date)}.pdf`;

    // Send email with retry logic
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await emailTransporter.sendMail({
          from: process.env.EMAIL_USER || 'noreply@restaurant.com',
          to: email,
          subject: `Sales Report - ${new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
          html: `
            <p>Dear User,</p>
            <p>Please find attached your consolidated sales report for the requested period.</p>
            <p><strong>Report Details:</strong></p>
            <ul>
              <li>Period: ${reportData.period}</li>
              <li>Generated: ${formatDate(new Date())}</li>
              <li>Total Revenue: ${reportData.currencySymbol}${Number(reportData.totalRevenue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</li>
            </ul>
            <p>Best regards,<br>${companySettings.companyName}</p>
          `,
          attachments: [
            {
              filename: filename,
              content: pdfBuffer,
              contentType: 'application/pdf'
            }
          ]
        });

        console.log(`[PDF Email] Sent to ${email} - Attempt ${attempt}/${MAX_RETRIES}, Generated in ${Date.now() - startTime}ms`);

        return res.json({
          success: true,
          message: `Report emailed successfully to ${email}`,
          filename,
          size: pdfBuffer.length,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        lastError = err;
        console.warn(`[PDF Email] Attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);

        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }

    // All retries failed
    console.error(`[PDF Email] Failed after ${MAX_RETRIES} attempts:`, lastError);
    res.status(500).json({
      error: 'Failed to send email after multiple attempts',
      details: lastError.message,
      suggestion: 'Please try again later or contact support'
    });
  } catch (err) {
    console.error('Email endpoint error:', err);
    res.status(500).json({ error: err.message || 'Failed to email PDF report' });
  }
});

/**
 * Fetch consolidated report data from database
 * (Assumes this function exists in sales.js or should be extracted to shared utils)
 * @param {Object} db - Database connection
 * @param {string} filter - Report filter
 * @param {string} date - Report date
 * @returns {Promise<Object>} Report data
 */
const fetchConsolidatedReportData = async (db, filter, date) => {
  try {
    // This is a stub - implement based on your actual sales.js logic
    // For now, return a basic structure that should be replaced with actual data fetching

    const reportDate = new Date(date);
    const period = `01-${String(reportDate.getMonth() + 1).padStart(2, '0')}-${reportDate.getFullYear()} to 31-${String(reportDate.getMonth() + 1).padStart(2, '0')}-${reportDate.getFullYear()}`;

    return {
      period,
      reportType: 'CONSOLIDATED SALES REPORT SUMMARY',
      generatedDate: new Date(),
      netSales: 0,
      serviceCharge: 0,
      taxCollected: 0,
      roundedBy: 0,
      totalRevenue: 0,
      totalSales: 0,
      totalOrders: 0,
      totalItems: 0,
      voidQty: 0,
      voidAmount: 0,
      totalDiscount: 0,
      paymentBreakdown: {},
      currencySymbol: '$'
    };
  } catch (err) {
    console.error('Error fetching report data:', err);
    return { error: 'Failed to fetch report data: ' + err.message };
  }
};

/**
 * Error handling middleware for export routes
 */
router.use((err, req, res, next) => {
  console.error('[Export Route Error]', err);

  if (err.code === 'ENOBUFS') {
    return res.status(413).json({ error: 'Report too large to generate' });
  }

  if (err.code === 'ENOMEM') {
    return res.status(503).json({ error: 'Server out of memory. Please try again later.' });
  }

  res.status(500).json({
    error: err.message || 'Internal server error',
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
