import Mock from 'mockjs';
import type {
  Customer,
  Service,
  Employee,
  PaymentEntry,
  PaymentMethod,
  ClosingStatement,
  ManualReconItem,
  StatementRevision,
} from '../types';
import {
  round2,
  genOrderNo,
  statementNo,
  defaultCommissionBase,
  computeStatementData,
  localDateTimeToIso,
  genRevisionId,
} from '../utils/closing';

const Random = Mock.Random;

const METHODS: PaymentMethod[] = ['cash', 'card', 'voucher'];

const pad = (n: number) => String(n).padStart(2, '0');

/** 本地偏移日字符串 */
const dayOffset = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

let entrySeq = 0;
const nextEntryId = () => `PAY${String(++entrySeq).padStart(6, '0')}`;

interface BuildOptions {
  /** 手工把某笔流水的提成基数改掉，演示“对不上写清差在哪里” */
  tweakBase?: boolean;
  /** 追加几笔确认后补登的流水（补单用） */
  extra?: number;
  /** 生成一笔退单冲减 */
  withRefund?: boolean;
  locked?: boolean;
}

const buildDayEntries = (
  offset: number,
  customers: Customer[],
  services: Service[],
  employees: Employee[],
  opts: BuildOptions = {}
): PaymentEntry[] => {
  const date = dayOffset(offset);
  const beauticians = employees.filter(
    (e) => e.status === 'active' && (e.role === 'beautician' || e.role === 'technician')
  );
  const entries: PaymentEntry[] = [];

  const incomeCount = 8;
  let tweaked = false;

  const pushIncome = (hour: number) => {
    const service = services[Random.integer(0, services.length - 1)];
    const method = METHODS[Random.integer(0, METHODS.length - 1)];
    const employee = beauticians.find((e) => e.skills.includes(service.id)) || beauticians[Random.integer(0, beauticians.length - 1)];
    const customer = customers[Random.integer(0, customers.length - 1)];
    const amount = round2(service.price * (Random.integer(85, 115) / 100));
    let base = defaultCommissionBase(method, amount);

    let note: string | undefined;
    if (opts.tweakBase && !tweaked && method === 'card') {
      // 演示：顾客走团购平台，到账被抽佣 120，提成基数按实收口径核减
      base = round2(amount - 120);
      note = '团购平台抽佣 ¥120.00，提成基数按门店实际到账核减';
      tweaked = true;
    }

    entries.push({
      id: nextEntryId(),
      orderNo: genOrderNo(date),
      businessDate: date,
      receivedAt: localDateTimeToIso(date, `${pad(hour)}:${pad(Random.integer(0, 59))}`),
      customerId: customer.id,
      serviceId: service.id,
      category: service.category,
      employeeId: employee.id,
      method,
      amount,
      commissionBase: base,
      type: 'income',
      note,
      statementId: opts.locked ? '__pending__' : null,
      createdAt: localDateTimeToIso(date, `${pad(hour)}:00`),
    });
  };

  // 营业时段 9:00 - 20:00（Random.shuffle 原地打乱）
  const hourPool = [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20];
  Random.shuffle(hourPool);
  const hours = hourPool.slice(0, incomeCount + (opts.extra || 0));
  hours.slice(0, incomeCount).forEach((h) => pushIncome(h));

  if (opts.withRefund) {
    // 退单：当天发生、当天冲减，挂在当天一位美容师名下
    const target = entries[Random.integer(0, entries.length - 1)];
    entries.push({
      id: nextEntryId(),
      orderNo: genOrderNo(date),
      businessDate: date,
      receivedAt: localDateTimeToIso(date, `${pad(Random.integer(18, 20))}:${pad(Random.integer(0, 59))}`),
      customerId: target.customerId,
      serviceId: target.serviceId,
      category: target.category,
      employeeId: target.employeeId,
      method: target.method,
      amount: round2(-target.amount),
      commissionBase: round2(-target.commissionBase),
      type: 'refund',
      refOrderNo: target.orderNo,
      note: '顾客对护理效果不满意，当天退单冲减',
      statementId: opts.locked ? '__pending__' : null,
      createdAt: localDateTimeToIso(date, '20:05'),
    });
  }

  // 关店确认后补登的流水（发生在 21 点后）
  if (opts.extra) {
    hours.slice(incomeCount).forEach(() => {
      const service = services[Random.integer(0, services.length - 1)];
      const employee = beauticians.find((e) => e.skills.includes(service.id)) || beauticians[0];
      const customer = customers[Random.integer(0, customers.length - 1)];
      const method = METHODS[Random.integer(0, METHODS.length - 1)];
      const amount = round2(service.price * (Random.integer(90, 110) / 100));
      entries.push({
        id: nextEntryId(),
        orderNo: genOrderNo(date),
        businessDate: date,
        receivedAt: localDateTimeToIso(date, `21:${pad(Random.integer(10, 50))}`),
        customerId: customer.id,
        serviceId: service.id,
        category: service.category,
        employeeId: employee.id,
        method,
        amount,
        commissionBase: defaultCommissionBase(method, amount),
        type: 'income',
        note: '关店后补录的熟客加单',
        statementId: opts.locked ? '__pending__' : null,
        createdAt: localDateTimeToIso(date, '21:50'),
      });
    });
  }

  return entries;
};

let statementSeq = 0;
const nextStatementId = () => `JZD${String(++statementSeq).padStart(6, '0')}`;

const buildStatement = (
  businessDate: string,
  seq: number,
  type: 'regular' | 'supplement',
  lockedEntries: PaymentEntry[],
  employees: Employee[],
  manualDiffs: ManualReconItem[] = [],
  confirmOffset: { h: number; m: number } = { h: 21, m: 30 }
): ClosingStatement => {
  const id = nextStatementId();
  lockedEntries.forEach((e) => (e.statementId = id));

  const data = computeStatementData({ businessDate, seq, type, entries: lockedEntries, employees, manualDiffs });
  const now = () => localDateTimeToIso(businessDate, `${pad(confirmOffset.h)}:${pad(confirmOffset.m)}`);

  const revisions: StatementRevision[] = [
    {
      id: genRevisionId(),
      at: localDateTimeToIso(businessDate, '21:05'),
      operator: '孙店长',
      action: 'create',
      changes: [],
    },
  ];
  if (manualDiffs.length) {
    revisions.push({
      id: genRevisionId(),
      at: localDateTimeToIso(businessDate, '21:20'),
      operator: '孙店长',
      action: 'amend',
      reason: '补登对账说明',
      changes: manualDiffs.map((m) => ({
        field: m.id,
        label: `新增对账说明：${m.reason}`,
        before: '—',
        after: `¥${m.amount.toFixed(2)}`,
      })),
    });
  }
  revisions.push({
    id: genRevisionId(),
    at: now(),
    operator: '孙店长',
    action: 'confirm',
    changes: [],
  });

  return {
    id,
    no: statementNo(businessDate, seq),
    ...data,
    entriesSnapshot: lockedEntries.map((e) => ({ ...e })),
    createdAt: localDateTimeToIso(businessDate, '21:05'),
    createdBy: '孙店长',
    confirmedAt: now(),
    confirmedBy: '孙店长',
    status: 'confirmed',
    revisions,
  };
};

export interface ClosingSeed {
  payments: PaymentEntry[];
  statements: ClosingStatement[];
}

export const mockClosing = (
  customers: Customer[],
  services: Service[],
  employees: Employee[]
): ClosingSeed => {
  const payments: PaymentEntry[] = [];
  const statements: ClosingStatement[] = [];

  // 前 5 天：均已结账留档（-4 含手工对账说明演示差异解释；-3 含一张补单；-2/-1 含退单冲减）
  const plan: { offset: number; tweak?: boolean; refund?: boolean; extra?: number }[] = [
    { offset: -5 },
    { offset: -4, tweak: true },
    { offset: -3, extra: 2 },
    { offset: -2, refund: true },
    { offset: -1, refund: true },
  ];

  plan.forEach(({ offset, tweak, refund, extra }) => {
    const date = dayOffset(offset);

    // 第一张：正常结账单
    const firstEntries = buildDayEntries(offset, customers, services, employees, {
      tweakBase: tweak,
      withRefund: refund,
      locked: true,
      extra,
    });
    // buildDayEntries 先放 8 笔收入，可能再追加 1 笔退单，最后是补单的 extra 笔
    const splitAt = 8 + (refund ? 1 : 0);
    const regularEntries = firstEntries.slice(0, splitAt);
    const extraEntries = firstEntries.slice(splitAt);

    const manualDiffs: ManualReconItem[] = [];
    if (tweak) {
      manualDiffs.push({
        id: `MD-SEED-${offset}`,
        reason: '团购平台抽佣（按门店实际到账核减提成基数，实收多出部分）',
        amount: 120,
      });
    }

    payments.push(...regularEntries);
    statements.push(buildStatement(date, 1, 'regular', regularEntries, employees, manualDiffs));

    // 补单：确认后又补登的收入，另起一张 seq=2
    if (extraEntries.length) {
      payments.push(...extraEntries);
      statements.push(
        buildStatement(date, 2, 'supplement', extraEntries, employees, [], { h: 22, m: 10 })
      );
    }
  });

  // 今天：已有流水但尚未结账，供演示“关店前出结账单”
  const todayEntries = buildDayEntries(0, customers, services, employees, { locked: false });
  payments.push(...todayEntries);

  return { payments, statements };
};
