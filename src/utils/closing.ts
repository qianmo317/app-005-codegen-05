import type {
  PaymentEntry,
  PaymentMethod,
  PaymentMethodTotal,
  CategoryTotal,
  BeauticianTotal,
  Reconciliation,
  ReconItem,
  ManualReconItem,
  Employee,
  Service,
  ClosingTotals,
  RevisionChange,
} from '../types';

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'voucher'];

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: '现金',
  card: '刷卡',
  voucher: '券',
};

export const PAYMENT_COLOR: Record<PaymentMethod, string> = {
  cash: 'gold',
  card: 'blue',
  voucher: 'purple',
};

/** 金额四舍五入到分 */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** 取 ISO/Date 对应的本地营业日 YYYY-MM-DD */
export const localDateOf = (input: string | Date): string => {
  const d = typeof input === 'string' ? new Date(input) : input;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const nowIso = (): string => new Date().toISOString();

/** 将本地日期+时间拼成 ISO（保证营业日不被时区偏移） */
export const localDateTimeToIso = (dateStr: string, timeStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0).toISOString();
};

export const genPaymentId = (): string =>
  `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const genRevisionId = (): string =>
  `RV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const genManualDiffId = (): string =>
  `MD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** 生成单据号：PO-YYYYMMDD-xxxx */
export const genOrderNo = (businessDate: string): string =>
  `PO-${businessDate.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

/** 结账单号：JZD-YYYYMMDD-seq */
export const statementNo = (businessDate: string, seq: number): string =>
  `JZD-${businessDate.replace(/-/g, '')}-${seq}`;

/**
 * 提成基数默认值：
 * 现金/刷卡全额计入；券属于预付载体，本次不产生新的提成基数
 * 退单（amount 为负）时取同号负值
 */
export const defaultCommissionBase = (method: PaymentMethod, amount: number): number => {
  if (method === 'voucher') return 0;
  return round2(amount);
};

/** 按收款方式汇总 */
export const summarizeByMethod = (entries: PaymentEntry[]): PaymentMethodTotal[] => {
  return PAYMENT_METHODS.map((method) => {
    const list = entries.filter((e) => e.method === method);
    return {
      method,
      count: list.length,
      amount: round2(list.reduce((sum, e) => sum + e.amount, 0)),
    };
  });
};

/** 按项目分类汇总（退单负数自然冲减） */
export const summarizeByCategory = (entries: PaymentEntry[]): CategoryTotal[] => {
  const map = new Map<string, CategoryTotal>();
  entries.forEach((e) => {
    const cur = map.get(e.category) || { category: e.category, count: 0, amount: 0 };
    cur.count += e.type === 'refund' ? -1 : 1;
    cur.amount = round2(cur.amount + e.amount);
    map.set(e.category, cur);
  });
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
};

/** 按美容师汇总提成基数 */
export const summarizeByBeautician = (
  entries: PaymentEntry[],
  employees: Employee[]
): BeauticianTotal[] => {
  const map = new Map<string, BeauticianTotal>();
  entries.forEach((e) => {
    const emp = employees.find((x) => x.id === e.employeeId);
    const key = e.employeeId;
    const cur =
      map.get(key) ||
      ({
        employeeId: key,
        name: emp?.name || '未知美容师',
        count: 0,
        received: 0,
        voucherAmount: 0,
        commissionBase: 0,
        rate: emp?.commissionRate ?? 0,
        commission: 0,
      } as BeauticianTotal);
    cur.count += e.type === 'refund' ? -1 : 1;
    cur.received = round2(cur.received + e.amount);
    if (e.method === 'voucher') cur.voucherAmount = round2(cur.voucherAmount + e.amount);
    cur.commissionBase = round2(cur.commissionBase + e.commissionBase);
    map.set(key, cur);
  });
  return Array.from(map.values())
    .map((b) => ({ ...b, commission: round2(b.commissionBase * b.rate) }))
    .sort((a, b) => b.commissionBase - a.commissionBase);
};

/** 汇总合计 */
export const summarizeTotals = (entries: PaymentEntry[]): ClosingTotals => {
  const sum = (pred: (e: PaymentEntry) => boolean) =>
    round2(entries.filter(pred).reduce((s, e) => s + e.amount, 0));
  const cash = sum((e) => e.method === 'cash');
  const card = sum((e) => e.method === 'card');
  const voucher = sum((e) => e.method === 'voucher');
  const refund = round2(entries.filter((e) => e.type === 'refund').reduce((s, e) => s + e.amount, 0));
  const totalReceived = round2(cash + card + voucher);
  return {
    totalReceived,
    cash,
    card,
    voucher,
    refund,
    commissionBase: round2(entries.reduce((s, e) => s + e.commissionBase, 0)),
    count: entries.length,
  };
};

/**
 * 对账：核对 实收合计 与 提成基数合计。
 * 差额 = 实收合计 − 提成基数合计，必须能逐项解释：
 *  1) 券金额（券不计提成）
 *  2) 手工调整（挂账、抹零、平台抽成等，需写明原因）
 *  3) 未能解释的部分 → 对不上
 */
export const buildReconciliation = (
  totals: ClosingTotals,
  manualDiffs: ManualReconItem[]
): Reconciliation => {
  const items: ReconItem[] = [];
  const diff = round2(totals.totalReceived - totals.commissionBase);

  if (Math.abs(totals.voucher) > 0.001) {
    items.push({
      key: 'voucher',
      label: '券支付金额（券为预付载体，不计入提成基数）',
      amount: totals.voucher,
      kind: 'voucher',
    });
  }

  manualDiffs.forEach((m) => {
    items.push({ key: m.id, label: m.reason, amount: round2(m.amount), kind: 'manual' });
  });

  const explained = round2(items.reduce((s, i) => s + i.amount, 0));
  const unexplained = round2(diff - explained);
  const balanced = Math.abs(unexplained) < 0.01;

  if (!balanced) {
    items.push({
      key: '__unexplained__',
      label: '未解释差异：实收与提成基数对不上，请核实是否漏登、金额录错或补登手工说明',
      amount: unexplained,
      kind: 'unexplained',
    });
  }

  return { items, unexplained, balanced };
};

export interface StatementInput {
  businessDate: string;
  seq: number;
  type: 'regular' | 'supplement';
  entries: PaymentEntry[];
  employees: Employee[];
  manualDiffs?: ManualReconItem[];
  note?: string;
}

/** 由流水算出结账单全部汇总数据（不改变流水本身） */
export const computeStatementData = (input: StatementInput) => {
  const { businessDate, seq, type, entries, employees, manualDiffs = [], note = '' } = input;
  const totals = summarizeTotals(entries);
  return {
    businessDate,
    seq,
    type,
    paymentIds: entries.map((e) => e.id),
    totals,
    byMethod: summarizeByMethod(entries),
    byCategory: summarizeByCategory(entries),
    byBeautician: summarizeByBeautician(entries, employees),
    reconciliation: buildReconciliation(totals, manualDiffs),
    manualDiffs,
    note,
  };
};

/** 比较两张结账单数据，生成修改痕迹（确认后改动留痕用） */
export const diffStatements = (
  beforeEntries: PaymentEntry[],
  afterEntries: PaymentEntry[],
  beforeManual: ManualReconItem[],
  afterManual: ManualReconItem[],
  beforeNote: string,
  afterNote: string
): RevisionChange[] => {
  const changes: RevisionChange[] = [];
  const money = (n: number) => `¥${n.toFixed(2)}`;
  const beforeMap = new Map(beforeEntries.map((e) => [e.id, e]));
  const afterMap = new Map(afterEntries.map((e) => [e.id, e]));

  afterEntries.forEach((after) => {
    const before = beforeMap.get(after.id);
    if (!before) {
      changes.push({
        field: `entry:${after.id}:add`,
        label: `补登流水 ${after.orderNo}（${PAYMENT_LABEL[after.method]}）`,
        before: '—',
        after: money(after.amount),
      });
      return;
    }
    if (round2(before.amount - after.amount) !== 0) {
      changes.push({
        field: `entry:${after.id}:amount`,
        label: `流水 ${after.orderNo} 实收金额`,
        before: money(before.amount),
        after: money(after.amount),
      });
    }
    if (round2(before.commissionBase - after.commissionBase) !== 0) {
      changes.push({
        field: `entry:${after.id}:base`,
        label: `流水 ${after.orderNo} 提成基数`,
        before: money(before.commissionBase),
        after: money(after.commissionBase),
      });
    }
    if ((before.note || '') !== (after.note || '')) {
      changes.push({
        field: `entry:${after.id}:note`,
        label: `流水 ${after.orderNo} 备注`,
        before: before.note || '—',
        after: after.note || '—',
      });
    }
  });

  beforeEntries.forEach((before) => {
    if (!afterMap.has(before.id)) {
      changes.push({
        field: `entry:${before.id}:remove`,
        label: `移除流水 ${before.orderNo}`,
        before: money(before.amount),
        after: '—',
      });
    }
  });

  const bm = new Map(beforeManual.map((m) => [m.id, m]));
  const am = new Map(afterManual.map((m) => [m.id, m]));
  afterManual.forEach((m) => {
    const old = bm.get(m.id);
    if (!old) {
      changes.push({
        field: `manual:${m.id}:add`,
        label: `新增对账说明：${m.reason}`,
        before: '—',
        after: money(m.amount),
      });
    } else if (old.reason !== m.reason || round2(old.amount - m.amount) !== 0) {
      changes.push({
        field: `manual:${m.id}`,
        label: `对账说明：${m.reason}`,
        before: `${old.reason} ${money(old.amount)}`,
        after: `${m.reason} ${money(m.amount)}`,
      });
    }
  });
  beforeManual.forEach((m) => {
    if (!am.has(m.id)) {
      changes.push({
        field: `manual:${m.id}:remove`,
        label: `删除对账说明：${m.reason}`,
        before: money(m.amount),
        after: '—',
      });
    }
  });

  if (beforeNote !== afterNote) {
    changes.push({ field: 'note', label: '结账单备注', before: beforeNote || '—', after: afterNote || '—' });
  }

  return changes;
};

/** 校验：跨到第二天的收入不许并回前一天 */
export const validateBusinessDate = (
  businessDate: string,
  receivedAt: string
): string | null => {
  const receivedDay = localDateOf(receivedAt);
  if (businessDate < receivedDay) {
    return `该笔收款实际发生在 ${receivedDay}（已跨到第二天），不许并回 ${businessDate}，请改记到 ${receivedDay} 的结账单`;
  }
  if (businessDate > receivedDay) {
    return '营业日不能晚于实际收款时间';
  }
  return null;
};

/** 取某营业日下一张结账单序号 */
export const nextSeq = (
  statements: { businessDate: string; seq: number }[],
  businessDate: string
): number => {
  const seqs = statements.filter((s) => s.businessDate === businessDate).map((s) => s.seq);
  return seqs.length ? Math.max(...seqs) + 1 : 1;
};

export const categoryOf = (serviceId: string, services: Service[]): string =>
  services.find((s) => s.id === serviceId)?.category || '其他';
