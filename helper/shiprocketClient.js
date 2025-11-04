import axios from 'axios';
import dotEnv from 'dotenv';

dotEnv.config({ path: './.env' });

// Correct Shiprocket API base URL
const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

class ShiprocketClient {
  constructor() {
    this.token = null;
    this.expiresAt = 0; // epoch ms
    this.http = axios.create({
      baseURL: SHIPROCKET_BASE_URL,
      timeout: 30000, // Increased timeout for better reliability
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  async login() {
    try {
      // Validate credentials exist
      if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) {
        throw new Error('Shiprocket credentials not configured in .env file');
      }

      const response = await this.http.post('/auth/login', {
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD
      });
      
      if (response.data && response.data.token) {
        this.token = response.data.token;
        // Shiprocket tokens are valid for 10 days (240 hours)
        this.expiresAt = Date.now() + (240 * 60 * 60 * 1000);
        console.log('✅ Shiprocket login successful');
        return this.token;
      } else {
        throw new Error('Invalid login response from Shiprocket');
      }
    } catch (error) {
      const errorDetails = error.response?.data || error.message;
      console.error('❌ Shiprocket login failed:', errorDetails);
      
      if (error.response?.status === 401) {
        throw new Error('Shiprocket login failed: Invalid email or password. Please check your .env file credentials.');
      }
      
      throw new Error(`Shiprocket authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async getToken() {
    // Check if token expired or doesn't exist
    if (!this.token || Date.now() > this.expiresAt) {
      console.log('🔄 Token expired or missing, refreshing...');
      await this.login();
    }
    return this.token;
  }

  // Expose auth status for diagnostics
  getStatus() {
    return {
      hasToken: !!this.token,
      expiresAt: this.expiresAt,
      expiresInMs: Math.max(0, this.expiresAt - Date.now()),
      isExpired: Date.now() > this.expiresAt
    };
  }

  // Optional: force logout/clear token
  logout() {
    this.token = null;
    this.expiresAt = 0;
    console.log('🔓 Shiprocket token cleared');
  }

  async request(config) {
    let retryCount = 0;
    const maxRetries = 1; // Only retry once for 401 errors

    while (retryCount <= maxRetries) {
      try {
        const token = await this.getToken();
        const headers = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(config.headers || {})
        };

        const response = await this.http.request({ 
          ...config, 
          headers 
        });
        
        return response.data;
      } catch (error) {
        const statusCode = error.response?.status;
        const errorMessage = error.response?.data?.message || 
                            error.response?.data?.error || 
                            error.message;
        
        // Handle 401 Unauthorized - token might be invalid
        if (statusCode === 401 && retryCount < maxRetries) {
          console.warn('⚠️ Received 401 Unauthorized, refreshing token and retrying...');
          // Clear token and force new login
          this.logout();
          retryCount++;
          continue; // Retry the request
        }
        
        // Handle other errors or max retries reached
        console.error('❌ Shiprocket API Error:', {
          url: config.url,
          method: config.method,
          error: errorMessage,
          status: statusCode,
          data: error.response?.data,
          retryAttempt: retryCount
        });
        
        // If it's a 401 after retry, provide more specific error
        if (statusCode === 401) {
          throw new Error(`Unauthorized: ${errorMessage}. Please verify your Shiprocket account has API access and proper permissions.`);
        }
        
        throw new Error(errorMessage);
      }
    }
  }
}

export default new ShiprocketClient();