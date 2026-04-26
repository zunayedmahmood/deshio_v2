import axios from '@/lib/axios';

// Minimal Lookup API wrapper (extendable)
export type LookupApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
  errors?: any;
};

export type LookupOrder = any; // Keep flexible; backend may evolve.

const lookupService = {
  async getOrder(orderId: number): Promise<LookupApiResponse<LookupOrder>> {
    const res = await axios.get(`/lookup/order/${orderId}`);
    return res.data;
  },

  async getProductByBarcode(barcode: string): Promise<LookupApiResponse<any>> {
    const res = await axios.get(`/lookup/product/${barcode}`);
    return res.data;
  },

  async getBatch(batchId: number): Promise<LookupApiResponse<any>> {
    const res = await axios.get(`/lookup/batch/${batchId}`);
    return res.data;
  },
};

export default lookupService;
