export interface Customer {
  id: string;
  name: string;
  phone: string;
  birthday: string;
  gender: 'male' | 'female';
  avatar: string;
  address: string;
  skinType: string;
  notes: string;
  createdAt: string;
}

export interface SkinAnalysis {
  id: string;
  customerId: string;
  analysisDate: string;
  skinType: string;
  oiliness: string;
  moisture: string;
  elasticity: string;
  sensitivity: string;
  skinCondition: string;
  recommendations: string;
  photoUrl?: string;
}

export interface Allergy {
  id: string;
  customerId: string;
  allergen: string;
  severity: 'mild' | 'moderate' | 'severe';
  discoveredDate: string;
  notes: string;
}

export interface ServiceRecord {
  id: string;
  customerId: string;
  serviceId: string;
  employeeId: string;
  serviceDate: string;
  price: number;
  notes: string;
}

export interface Membership {
  id: string;
  customerId: string;
  level: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  points: number;
  totalSpent: number;
  joinDate: string;
  expireDate: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  duration: number;
  price: number;
  description: string;
  suitableSkin: string[];
  effectDescription: string;
  imageUrl: string;
  status: 'active' | 'inactive';
}

export interface Package {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  validityDays: number;
  description: string;
  imageUrl: string;
  status: 'active' | 'inactive';
}

export interface PackageItem {
  id: string;
  packageId: string;
  serviceId: string;
  count: number;
}

export interface Appointment {
  id: string;
  customerId: string;
  serviceId: string;
  employeeId: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  source: 'phone' | 'wechat' | 'walk_in' | 'online';
  notes: string;
  reminderSent: boolean;
}

export interface WaitList {
  id: string;
  customerId: string;
  serviceId: string;
  preferredDate: string;
  addedAt: string;
  status: 'waiting' | 'notified' | 'cancelled' | 'booked';
}

export interface Employee {
  id: string;
  name: string;
  role: 'beautician' | 'manager' | 'receptionist' | 'technician';
  phone: string;
  avatar: string;
  hireDate: string;
  baseSalary: number;
  commissionRate: number;
  skills: string[];
  status: 'active' | 'leave' | 'terminated';
}

export interface Schedule {
  id: string;
  employeeId: string;
  date: string;
  shiftType: 'morning' | 'afternoon' | 'full_day' | 'off' | 'overtime';
  startTime: string;
  endTime: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: 'present' | 'absent' | 'late' | 'leave';
}

export interface Review {
  id: string;
  employeeId: string;
  customerId: string;
  rating: number;
  comment: string;
  reviewDate: string;
  serviceId: string;
}

export interface Commission {
  id: string;
  employeeId: string;
  serviceRecordId: string;
  amount: number;
  commissionDate: string;
}

export interface DashboardStats {
  monthlyRevenue: number;
  newCustomers: number;
  totalAppointments: number;
  completedServices: number;
  revenueTrend: { date: string; value: number }[];
  topEmployees: { name: string; value: number }[];
  todayAppointments: TodayAppointment[];
}

export interface TodayAppointment {
  id: string;
  customerName: string;
  customerAvatar: string;
  serviceName: string;
  employeeName: string;
  time: string;
  status: string;
}

/* ========== 财务结账（每日结账单） ========== */

/** 收款方式：现金 / 刷卡 / 券 */
export type PaymentMethod = 'cash' | 'card' | 'voucher';

/** 流水类型：收入 / 退单（冲减） */
export type PaymentType = 'income' | 'refund';

/**
 * 收款流水（一笔实收记录）
 * 一单多付时按收款方式拆成多条，共用 orderNo
 * amount / commissionBase 退单时为负数
 */
export interface PaymentEntry {
  id: string;
  /** 单据号（一单多付的拆分流水共用） */
  orderNo: string;
  /** 归属营业日 YYYY-MM-DD */
  businessDate: string;
  /** 实际收款/退款时间（ISO，用于判断是否跨到第二天） */
  receivedAt: string;
  customerId: string;
  serviceId: string;
  /** 项目分类冗余字段，便于汇总留档 */
  category: string;
  employeeId: string;
  method: PaymentMethod;
  /** 实收金额（退单为负） */
  amount: number;
  /** 提成基数（券部分不计入，退单为负；可手工调整） */
  commissionBase: number;
  type: PaymentType;
  /** 退单关联的原单号 */
  refOrderNo?: string;
  note?: string;
  /** 已被哪张结账单锁定；null/undefined 表示尚未结账 */
  statementId?: string | null;
  createdAt: string;
}

export type ClosingStatus = 'draft' | 'confirmed';
export type ClosingType = 'regular' | 'supplement';

export interface PaymentMethodTotal {
  method: PaymentMethod;
  count: number;
  amount: number;
}

export interface CategoryTotal {
  category: string;
  count: number;
  amount: number;
}

export interface BeauticianTotal {
  employeeId: string;
  name: string;
  /** 服务单数（退单计 -1） */
  count: number;
  /** 实收合计 */
  received: number;
  /** 其中券金额 */
  voucherAmount: number;
  /** 提成基数合计 */
  commissionBase: number;
  /** 提成比例 */
  rate: number;
  /** 按比例试算的提成金额 */
  commission: number;
}

export type ReconItemKind = 'voucher' | 'manual' | 'unexplained';

export interface ReconItem {
  key: string;
  label: string;
  /** 对（实收合计 − 提成基数合计）差额的贡献额，正/负 */
  amount: number;
  kind: ReconItemKind;
}

/** 手工对账说明（挂账、抹零、平台抽成等） */
export interface ManualReconItem {
  id: string;
  reason: string;
  /** 对差额（实收 − 提成基数）的影响金额，可正可负 */
  amount: number;
}

export interface RevisionChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface StatementRevision {
  id: string;
  at: string;
  operator: string;
  action: 'create' | 'confirm' | 'amend';
  reason?: string;
  changes: RevisionChange[];
}

export interface ClosingTotals {
  /** 实收合计 = 现金 + 刷卡 + 券（退单已冲减） */
  totalReceived: number;
  cash: number;
  card: number;
  voucher: number;
  /** 退单冲减合计（负数） */
  refund: number;
  /** 提成基数合计 */
  commissionBase: number;
  /** 流水笔数 */
  count: number;
}

export interface Reconciliation {
  items: ReconItem[];
  /** 未解释差异 */
  unexplained: number;
  /** 是否对得上 */
  balanced: boolean;
}

export interface ClosingStatement {
  id: string;
  /** 结账单号 JZD-YYYYMMDD-seq */
  no: string;
  businessDate: string;
  /** 当日序号：第一张为 1，补单从 2 起 */
  seq: number;
  /** regular 正常结账 / supplement 确认后补单 */
  type: ClosingType;
  status: ClosingStatus;
  paymentIds: string[];
  totals: ClosingTotals;
  byMethod: PaymentMethodTotal[];
  byCategory: CategoryTotal[];
  byBeautician: BeauticianTotal[];
  reconciliation: Reconciliation;
  manualDiffs: ManualReconItem[];
  /** 确认时冻结的流水快照 */
  entriesSnapshot: PaymentEntry[];
  note: string;
  createdAt: string;
  createdBy: string;
  confirmedAt?: string;
  confirmedBy?: string;
  revisions: StatementRevision[];
}
