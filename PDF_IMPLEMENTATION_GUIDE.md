# Professional Sales Report PDF System - Implementation Guide

## Overview

This system provides enterprise-grade PDF report generation for consolidated sales reports. The PDFs are professionally formatted in A4 portrait layout, suitable for printing, emailing, and archiving.

## Architecture

### Backend Components

#### 1. **PDF Utility Module** (`backend/utils/pdfReportGenerator.js`)
Handles all PDF generation logic using pdfmake library.

**Key Functions:**
- `generateSalesReportPdf(reportData)` - Creates professional PDF document definition
- `createPdfBinary(docDefinition)` - Converts document to PDF buffer

**Supported Data:**
```javascript
{
  companyName: string,
  companyAddress: string,
  companyPhone: string,
  period: string,
  netSales: number,
  serviceCharge: number,
  taxCollected: number,
  roundedBy: number,
  totalRevenue: number,
  totalSales: number,
  totalOrders: number,
  totalItems: number,
  voidQty: number,
  voidAmount: number,
  totalDiscount: number,
  paymentBreakdown: { [paymentMode]: amount },
  currencySymbol: string
}
```

#### 2. **Sales Report Endpoint** (`backend/routes/sales.js`)
New endpoint: `GET /api/sales/consolidated-report/pdf`

**Parameters:**
- `filter` - Report period: `daily` | `weekly` | `monthly` | `yearly` (default: `daily`)
- `date` - Optional specific date in `YYYY-MM-DD` format

**Response:**
- Content-Type: `application/pdf`
- File download with automatic naming

**Example:**
```
GET /api/sales/consolidated-report/pdf?filter=daily
GET /api/sales/consolidated-report/pdf?filter=weekly&date=2026-05-11
GET /api/sales/consolidated-report/pdf?filter=monthly
GET /api/sales/consolidated-report/pdf?filter=yearly
```

#### 3. **Export Route Enhancements** (`backend/routes/export.js`)
Updated PDF generation function for consistent professional styling.

Both `/download-pdf` and `/email-pdf` endpoints now use the enhanced layout.

### Frontend Components

#### 1. **PDF Handler Utility** (`frontend/utils/pdfReportHandler.ts`)
Main interface for PDF operations.

**Functions:**
- `downloadSalesReportPdf(filter, date)` - Downloads and shares PDF
- `emailSalesReportPdf(email, filter, date)` - Sends PDF via email
- `previewSalesReportPdf(filter, date)` - Opens PDF in viewer
- `getPeriodString(filter, date)` - Gets readable period string

#### 2. **Example Component** (`frontend/components/SalesReportPdfGenerator.tsx`)
Complete UI component with:
- Period filter selection (daily/weekly/monthly/yearly)
- Download button
- Preview button
- Email input and send button
- Report information display

## Usage Examples

### Backend API Usage

#### Direct PDF Download (Browser)
```bash
# Daily report
curl "http://localhost:3000/api/sales/consolidated-report/pdf?filter=daily" \
  -o sales_report_daily.pdf

# Weekly report
curl "http://localhost:3000/api/sales/consolidated-report/pdf?filter=weekly" \
  -o sales_report_weekly.pdf

# Monthly report
curl "http://localhost:3000/api/sales/consolidated-report/pdf?filter=monthly" \
  -o sales_report_monthly.pdf
```

#### Backend Integration
```javascript
const { generateSalesReportPdf, createPdfBinary } = require('../utils/pdfReportGenerator');

// Prepare your data
const reportData = {
  companyName: 'AL-HAZIMA RESTAURANT PTE LTD',
  companyAddress: 'No 6 Chiming Glen Rasta Road, SINGAPORE 589729',
  companyPhone: '+65 6840000',
  period: '01-05-2026 to 31-05-2026',
  netSales: 1865.89,
  serviceCharge: 0,
  taxCollected: 0,
  roundedBy: -0.39,
  totalRevenue: 1865.50,
  totalSales: 1865.89,
  totalOrders: 42,
  totalItems: 156,
  voidQty: 2,
  voidAmount: 45.50,
  totalDiscount: 0,
  paymentBreakdown: {
    'CASH': 1200.00,
    'CARD': 665.89
  },
  currencySymbol: '$'
};

// Generate PDF
const docDef = generateSalesReportPdf(reportData);
const pdfBuffer = await createPdfBinary(docDef);

// Send as response
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition', `attachment; filename="report.pdf"`);
res.send(pdfBuffer);
```

### Frontend Usage

#### Simple Button Integration
```typescript
import React from 'react';
import { TouchableOpacity, Text, Alert } from 'react-native';
import pdfHandler from '@/utils/pdfReportHandler';

export function SalesReportButton() {
  const handleDownload = async () => {
    try {
      await pdfHandler.downloadSalesReportPdf('daily');
    } catch (error) {
      Alert.alert('Error', 'Failed to download report');
    }
  };

  return (
    <TouchableOpacity onPress={handleDownload}>
      <Text>Download Daily Report</Text>
    </TouchableOpacity>
  );
}
```

#### Full Component Integration
```typescript
import SalesReportPdfGenerator from '@/components/SalesReportPdfGenerator';

// In your screen component
export default function SalesScreen() {
  return (
    <View>
      {/* ... other content ... */}
      <SalesReportPdfGenerator />
    </View>
  );
}
```

#### Email Report
```typescript
import pdfHandler from '@/utils/pdfReportHandler';

const emailReport = async () => {
  const result = await pdfHandler.emailSalesReportPdf('admin@restaurant.com', 'daily');
  
  if (result.success) {
    Alert.alert('Success', result.message);
  } else {
    Alert.alert('Failed', result.message);
  }
};
```

## PDF Layout Details

### Header Section
- Company logo placeholder
- Company name (bold, centered)
- Company address
- Phone number
- Horizontal divider line

### Report Title
- "CONSOLIDATED SALES REPORT SUMMARY" (centered, bold)

### Period Section
- Highlighted bordered box with period range
- Format: "Period: DD-MM-YYYY to DD-MM-YYYY"

### Main Table Sections
1. **Report Total**
   - Net Sales
   - Service Charge
   - Tax Collected
   - Rounding & Excess
   - Total Revenue (highlighted)

2. **Sales**
   - Total Sales

3. **Tax & SVC**
   - Service Charge
   - Tax Collected

4. **Discount**
   - Total Discount

### Payment Breakdown
- Only valid payment modes shown (CASH, NETS, CARD, PAYNOW, CDC, UPI/GPAY, etc.)
- Invalid modes (UNSPECIFIED, UNKNOWN) automatically filtered out
- Sorted alphabetically

### Order Summary
- Total Orders
- Total Items
- Void/Cancelled Qty (if > 0)
- Void/Cancelled Amount (if > 0)

### Footer
- Cashier Signature line (left)
- Authorized Signature line (right)
- Print date/time (bottom left)
- "Powered by UNIPRO" (bottom right)
- Page numbers (automatic)

## Styling Details

### Color Scheme
- **Header**: `#2c3e50` (dark blue-gray)
- **Alternate Rows**: `#ecf0f1` (light gray) and `#fff` (white)
- **Highlighted Total**: `#34495e` (darker blue-gray)
- **Accent (Negative)**: `#c0392b` (red for voids/discounts)

### Fonts
- Primary: Helvetica (pdfmake default)
- Sizes: 8-18pt depending on context

### Page Setup
- Size: A4 (210 × 297 mm)
- Margins: 40pt all sides
- Orientation: Portrait

## Database Queries

The consolidated report endpoint automatically:
1. Aggregates settlement data filtered by date range
2. Calculates financial totals and summaries
3. Groups payments by mode
4. Filters out cancelled orders
5. Normalizes payment mode names

**Example Query Logic:**
```sql
SELECT
  COUNT(DISTINCT sh.SettlementID) as totalOrders,
  SUM(CAST(ISNULL(sid.Qty, 0) AS DECIMAL(18,2))) as totalItems,
  SUM(CAST(ISNULL(sh.ServiceCharge, 0) AS DECIMAL(18,2))) as serviceCharge,
  SUM(CAST(ISNULL(sts.GSTAmount, 0) AS DECIMAL(18,2))) as taxCollected,
  SUM(CAST(ISNULL(sts.SysAmount, 0) AS DECIMAL(18,2))) as totalSales
FROM SettlementHeader sh
LEFT JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
WHERE sh.IsCancelled = 0 
  AND [date filter based on report period]
```

## Report Filters

### Daily
- Shows today's data (00:00 to 23:59)
- Uses server timezone conversion (UTC+7.8 → UTC+5.5)

### Weekly
- Shows last 7 days (including today)
- Format: "DD-MM-YYYY to DD-MM-YYYY"

### Monthly
- Shows current month (1st to today)
- Format: "DD-MM-YYYY to DD-MM-YYYY"

### Yearly
- Shows current year (Jan 1 to today)
- Format: "DD-MM-YYYY to DD-MM-YYYY"

## Email Integration

The system integrates with the existing email transport (`backend/utils/mailTransporter.js`):

1. Generates PDF in memory
2. Creates email with PDF attachment
3. Validates recipient email
4. Verifies SMTP connection
5. Sends via configured mail server

**Email Template:**
```
Subject: Sales Report - [Period]

Body:
Please find the attached sales report for the period: [Period].

Attachment: [PDF file]
```

## Error Handling

### Common Issues & Solutions

#### Database Connection Fails
- Status: 503
- Message: "Database connection unavailable"
- Solution: Ensure MSSQL server is running and accessible

#### Invalid Email
- Status: 400
- Message: "A valid recipient email address is required"
- Solution: Provide valid email format (user@domain.com)

#### Mail Configuration Error
- Status: 503
- Message: "Mail is not configured"
- Solution: Set up `.env` file with SMTP credentials

#### PDF Generation Timeout
- Default timeout: 30 seconds
- Solution: Reduce report date range or check database performance

## Performance Tips

1. **Use Date Ranges**: Daily reports are fastest; yearly reports slowest
2. **Index Database**: Ensure indexes on `LastSettlementDate`, `SettlementID`
3. **Cache Results**: Consider caching aggregated data for frequently requested periods
4. **Async Processing**: For bulk email reports, use background jobs
5. **Monitor Queries**: Track slow PDF generation queries in database logs

## Testing

### Test Daily Report
```bash
curl -o test_daily.pdf "http://localhost:3000/api/sales/consolidated-report/pdf?filter=daily"
file test_daily.pdf  # Verify it's a valid PDF
```

### Test Email
```bash
POST /api/export/email-pdf
Content-Type: application/json

{
  "email": "test@example.com",
  "reportData": {
    "period": "Test Period",
    "filterType": "daily"
  }
}
```

### Test from Frontend
```typescript
import pdfHandler from '@/utils/pdfReportHandler';

// In component test:
const testDownload = async () => {
  await pdfHandler.downloadSalesReportPdf('daily');
};

const testEmail = async () => {
  const result = await pdfHandler.emailSalesReportPdf('admin@test.com', 'daily');
  console.log(result);
};
```

## Future Enhancements

1. **Custom Templates**: Allow restaurants to brand PDFs with their logo
2. **Multi-Language**: Support for different languages in reports
3. **Chart Integration**: Add sales charts/graphs to reports
4. **Recurring Reports**: Automatic emailing on schedule
5. **Report Archiving**: Store generated reports in database
6. **Bulk Export**: Export multiple periods in zip file
7. **Advanced Filtering**: Filter by category, server, table, etc.

## Support & Troubleshooting

For issues with:
- **PDF Generation**: Check `backend/utils/pdfReportGenerator.js`
- **API Endpoint**: Check `backend/routes/sales.js` endpoint logic
- **Frontend**: Check `frontend/utils/pdfReportHandler.ts` and `frontend/components/SalesReportPdfGenerator.tsx`
- **Email**: Check `backend/utils/mailTransporter.js` and `.env` configuration

