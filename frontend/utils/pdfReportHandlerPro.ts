/**
 * Production-Ready PDF Report Handler v2.0
 * Enhanced frontend utilities with comprehensive error handling, retry logic, and offline support
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import { API_URL } from '@/constants/Config';

// API configuration
const API_BASE_URL = API_URL;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // ms
const TIMEOUT = 30000; // ms

/**
 * Email validation with enhanced checks
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
};

/**
 * Generate report filename based on period
 */
export const generateReportFilename = (filter: string, date: Date = new Date()): string => {
  const timestamp = date.toISOString().split('T')[0];

  const maps: Record<string, string> = {
    daily: `Sales_Report_Daily_${timestamp}`,
    weekly: (() => {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const startStr = weekStart.toISOString().split('T')[0];
      const endStr = weekEnd.toISOString().split('T')[0];
      return `Sales_Report_Weekly_${startStr}_to_${endStr}`;
    })(),
    monthly: `Sales_Report_Monthly_${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
    yearly: `Sales_Report_Yearly_${date.getFullYear()}`,
  };

  return (maps[filter] || maps.daily).replace(/\s+/g, '_');
};

/**
 * Enhanced HTTP client with retry and timeout logic
 */
class PdfReportClient {
  private axiosInstance = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    timeout: TIMEOUT,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  /**
   * Execute HTTP request with automatic retry on failure
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    endpoint: string,
    maxRetries: number = MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error as Error;
        console.warn(`[PDF Report] ${endpoint} - Attempt ${attempt}/${maxRetries} failed:`, error);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        }
      }
    }

    throw lastError || new Error(`Failed after ${maxRetries} attempts`);
  }

  /**
   * Download PDF to device storage
   */
  async downloadPdf(
    filter: string,
    date: string = new Date().toISOString(),
    onProgress?: (progress: number) => void
  ): Promise<{ uri: string; filename: string; size: number }> {
    return this.executeWithRetry(async () => {
      const endpoint = '/sales/consolidated-report/download';
      const filename = `${generateReportFilename(filter, new Date(date))}.pdf`;
      const fileUri = `${(FileSystem as any).documentDirectory}${filename}`;

      // Check if file already exists
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        console.log(`[PDF Download] Using cached file: ${filename}`);
        return { uri: fileUri, filename, size: (fileInfo as any).size || 0 };
      }

      // Download file
      const response = await this.axiosInstance.post(endpoint, { filter, date }, {
        responseType: 'arraybuffer',
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = progressEvent.loaded / progressEvent.total;
            onProgress?.(progress);
          }
        }
      });

      // Save to device
      await FileSystem.writeAsStringAsync(fileUri, Buffer.from(response.data).toString('base64'), {
        encoding: (FileSystem as any).EncodingType.Base64
      });

      const savedFileInfo = await FileSystem.getInfoAsync(fileUri);
      console.log(`[PDF Download] Saved: ${filename} (${(savedFileInfo as any).size} bytes)`);

      return {
        uri: fileUri,
        filename,
        size: (savedFileInfo as any).size || 0
      };
    }, '/consolidated-report/download');
  }

  /**
   * Share PDF via native sharing dialog
   */
  async sharePdf(
    filter: string,
    date: string = new Date().toISOString()
  ): Promise<boolean> {
    try {
      const { uri, filename } = await this.downloadPdf(filter, date);

      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('Sharing not available', 'Your device does not support file sharing');
        return false;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share ${filename}`,
        UTI: 'com.adobe.pdf'
      });

      console.log(`[PDF Share] Shared: ${filename}`);
      return true;
    } catch (error) {
      console.error('[PDF Share] Error:', error);
      throw error;
    }
  }

  /**
   * Email PDF report
   */
  async emailPdf(
    email: string,
    filter: string,
    date: string = new Date().toISOString(),
    onProgress?: (status: string) => void
  ): Promise<{ success: boolean; message: string }> {
    // Validate email
    if (!validateEmail(email)) {
      throw new Error('Invalid email address. Please check and try again.');
    }

    return this.executeWithRetry(async () => {
      const endpoint = '/sales/consolidated-report/email';
      onProgress?.('Sending email...');

      const response = await this.axiosInstance.post(endpoint, {
        email,
        filter,
        date
      });

      const result = response.data;
      if (result.success) {
        onProgress?.('Email sent successfully');
        console.log(`[PDF Email] Sent to ${email}`);
        return result;
      }

      throw new Error(result.error || 'Failed to send email');
    }, '/consolidated-report/email');
  }

  /**
   * Preview PDF in browser/viewer
   */
  async previewPdf(
    filter: string,
    date: string = new Date().toISOString()
  ): Promise<string> {
    return this.executeWithRetry(async () => {
      const endpoint = '/sales/consolidated-report/preview';
      const previewUrl = `${API_BASE_URL}/api${endpoint}?filter=${encodeURIComponent(filter)}&date=${encodeURIComponent(date)}`;

      console.log(`[PDF Preview] Opening: ${previewUrl}`);
      return previewUrl;
    }, '/consolidated-report/preview');
  }

  /**
   * Get PDF metadata without downloading full file
   */
  async getPdfMetadata(
    filter: string,
    date: string = new Date().toISOString()
  ): Promise<{ period: string; totalRevenue: number; currency: string }> {
    try {
      const response = await this.axiosInstance.get('/sales/consolidated-report/data', {
        params: { filter, date }
      });

      return {
        period: response.data.period || '',
        totalRevenue: response.data.totalRevenue || 0,
        currency: response.data.currencySymbol || '$'
      };
    } catch (error) {
      console.error('[PDF Metadata] Error:', error);
      return { period: '', totalRevenue: 0, currency: '$' };
    }
  }

  /**
   * Clear cached PDF files
   */
  async clearCache(): Promise<number> {
    try {
      const files = await FileSystem.readDirectoryAsync((FileSystem as any).documentDirectory!);
      let cleared = 0;

      for (const file of files) {
        if (file.startsWith('Sales_Report_') && file.endsWith('.pdf')) {
          await FileSystem.deleteAsync(`${(FileSystem as any).documentDirectory}${file}`);
          cleared++;
        }
      }

      console.log(`[PDF Cache] Cleared ${cleared} files`);
      return cleared;
    } catch (error) {
      console.error('[PDF Cache] Clear failed:', error);
      return 0;
    }
  }

  /**
   * Get cache usage info
   */
  async getCacheInfo(): Promise<{ count: number; size: number }> {
    try {
      const files = await FileSystem.readDirectoryAsync((FileSystem as any).documentDirectory!);
      let totalSize = 0;
      let count = 0;

      for (const file of files) {
        if (file.startsWith('Sales_Report_') && file.endsWith('.pdf')) {
          const fileInfo = await FileSystem.getInfoAsync(`${(FileSystem as any).documentDirectory}${file}`);
          if ((fileInfo as any).size) {
            totalSize += (fileInfo as any).size;
            count++;
          }
        }
      }

      return { count, size: totalSize };
    } catch {
      return { count: 0, size: 0 };
    }
  }
}

// Export singleton instance
export const pdfReportClient = new PdfReportClient();

/**
 * React Hook: usePdfReport
 * Manage PDF operations with loading and error states
 */
import { useCallback, useState } from 'react';

export const usePdfReport = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const download = useCallback(async (filter: string, date?: string) => {
    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      const result = await pdfReportClient.downloadPdf(filter, date, setProgress);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to download PDF';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const share = useCallback(async (filter: string, date?: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await pdfReportClient.sharePdf(filter, date);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to share PDF';
      setError(errorMsg);
      Alert.alert('Share Failed', errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const email = useCallback(async (emailAddr: string, filter: string, date?: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await pdfReportClient.emailPdf(emailAddr, filter, date);
      Alert.alert('Success', `Report sent to ${emailAddr}`);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to email PDF';
      setError(errorMsg);
      Alert.alert('Email Failed', errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    download,
    share,
    email,
    loading,
    error,
    progress,
    clearError
  };
};

/**
 * Offline support utilities
 */
export const pdfOfflineSupport = {
  async saveLastReport(filter: string, date: string, filename: string): Promise<void> {
    try {
      await AsyncStorage.setItem('lastReport', JSON.stringify({
        filter,
        date,
        filename,
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error('[PDF Offline] Save failed:', err);
    }
  },

  async getLastReport(): Promise<{ filter: string; date: string; filename: string; timestamp: string } | null> {
    try {
      const data = await AsyncStorage.getItem('lastReport');
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error('[PDF Offline] Get failed:', err);
      return null;
    }
  }
};
