// components/BillPDFGenerator.ts - WITH DISCOUNT SUPPORT ✅

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, Alert } from 'react-native';
import API from '../api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from '@/constants/Config';

interface CompanySettings {
  name: string;
  address: string;
  gstNo: string;
  gstPercentage: number;
  phone: string;
  email: string;
  cashierName: string;
  currency: string;
  currencySymbol: string;
   companyLogo?: string;        // ✅ ADD THIS
  halalLogo?: string;          // ✅ ADD THIS
  printerIp?: string;          // ✅ ADD THIS
  showCompanyLogo?: boolean;   // ✅ ADD THIS
  showHalalLogo?: boolean; 
}

// ✅ DISCOUNT INFO INTERFACE
interface DiscountInfo {
  applied: boolean;
  type: 'percentage' | 'fixed';
  value: number;
  amount: number;
}

class BillPDFGenerator {
  
  static async uploadImage(fileUri: string): Promise<string | null> {
    try {
      const formData = new FormData();
      
      if (Platform.OS === 'web') {
        // ✅ WEB: Convert URI to Blob
        const response = await fetch(fileUri);
        const blob = await response.json ? await response.blob() : await response.blob();
        formData.append('image', blob, 'logo.png');
      } else {
        // ✅ MOBILE: Use the URI object trick
        const filename = fileUri.split('/').pop() || 'image.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        formData.append('image', {
          uri: fileUri,
          name: filename,
          type,
        } as any);
      }

      const response = await API.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data && response.data.success) {
        return response.data.imageUrl;
      }
      return null;
    } catch (error: any) {
      console.log('Upload error:', error.response?.data || error.message);
      return null;
    }
  }
  
static async loadSettings(userId?: string | number): Promise<CompanySettings> {
    try {
        if (!userId) return this.getDefaultSettings();
        
        // Get outlet ID for multi-outlet
        const outletId = await AsyncStorage.getItem('selectedOutletId');
        const targetId = outletId || userId;
        
        // Add timestamp to prevent caching
        const timestamp = Date.now();
        
        console.log(`📥 LOADING SETTINGS for target: ${targetId}`);
        
        let response = await API.get(`/company-settings/${targetId}?_t=${timestamp}`);
        
        // ✅ CRITICAL FALLBACK: If we got a record but it has no name, try loading Master Settings (ID 1)
        if (targetId !== '1' && (!response.data?.settings?.CompanyName || response.data.settings.CompanyName.trim() === '')) {
            console.log('⚠️ Got empty settings for GUID, falling back to Master Settings (ID 1)');
            const masterResponse = await API.get(`/company-settings/1?_t=${timestamp}`);
            if (masterResponse.data?.success && masterResponse.data.settings?.CompanyName) {
                response = masterResponse;
            }
        }
        
        if (response.data && response.data.success) {
            const settings = response.data.settings;
            
            // Fix boolean conversion
            const showCompanyLogo = settings.ShowCompanyLogo === 1 || settings.ShowCompanyLogo === true;
            const showHalalLogo = settings.ShowHalalLogo === 1 || settings.ShowHalalLogo === true;
            
            // ✅ FIX: Handle GST percentage correctly (allow 0)
            const gstPercentage = settings.GSTPercentage !== undefined && settings.GSTPercentage !== null 
                ? settings.GSTPercentage 
                : 9;
            
            console.log('✅ CONVERTED VALUES:', {
                showCompanyLogo,
                showHalalLogo,
                gstPercentage,
                rawGST: settings.GSTPercentage
            });
            
            const formatUrl = (url: string) => {
                if (!url) return '';
                if (url.startsWith('data:image')) return url;
                if (url.startsWith('http')) return url;
                return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
            };
            
            return {
                name: settings.CompanyName || 'Komban',
                address: settings.Address || '',
                gstNo: settings.GSTNo || '',
                gstPercentage: gstPercentage,
                phone: settings.Phone || '',
                email: settings.Email || '',
                cashierName: settings.CashierName || '',
                currency: settings.Currency || 'SGD',
                currencySymbol: settings.CurrencySymbol || '$',
                companyLogo: formatUrl(settings.CompanyLogoUrl),
                halalLogo: formatUrl(settings.HalalLogoUrl),
                printerIp: settings.PrinterIP || '',
                showCompanyLogo: showCompanyLogo === true,
                showHalalLogo: showHalalLogo === true,
            };
        }
        return this.getDefaultSettings();
    } catch (error) {
        console.log('❌ Error loading settings:', error);
        return this.getDefaultSettings();
    }
}

  private static getDefaultSettings(): CompanySettings {
    return {
      name: '',
      address: '',
      gstNo: '',
      gstPercentage: 0,
      phone: '',
      email: '',
      cashierName: '',
      currency: 'SGD',
      currencySymbol: '$',
    };
  }
  
 static async saveSettings(settings: CompanySettings, userId?: string | number): Promise<boolean> {
    try {
        if (!userId) return false;
        
        // ✅ CRITICAL FIX: Get outlet ID for multi-outlet support
        const outletId = await AsyncStorage.getItem('selectedOutletId');
        const targetId = outletId || userId;
        
        console.log(`💾 SAVING SETTINGS TO BACKEND for target: ${targetId} (outlet: ${outletId || 'none'})`, {
            showCompanyLogo: settings.showCompanyLogo ? 1 : 0,
            showHalalLogo: settings.showHalalLogo ? 1 : 0,
            companyLogo: settings.companyLogo ? 'YES' : 'NO',
            halalLogo: settings.halalLogo ? 'YES' : 'NO'
        });
        
        const dbSettings = {
            CompanyName: settings.name,
            Address: settings.address,
            GSTNo: settings.gstNo,
            GSTPercentage: settings.gstPercentage,
            Phone: settings.phone,
            Email: settings.email,
            CashierName: settings.cashierName,
            Currency: settings.currency,
            CurrencySymbol: settings.currencySymbol,
            CompanyLogoUrl: settings.companyLogo || '',
            HalalLogoUrl: settings.halalLogo || '',
            PrinterIP: settings.printerIp || '', // ✅ ADDED
            ShowCompanyLogo: settings.showCompanyLogo ? 1 : 0,  // ✅ Simplified
            ShowHalalLogo: settings.showHalalLogo ? 1 : 0      // ✅ Simplified
        };
        
        // ✅ Add timestamp to prevent caching
        const timestamp = Date.now();
        
        // ✅ STEP 1: DELETE old settings first (to ensure clean slate)
        try {
            await API.delete(`/company-settings/${targetId}?_t=${timestamp}`);
            console.log('✅ Old settings deleted');
        } catch (deleteError: any) {
            // 404 is fine (no existing settings)
            if (deleteError.response?.status !== 404) {
                console.log('⚠️ Delete failed:', deleteError.message);
            } else {
                console.log('ℹ️ No existing settings to delete');
            }
        }
        
        // ✅ Small delay to ensure delete completes
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // ✅ STEP 2: POST new settings
        const response = await API.post(`/company-settings/${targetId}?_t=${timestamp}`, dbSettings);
        
        console.log('✅ SAVE RESPONSE:', response.data);
        
        // ✅ STEP 3: VERIFY immediately (to confirm save worked)
        const verifyResponse = await API.get(`/company-settings/${targetId}?_t=${timestamp + 1}`);
        const savedSettings = verifyResponse.data?.settings;
        
        console.log('🔍 VERIFY AFTER SAVE:', {
            ShowCompanyLogo: savedSettings?.ShowCompanyLogo,
            expected: dbSettings.ShowCompanyLogo,
            match: !!savedSettings?.ShowCompanyLogo === !!dbSettings.ShowCompanyLogo
        });
        
        // ✅ STEP 4: Double check with boolean conversion
        if (!!savedSettings?.ShowCompanyLogo !== !!dbSettings.ShowCompanyLogo) {
            console.log('⚠️ WARNING: Save verification failed! Trying one last time...');
            await API.post(`/company-settings/${targetId}?_t=${timestamp + 2}`, dbSettings);
        }
        
        return true;
        
    } catch (error: any) {
        console.log('❌ Error saving settings:', error);
        console.log('❌ Error details:', error.response?.data || error.message);
        return false;
    }
}
// Add this method to the BillPDFGenerator class
private static escapeHtml(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
  // ✅ GENERATE HTML WITH DISCOUNT SUPPORT
  /**
   * Generate HTML for Bill/Receipt
   * @param saleData The sale/order data
   * @param userId User ID for loading settings (ignored if companyOverride provided)
   * @param discountInfo Optional discount information
   * @param companyOverride Optional pre-loaded company settings to prevent double-loading
   */
  static async generateHTML(
    saleData: any, 
    userId?: string | number, 
    discountInfo?: any,
    companyOverride?: CompanySettings
  ): Promise<string> {
    const company = companyOverride || await this.loadSettings(userId);
    
    // ✅ FIX: Get discount from saleData if discountInfo not provided
    let finalDiscountInfo = discountInfo;
    
    if (!finalDiscountInfo && saleData.discount) {
        // Get discount from sale data (for reprints)
        finalDiscountInfo = {
            applied: true,
            type: saleData.discount.type || 'percentage',
            value: saleData.discount.value || 0,
            amount: saleData.discount.amount || 0
        };
        console.log('📋 Using discount from saleData:', finalDiscountInfo);
    }
    
    // ✅ Also check saleData.discountAmount for direct field
    if (!finalDiscountInfo && saleData.discountAmount && saleData.discountAmount > 0) {
        finalDiscountInfo = {
            applied: true,
            type: saleData.discountType || 'percentage',
            value: saleData.discountValue || 0,
            amount: saleData.discountAmount
        };
        console.log('📋 Using discount from saleData fields:', finalDiscountInfo);
    }
    
    const saleDate = saleData.originalDate ? new Date(saleData.originalDate) : 
                     saleData.date ? new Date(saleData.date) : 
                     new Date();
    
    const isReprint = saleData.isReprint === true;
    const billNo = saleData.invoiceNumber || saleData.orderId || saleData.id || `ORD-${saleDate.getFullYear()}${(saleDate.getMonth()+1).toString().padStart(2,'0')}${saleDate.getDate().toString().padStart(2,'0')}-${Math.floor(1000 + Math.random()*9000)}`;
    
    const hasGST = company.gstPercentage > 0;
    const gstRate = company.gstPercentage || 9;
    let finalTotal = saleData.total || saleData.totalAmount;
    
    // ✅ If discount applied, finalTotal already discounted
    // But we need original total for display
    const hasDiscount = finalDiscountInfo?.applied && finalDiscountInfo.amount > 0;
    const originalTotal = hasDiscount ? finalTotal + finalDiscountInfo!.amount : finalTotal;
    
    const gstAmount = hasGST ? finalTotal * (gstRate / (100 + gstRate)) : 0;
    const amountWithoutGST = hasGST ? finalTotal - gstAmount : finalTotal;
    const currencySymbol = company.currencySymbol || '$';
    
    const companyLogoUrl = company.companyLogo || '';
    const halalLogoUrl = company.halalLogo || '';
    
    // ✅ STRICT CHECK: Ensure logos are only shown if BOTH the toggle is ON and the URL exists
    const showCompanyLogo = company.showCompanyLogo === true && !!companyLogoUrl;
    const showHalalLogo = company.showHalalLogo === true && !!halalLogoUrl;
    
    console.log('🖼️ LOGO RENDER CHECK:', {
        showCompanyLogo,
        showHalalLogo,
        companyLogoUrl: companyLogoUrl ? 'PRESENT' : 'MISSING',
        halalLogoUrl: halalLogoUrl ? 'PRESENT' : 'MISSING',
        rawShowCompany: company.showCompanyLogo
    });
    
    const itemsHTML = (saleData.items || [])
        .filter((item: any) => item.status !== 'VOIDED')
        .map((item: any) => `
        <tr>
            <td class="item-name">
                ${item.name}
                ${item.modifiers && item.modifiers.length > 0 ? 
                  `<div class="item-modifiers">${item.modifiers.map((m: any) => `+ ${m.ModifierName || m.name}`).join('<br/>')}</div>` : 
                  ''
                }
            </td>
            <td class="item-qty">${item.qty || item.quantity}</td>
            <td class="item-price">${currencySymbol}${item.price.toFixed(2)}</td>
            <td class="item-total">${currencySymbol}${(item.price * (item.qty || item.quantity)).toFixed(2)}</td>
        </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Invoice_${saleData.invoiceNumber || saleData.id}</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            background: #fff;
            margin: 0;
            padding: 0;
          }

          .print-wrapper {
            display: flex;
            justify-content: center;
            align-items: flex-start;
            width: 100%;
            min-height: 100vh;
          }
 
          @media print {
            @page { margin: 0; }
            body { background: white; }
            .print-wrapper {
              display: flex !important;
              justify-content: center !important;
            }
            .receipt {
              margin: 0 !important;
              box-shadow: none !important;
              width: 72mm !important;
            }
          }
          
          .receipt {
            width: 72mm;
            max-width: 72mm;
            background: white;
            padding: 4mm;
            box-shadow: 0 0 10px rgba(0,0,0,0.1); /* Visible on screen */
          }
          
          /* Logo Header */
          .logo-header {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center; /* ✅ Center logos vertically relative to text */
            margin-bottom: 3mm;
            border-bottom: 2.5px solid #000; /* ✅ Thicker border like reference */
            padding-bottom: 3mm;
          }
          
          .company-logo { width: 45px; height: 45px; object-fit: contain; }
          .halal-logo { width: 45px; height: 45px; object-fit: contain; }
          
          .shop-info { 
            text-align: center; 
            flex: 1; 
            padding: 0 1mm;
          }
          
          .shop-name { 
            font-size: 15px; /* ✅ Smaller, matching reference proportion */
            font-weight: 800; 
            text-transform: uppercase; 
            letter-spacing: 4px; /* ✅ Wide spacing like MC DONALDS ref */
            line-height: 1.2; 
            margin-bottom: 1mm;
            display: block;
            font-family: monospace;
          }
          
          .shop-address { 
            font-size: 8.5px; /* ✅ Slightly smaller for better contrast */
            font-weight: 600; 
            line-height: 1.3; 
            font-family: monospace; 
            white-space: pre-line; 
          }
          .gst-no { font-size: 9px; font-weight: 700; background: #eee; font-family: monospace; padding: 0.5mm; margin: 1mm 0; display: inline-block; }
          .contact { font-size: 9px; font-weight: 700; font-family: monospace; margin-top: 1.5mm; line-height: 1.3; }
          
          /* Reprint Indicator */
          .reprint-indicator {
            text-align: center;
            margin: 1mm 0;
            padding: 0.5mm;
            background: #eee;
            border: 1px dashed #000;
          }
          .reprint-text {
            font-size: 9px;
            font-weight: bold;
          }
          
          /* Bill Details */
          .bill-details {
            margin-bottom: 3mm;
            font-size: 11px;
            font-weight: 700;
          }
          
          .bill-box {
            border: 1px solid #000;
            padding: 1.5mm; /* ✅ Slimmer box */
            margin-bottom: 2mm;
            background: #f9f9f9;
          }
          
          .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 1px;
            font-weight: 700;
          }
          
          .detail-label { font-weight: 800; font-family: monospace; font-size: 10px; }
          .detail-value { font-weight: 800; font-family: monospace; font-size: 10px; }
          
          /* Items Table */
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 3mm;
            font-size: 11px;
            font-family: monospace;
            font-weight: 800;
          }
          
          .items-table th {
            font-weight: 800;
            font-family: monospace;
            text-align: center;
            padding: 1.5mm 0.5mm;
            border-bottom: 1.5px solid #000;
            border-top: 1.5px solid #000;
            text-transform: uppercase;
          }
          
          .items-table th:first-child { text-align: left; }
          .items-table th:last-child { text-align: right; }
          
          .items-table td {
            padding: 1mm 0.5mm;
            border-bottom: 1px dashed #ddd;
            font-weight: 800;
            font-family: monospace;
          }
          
          .item-name { text-align: left; font-weight: 900; max-width: 38mm; }
          .item-modifiers { font-size: 8px; font-weight: normal; color: #444; margin-top: 0.5mm; padding-left: 1mm; }
          .item-qty { text-align: center; font-weight: 900; }
          .item-price { text-align: right; font-weight: 900; }
          .item-total { text-align: right; font-weight: 900; }
          
          /* Discount Section */
          .discount-section {
            margin-bottom: 3mm;
            padding: 1.5mm;
            border: 1px solid #000;
            background: #f9f9f9;
            font-family: monospace;
          }
          
          .discount-title { font-size: 10px; font-weight: 800; text-align: center; margin-bottom: 1mm; }
          .discount-row, .original-row {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            font-weight: 800;
          }
          
          /* Totals */
          .totals {
            margin-bottom: 3mm;
            font-weight: 900;
            font-family: monospace;
          }
          
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 1.5px;
            font-size: 11px;
            font-weight: 900;
          }
          
          .grand-total {
            display: flex;
            justify-content: space-between;
            margin-top: 1.5mm;
            padding-top: 1.5mm;
            border-top: 1.5px solid #000;
            font-weight: 900;
            font-size: 13px;
          }
          
          /* Payment Info */
          .payment-info {
            margin-bottom: 3mm;
            font-weight: 700;
            font-family: monospace;
          }
          
          .payment-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 1px;
            font-size: 10px;
            font-weight: 700;
          }
          
          .payment-label { font-weight: 700; }
          .payment-value { font-weight: 700; }
          
          /* Footer */
          .footer {
            text-align: center;
            padding-top: 2mm;
            border-top: 1.5px solid #000;
            font-family: monospace;
          }
          
          .thankyou { font-size: 13px; font-weight: 800; margin-bottom: 1mm; }
          .copyright { font-size: 11px; font-weight: 900; color: #000; }
        </style>
      </head>
      <body>
        <div class="print-wrapper">
          <div class="receipt">
          
          ${saleData.isCheckout ? `
            <div style="text-align: center; border: 2.5px solid #000; padding: 1.5mm; margin-bottom: 4mm; font-weight: 900; font-size: 18px; letter-spacing: 2px;">
              CHECKOUT BILL
            </div>
          ` : ''}

          <!-- Logo Header -->
          <div class="logo-header">
            ${showCompanyLogo && companyLogoUrl ? 
              `<img src="${companyLogoUrl}" class="company-logo" />` : 
              '<div style="width:45px"></div>'
            }
            <div class="shop-info">
              <div class="shop-name">${saleData.shopName || company.name || 'POS SYSTEM'}</div>
              <div class="shop-address">${(saleData.shopAddress || company.address || '').replace(/\n/g, '<br/>')}</div>
              ${(saleData.shopGst || company.gstNo) ? `<div class="gst-no">GST: ${saleData.shopGst || company.gstNo}</div>` : ''}
              <div class="contact">
                ${(saleData.shopPhone || company.phone) ? `<div>Ph: ${saleData.shopPhone || company.phone}</div>` : ''} 
                ${(saleData.shopEmail || company.email) ? `<div>Email: ${saleData.shopEmail || company.email}</div>` : ''}
              </div>
            </div>
            ${showHalalLogo && halalLogoUrl ? 
              `<img src="${halalLogoUrl}" class="halal-logo" />` : 
              '<div style="width:45px"></div>'
            }
          </div>
          
        
          
          <!-- Bill Details - WITH ORIGINAL SALE DATE -->
          <div class="bill-details">
            <div class="bill-box">
              <div class="detail-row">
                <span class="detail-label">INVOICE NO:</span>
                <span class="detail-value">${billNo}</span>
              </div>
              ${saleData.tableNo ? `
                <div class="detail-row" style="margin-top: 1.5mm; padding-top: 1mm; border-top: 1px dashed #ccc;">
                  <span class="detail-label" style="font-size: 14px; font-weight: 900;">TABLE NO:</span>
                  <span class="detail-value" style="font-size: 14px; font-weight: 900;">${saleData.tableNo}</span>
                </div>
              ` : ''}
              ${saleData.waiterName ? `
                <div class="detail-row" style="margin-top: 1mm;">
                  <span class="detail-label" style="font-size: 9px; color: #666;">WAITER:</span>
                  <span class="detail-value" style="font-size: 9px; color: #666;">${saleData.waiterName}</span>
                </div>
              ` : ''}
            </div>
            
            <!-- ✅ ORIGINAL SALE DATE (DD/MM/YYYY) -->
            <div class="detail-row">
              <span class="detail-label">DATE:</span>
              <span class="detail-value">
                ${(() => {
                  const d = saleDate.getDate().toString().padStart(2, '0');
                  const m = (saleDate.getMonth() + 1).toString().padStart(2, '0');
                  const y = saleDate.getFullYear();
                  const t = saleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                  return `${d}/${m}/${y} ${t}`;
                })()}
              </span>
            </div>
            
            ${company.cashierName ? `
            <div class="detail-row">
              <span class="detail-label">CASHIER:</span>
              <span class="detail-value">${company.cashierName}</span>
            </div>
            ` : ''}
          </div>
          
          <!-- Items Table -->
          <table class="items-table">
            <thead>
              <tr><th>ITEM</th><th>QTY</th><th>PRICE</th><th>TOTAL</th> </tr>
            </thead>
            <tbody>${itemsHTML}</tbody>
           </table>
          
                <!-- ✅ Discount Section -->
          ${hasDiscount ? `
          <div class="discount-section">
            <div class="discount-title">🏷️ DISCOUNT APPLIED</div>
            <div class="original-row">
              <span>Original Total:</span>
              <span>${currencySymbol}${originalTotal.toFixed(2)}</span>
            </div>
            <div class="discount-row">
              <span>Discount (${finalDiscountInfo?.type === 'percentage' ? `${finalDiscountInfo?.value}%` : 'Fixed'}):</span>
              <span>-${currencySymbol}${finalDiscountInfo?.amount.toFixed(2)}</span>
            </div>
          </div>
          ` : ''}

          
          <!-- Totals -->
          <div class="totals">
            <div class="total-row">
              <span>${hasGST ? 'Sub Total (without GST):' : 'Sub Total:'}</span>
              <span>${currencySymbol}${hasGST ? amountWithoutGST.toFixed(2) : finalTotal.toFixed(2)}</span>
            </div>
            ${hasGST ? `
            <div class="total-row">
              <span>GST (${gstRate}%):</span>
              <span>${currencySymbol}${gstAmount.toFixed(2)}</span>
            </div>
            ` : ''}
            ${saleData.roundOff && saleData.roundOff !== 0 ? `
            <div class="total-row">
              <span>Round Off:</span>
              <span>${saleData.roundOff > 0 ? '+' : ''}${currencySymbol}${saleData.roundOff.toFixed(2)}</span>
            </div>
            ` : ''}
            <div class="grand-total">
              <span>${hasGST ? 'GRAND TOTAL (incl GST):' : 'GRAND TOTAL:'}</span>
              <span>${currencySymbol}${finalTotal.toFixed(2)}</span>
            </div>
          </div>
          
          <!-- Payment Info -->
          <div class="payment-info">
            ${saleData.isCheckout ? `
              <div class="payment-row" style="margin-top: 5mm; border: 2px solid #000; padding: 2mm; text-align: center; justify-content: center;">
                <span class="payment-label" style="font-size: 14px;">PAYMENT STATUS: PENDING</span>
              </div>
            ` : `
              <div class="payment-row">
                <span>PAYMENT:</span>
                <span>${saleData.paymentMethod || 'Cash'}</span>
              </div>
              ${saleData.cashPaid ? `
              <div class="payment-row">
                <span>PAID:</span>
                <span>${currencySymbol}${saleData.cashPaid.toFixed(2)}</span>
              </div>
              <div class="payment-row">
                <span>CHANGE:</span>
                <span>${currencySymbol}${(saleData.change || 0).toFixed(2)}</span>
              </div>
              ` : ''}
            `}
          </div>
          
          <!-- Footer -->
          <div class="footer">
            ${saleData.isCheckout ? `
              <div class="thankyou">PLEASE PAY AT THE COUNTER</div>
            ` : `
              <div class="thankyou">THANK YOU! COME AGAIN!</div>
            `}
            <div class="copyright">SMART-POS BY UNIPROSG</div>
          </div>
          </div>
        </div>
      </body>
      </html>
    `;
}
  // ✅ Updated generatePDF with discount support
  static async generatePDF(saleData: any, userId?: string | number, discountInfo?: DiscountInfo): Promise<string> {
    try {
      const html = await this.generateHTML(saleData, userId, discountInfo);
      
      const { uri } = await Print.printToFileAsync({
        html: html,
        base64: false,
        width: 226
      });
      
      return uri;
    } catch (error) {
      throw error;
    }
  }

  // ✅ Updated downloadPDF with discount support
  static async downloadPDF(saleData: any, userId?: string | number, discountInfo?: DiscountInfo): Promise<void> {
    try {
      const pdfUri = await this.generatePDF(saleData, userId, discountInfo);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save Receipt',
        });
      } else {
        Alert.alert('✅ Receipt Ready', `Saved at:\n${pdfUri}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to generate receipt');
    }
  }
}

export default BillPDFGenerator;
