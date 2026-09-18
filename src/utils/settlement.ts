import dayjs from 'dayjs';
import type {
  Payment,
  PaymentMethod,
  Service,
  CategorySummary,
  CommissionEntry,
  DailyStatement
} from '../types';
import { generateId } from './format';

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'voucher'];

export const getBusinessDate = (iso: string): string => dayjs(iso).format('YYYY-MM-DD');

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface StatementSummary {
  totalIncome: number;
  totalRefund: number;
  netIncome: number;
  byMethod: Record<PaymentMethod, number>;
  byCategory: CategorySummary[];
  commissions: CommissionEntry[];
}

/**
 * 汇总一组支付流水：
 * - 按收款方式汇总（退款按原方式冲减）
 * - 按项目分类汇总
 * - 按美容师汇总提成基数（应收）与实收，供对账
 */
export const summarizePayments = (payments: Payment[], services: Service[]): StatementSummary => {
  const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, voucher: 0 };
  const categoryMap = new Map<string, { count: number; amount: number }>();
  const commissionMap = new Map<string, { listBase: number; received: number }>();
  let totalIncome = 0;
  let totalRefund = 0;

  payments.forEach((p) => {
    byMethod[p.method] = round2(byMethod[p.method] + p.amount);

    const service = services.find((s) => s.id === p.serviceId);
    const category = service?.category || '其他';
    const cat = categoryMap.get(category) || { count: 0, amount: 0 };
    cat.count += 1;
    cat.amount = round2(cat.amount + p.amount);
    categoryMap.set(category, cat);

    const cm = commissionMap.get(p.employeeId) || { listBase: 0, received: 0 };
    cm.listBase = round2(cm.listBase + p.listPrice);
    cm.received = round2(cm.received + p.amount);
    commissionMap.set(p.employeeId, cm);

    if (p.amount >= 0) totalIncome = round2(totalIncome + p.amount);
    else totalRefund = round2(totalRefund + p.amount);
  });

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, v]) => ({ category, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  const commissions = Array.from(commissionMap.entries())
    .map(([employeeId, v]) => ({
      employeeId,
      listBase: v.listBase,
      received: v.received,
      diff: round2(v.received - v.listBase),
      diffNote: ''
    }))
    .sort((a, b) => b.received - a.received);

  return {
    totalIncome,
    totalRefund,
    netIncome: round2(totalIncome + totalRefund),
    byMethod,
    byCategory,
    commissions
  };
};

export const buildStatementNo = (businessDate: string, seq: number): string =>
  `DS${businessDate.replace(/-/g, '')}-${String(seq).padStart(2, '0')}`;

/**
 * 由流水生成结账单草稿（快照）。
 * 传入 previous 时保留其差异说明与备注（用于草稿刷新纳入新流水）。
 */
export const buildStatement = (
  businessDate: string,
  type: 'main' | 'supplement',
  seq: number,
  payments: Payment[],
  services: Service[],
  previous?: DailyStatement
): DailyStatement => {
  const summary = summarizePayments(payments, services);
  if (previous) {
    summary.commissions.forEach((c) => {
      const old = previous.commissions.find((o) => o.employeeId === c.employeeId);
      if (old) c.diffNote = old.diffNote;
    });
  }
  return {
    id: previous?.id || generateId(),
    statementNo: buildStatementNo(businessDate, seq),
    businessDate,
    type,
    seq,
    status: 'draft',
    ...summary,
    paymentIds: payments.map((p) => p.id),
    remark: previous?.remark || '',
    createdAt: previous?.createdAt || new Date().toISOString(),
    revisions: previous?.revisions || []
  };
};
