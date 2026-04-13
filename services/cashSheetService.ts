import axiosInstance from '@/lib/axios';

export interface BranchDay {
  store_id: number;
  store_name: string;
  daily_sale: number;
  daily_cash: number;
  daily_bank: number;
  ex_on: number;
  salary_set_aside: number;
  daily_cost: number;
  daily_cost_details: string | null;
}

export interface OnlineDay {
  daily_sales: number;
  advance: number;
  online_payment: number;
  cod: number;
}

export interface Disbursements {
  sslzc_received: number;
  pathao_received: number;
}

export interface DayTotals {
  total_sale: number;
  cash: number;
  bank: number;
  online_payment: number;
  sslzc: number;
  pathao: number;
  final_bank: number;
}

export interface OwnerDay {
  boss_cash_add: number;
  boss_cash_add_details: string | null;
  boss_bank_add: number;
  boss_bank_add_details: string | null;
  total_cash: number;
  total_bank: number;
  boss_cash_cost: number;
  boss_cash_cost_details: string | null;
  cash_after_cost: number;
  boss_bank_cost: number;
  boss_bank_cost_details: string | null;
  bank_after_cost: number;
}

export interface CashSheetRow {
  date: string;
  branches: BranchDay[];
  online: OnlineDay;
  disbursements: Disbursements;
  totals: DayTotals;
  owner: OwnerDay;
}

export interface CashSheetSummary {
  branches: BranchDay[];
  online: OnlineDay;
  disbursements: Disbursements;
  totals: DayTotals;
  owner: OwnerDay;
}

export interface CashSheetResponse {
  success: boolean;
  month: string;
  stores: { id: number; name: string }[];
  data: CashSheetRow[];
  summary: CashSheetSummary;
}

export interface SaveBranchPayload {
  date: string;
  store_id: number;
  salary_set_aside?: number;
  daily_cost?: number;
  daily_cost_details?: string;
}

export interface SaveOwnerPayload {
  date: string;
  sslzc_received?: number;
  pathao_received?: number;
  boss_cash_add?: number;
  boss_cash_add_details?: string;
  boss_bank_add?: number;
  boss_bank_add_details?: string;
  boss_cash_cost?: number;
  boss_cash_cost_details?: string;
  boss_bank_cost?: number;
  boss_bank_cost_details?: string;
}

const cashSheetService = {
  async getSheet(month: string): Promise<CashSheetResponse> {
    const res = await axiosInstance.get('/cash-sheet', { params: { month } });
    return res.data;
  },

  async saveBranch(payload: SaveBranchPayload): Promise<void> {
    await axiosInstance.post('/cash-sheet/branch', payload);
  },

  async saveOwner(payload: SaveOwnerPayload): Promise<void> {
    await axiosInstance.post('/cash-sheet/owner', payload);
  },
};

export default cashSheetService;
