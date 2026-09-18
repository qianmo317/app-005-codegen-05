import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { storage } from '../utils/storage';
import type {
  Customer,
  SkinAnalysis,
  Allergy,
  Membership,
  Service,
  Package,
  PackageItem,
  Employee,
  Appointment,
  ServiceRecord,
  Schedule,
  Review,
  Attendance,
  Commission,
  WaitList,
  PaymentEntry,
  ClosingStatement,
  ManualReconItem
} from '../types';
import {
  mockCustomers,
  mockSkinAnalyses,
  mockAllergies,
  mockMemberships,
  mockServices,
  mockPackages,
  mockPackageItems,
  mockEmployees,
  mockAppointments,
  mockServiceRecords,
  mockSchedules,
  mockReviews,
  mockAttendance,
  mockCommissions,
  mockWaitList
} from '../mock';
import { mockClosing } from '../mock/closing';
import {
  computeStatementData,
  diffStatements,
  genPaymentId,
  genRevisionId,
  nextSeq,
  nowIso,
  round2,
  statementNo,
} from '../utils/closing';

interface AppState {
  customers: Customer[];
  skinAnalyses: SkinAnalysis[];
  allergies: Allergy[];
  memberships: Membership[];
  services: Service[];
  packages: Package[];
  packageItems: PackageItem[];
  employees: Employee[];
  appointments: Appointment[];
  serviceRecords: ServiceRecord[];
  schedules: Schedule[];
  reviews: Review[];
  attendance: Attendance[];
  commissions: Commission[];
  waitList: WaitList[];
  paymentEntries: PaymentEntry[];
  closingStatements: ClosingStatement[];
  initialized: boolean;
}

const STORAGE_KEY = 'app_state';

const loadState = (): AppState => {
  try {
    const saved = storage.get<AppState>(STORAGE_KEY);
    if (saved && saved.initialized) {
      // Verify data integrity
      const firstCustomer = saved.customers[0];
      if (firstCustomer && firstCustomer.avatar && firstCustomer.avatar.includes('data:image/svg+xml;base64,')) {
        const b64 = firstCustomer.avatar.replace('data:image/svg+xml;base64,', '');
        try {
          atob(b64);
          // 兼容旧存档：补齐每日结账模块数据
          if (!saved.paymentEntries || !saved.closingStatements) {
            const seed = mockClosing(saved.customers, saved.services, saved.employees);
            saved.paymentEntries = seed.payments;
            saved.closingStatements = seed.statements;
            storage.set(STORAGE_KEY, saved);
          }
          return saved;
        } catch {
          console.log('Detected corrupted data, regenerating...');
          storage.clear();
        }
      }
    }
  } catch {
    console.log('Loading fresh data...');
  }

  const customers = mockCustomers();
  const customerIds = customers.map(c => c.id);
  const services = mockServices() as Service[];
  const serviceIds = services.map(s => s.id);
  const employees = mockEmployees() as Employee[];
  const employeeIds = employees.map(e => e.id);
  const packages = mockPackages() as Package[];
  const closingSeed = mockClosing(customers, services, employees);

  return {
    customers,
    skinAnalyses: mockSkinAnalyses(customerIds),
    allergies: mockAllergies(customerIds),
    memberships: mockMemberships(customerIds),
    services,
    packages,
    packageItems: mockPackageItems(packages),
    employees,
    appointments: mockAppointments(customerIds, serviceIds, employeeIds),
    serviceRecords: mockServiceRecords(customerIds, serviceIds, employeeIds),
    schedules: mockSchedules(employeeIds),
    reviews: mockReviews(customerIds, employeeIds, serviceIds),
    attendance: mockAttendance(employeeIds),
    commissions: mockCommissions(employeeIds),
    waitList: mockWaitList(customerIds, serviceIds),
    paymentEntries: closingSeed.payments,
    closingStatements: closingSeed.statements,
    initialized: true
  };
};

const initialState: AppState = loadState();

const saveState = (state: AppState) => {
  storage.set(STORAGE_KEY, state);
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    addCustomer: (state, action: PayloadAction<Customer>) => {
      state.customers.unshift(action.payload);
      saveState(state);
    },
    updateCustomer: (state, action: PayloadAction<Customer>) => {
      const index = state.customers.findIndex(c => c.id === action.payload.id);
      if (index !== -1) {
        state.customers[index] = action.payload;
        saveState(state);
      }
    },
    deleteCustomer: (state, action: PayloadAction<string>) => {
      state.customers = state.customers.filter(c => c.id !== action.payload);
      saveState(state);
    },
    addSkinAnalysis: (state, action: PayloadAction<SkinAnalysis>) => {
      state.skinAnalyses.unshift(action.payload);
      saveState(state);
    },
    addAllergy: (state, action: PayloadAction<Allergy>) => {
      state.allergies.unshift(action.payload);
      saveState(state);
    },
    updateAllergy: (state, action: PayloadAction<Allergy>) => {
      const index = state.allergies.findIndex(a => a.id === action.payload.id);
      if (index !== -1) {
        state.allergies[index] = action.payload;
        saveState(state);
      }
    },
    deleteAllergy: (state, action: PayloadAction<string>) => {
      state.allergies = state.allergies.filter(a => a.id !== action.payload);
      saveState(state);
    },
    addService: (state, action: PayloadAction<Service>) => {
      state.services.unshift(action.payload);
      saveState(state);
    },
    updateService: (state, action: PayloadAction<Service>) => {
      const index = state.services.findIndex(s => s.id === action.payload.id);
      if (index !== -1) {
        state.services[index] = action.payload;
        saveState(state);
      }
    },
    deleteService: (state, action: PayloadAction<string>) => {
      state.services = state.services.filter(s => s.id !== action.payload);
      saveState(state);
    },
    addPackage: (state, action: PayloadAction<Package>) => {
      state.packages.unshift(action.payload);
      saveState(state);
    },
    updatePackage: (state, action: PayloadAction<Package>) => {
      const index = state.packages.findIndex(p => p.id === action.payload.id);
      if (index !== -1) {
        state.packages[index] = action.payload;
        saveState(state);
      }
    },
    addAppointment: (state, action: PayloadAction<Appointment>) => {
      state.appointments.unshift(action.payload);
      saveState(state);
    },
    updateAppointment: (state, action: PayloadAction<Appointment>) => {
      const index = state.appointments.findIndex(a => a.id === action.payload.id);
      if (index !== -1) {
        state.appointments[index] = action.payload;
        saveState(state);
      }
    },
    deleteAppointment: (state, action: PayloadAction<string>) => {
      state.appointments = state.appointments.filter(a => a.id !== action.payload);
      saveState(state);
    },
    addEmployee: (state, action: PayloadAction<Employee>) => {
      state.employees.unshift(action.payload);
      saveState(state);
    },
    updateEmployee: (state, action: PayloadAction<Employee>) => {
      const index = state.employees.findIndex(e => e.id === action.payload.id);
      if (index !== -1) {
        state.employees[index] = action.payload;
        saveState(state);
      }
    },
    updateSchedule: (state, action: PayloadAction<Schedule>) => {
      const index = state.schedules.findIndex(s => s.id === action.payload.id);
      if (index !== -1) {
        state.schedules[index] = action.payload;
      } else {
        state.schedules.push(action.payload);
      }
      saveState(state);
    },
    addWaitList: (state, action: PayloadAction<WaitList>) => {
      state.waitList.unshift(action.payload);
      saveState(state);
    },
    updateWaitList: (state, action: PayloadAction<WaitList>) => {
      const index = state.waitList.findIndex(w => w.id === action.payload.id);
      if (index !== -1) {
        state.waitList[index] = action.payload;
        saveState(state);
      }
    },
    deleteWaitList: (state, action: PayloadAction<string>) => {
      state.waitList = state.waitList.filter(w => w.id !== action.payload);
      saveState(state);
    },
    addServiceRecord: (state, action: PayloadAction<ServiceRecord>) => {
      state.serviceRecords.unshift(action.payload);
      const membership = state.memberships.find(m => m.customerId === action.payload.customerId);
      if (membership) {
        membership.totalSpent += action.payload.price;
        membership.points += Math.floor(action.payload.price / 10);
        if (membership.totalSpent > 30000) membership.level = 'diamond';
        else if (membership.totalSpent > 20000) membership.level = 'platinum';
        else if (membership.totalSpent > 10000) membership.level = 'gold';
        else if (membership.totalSpent > 5000) membership.level = 'silver';
      }
      saveState(state);
    },

    /* ============ 每日结账单 ============ */

    /** 登记一笔收款流水（未结账流水 statementId 为 null） */
    addPaymentEntry: (state, action: PayloadAction<Omit<PaymentEntry, 'id' | 'createdAt' | 'statementId'>>) => {
      state.paymentEntries.unshift({
        ...action.payload,
        id: genPaymentId(),
        statementId: null,
        createdAt: nowIso(),
      });
      saveState(state);
    },

    /** 生成/刷新某营业日的结账单草稿（汇总当前所有未结账流水） */
    upsertDraftStatement: (state, action: PayloadAction<{ businessDate: string }>) => {
      const { businessDate } = action.payload;
      const unlocked = state.paymentEntries.filter(
        (e) => e.businessDate === businessDate && !e.statementId
      );
      const existingDraft = state.closingStatements.find(
        (s) => s.businessDate === businessDate && s.status === 'draft'
      );
      if (!existingDraft && unlocked.length === 0) {
        throw new Error('该营业日没有未结账的流水，无需出单');
      }
      const seq = existingDraft
        ? existingDraft.seq
        : nextSeq(state.closingStatements, businessDate);
      const type = seq > 1 ? 'supplement' : 'regular';
      const data = computeStatementData({
        businessDate,
        seq,
        type,
        entries: unlocked,
        employees: state.employees,
        manualDiffs: existingDraft?.manualDiffs || [],
        note: existingDraft?.note || '',
      });

      if (existingDraft) {
        Object.assign(existingDraft, data);
        existingDraft.entriesSnapshot = unlocked.map((e) => ({ ...e }));
      } else {
        const id = genPaymentId();
        state.closingStatements.unshift({
          id,
          no: statementNo(businessDate, seq),
          ...data,
          entriesSnapshot: unlocked.map((e) => ({ ...e })),
          status: 'draft',
          createdAt: nowIso(),
          createdBy: '管理员',
          revisions: [
            { id: genRevisionId(), at: nowIso(), operator: '管理员', action: 'create', changes: [] },
          ],
        });
      }
      saveState(state);
    },

    /** 结账单草稿：更新备注 / 手工对账说明，并重新汇总对账 */
    updateDraftStatement: (
      state,
      action: PayloadAction<{ id: string; note?: string; manualDiffs?: ManualReconItem[] }>
    ) => {
      const stmt = state.closingStatements.find((s) => s.id === action.payload.id);
      if (!stmt || stmt.status !== 'draft') return;
      const manualDiffs = action.payload.manualDiffs ?? stmt.manualDiffs;
      const note = action.payload.note ?? stmt.note;
      const unlocked = stmt.paymentIds
        .map((pid) => state.paymentEntries.find((e) => e.id === pid))
        .filter((e): e is PaymentEntry => !!e && !e.statementId);
      const data = computeStatementData({
        businessDate: stmt.businessDate,
        seq: stmt.seq,
        type: stmt.type,
        entries: unlocked,
        employees: state.employees,
        manualDiffs,
        note,
      });
      Object.assign(stmt, data);
      stmt.entriesSnapshot = unlocked.map((e) => ({ ...e }));
      saveState(state);
    },

    /** 确认结账单：锁定流水并留档；存在未解释差异时不允许确认 */
    confirmStatement: (state, action: PayloadAction<{ id: string }>) => {
      const stmt = state.closingStatements.find((s) => s.id === action.payload.id);
      if (!stmt || stmt.status === 'confirmed') return;
      if (!stmt.reconciliation.balanced) {
        throw new Error('实收金额与提成基数对不上，存在未解释差异，不能确认结账');
      }
      const at = nowIso();
      stmt.paymentIds.forEach((pid) => {
        const entry = state.paymentEntries.find((e) => e.id === pid);
        if (entry) entry.statementId = stmt.id;
      });
      stmt.entriesSnapshot = stmt.paymentIds
        .map((pid) => state.paymentEntries.find((e) => e.id === pid))
        .filter((e): e is PaymentEntry => !!e)
        .map((e) => ({ ...e }));
      stmt.status = 'confirmed';
      stmt.confirmedAt = at;
      stmt.confirmedBy = '管理员';
      stmt.revisions.push({
        id: genRevisionId(),
        at,
        operator: '管理员',
        action: 'confirm',
        changes: [],
      });
      saveState(state);
    },

    /**
     * 已确认结账单的修改：
     * 只能改流水的实收/提成基数/备注、手工对账说明、结账单备注，
     * 每次改动记录修改痕迹，改完重新汇总并重新校验对账是否仍对得上。
     */
    amendConfirmedStatement: (
      state,
      action: PayloadAction<{
        id: string;
        reason: string;
        entryPatches?: { id: string; amount?: number; commissionBase?: number; note?: string }[];
        manualDiffs?: ManualReconItem[];
        note?: string;
      }>
    ) => {
      const stmt = state.closingStatements.find((s) => s.id === action.payload.id);
      if (!stmt || stmt.status !== 'confirmed') return;

      const beforeEntries = stmt.entriesSnapshot.map((e) => ({ ...e }));
      const beforeManual = stmt.manualDiffs.map((m) => ({ ...m }));
      const beforeNote = stmt.note;
      const manualDiffs = action.payload.manualDiffs ?? beforeManual;
      const note = action.payload.note ?? beforeNote;

      // 先在副本上试算，改动后若仍对不上则整笔拒绝，避免污染留档
      const nextEntries = stmt.entriesSnapshot.map((e) => {
        const patch = action.payload.entryPatches?.find((p) => p.id === e.id);
        return patch
          ? {
              ...e,
              amount: patch.amount !== undefined ? round2(patch.amount) : e.amount,
              commissionBase:
                patch.commissionBase !== undefined ? round2(patch.commissionBase) : e.commissionBase,
              note: patch.note !== undefined ? patch.note : e.note,
            }
          : { ...e };
      });
      const data = computeStatementData({
        businessDate: stmt.businessDate,
        seq: stmt.seq,
        type: stmt.type,
        entries: nextEntries,
        employees: state.employees,
        manualDiffs,
        note,
      });

      const changes = diffStatements(
        beforeEntries,
        nextEntries,
        beforeManual,
        manualDiffs,
        beforeNote,
        note
      );
      if (!changes.length) return;
      if (!data.reconciliation.balanced) {
        throw new Error(
          `修改后实收与提成基数仍差 ${data.reconciliation.unexplained.toFixed(2)} 元未解释，请补登对账说明`
        );
      }

      // 校验通过后再落到实时流水与留档快照
      action.payload.entryPatches?.forEach((patch) => {
        const live = state.paymentEntries.find((e) => e.id === patch.id);
        const snap = stmt.entriesSnapshot.find((e) => e.id === patch.id);
        if (!live || !snap) return;
        if (patch.amount !== undefined) {
          live.amount = round2(patch.amount);
          snap.amount = live.amount;
        }
        if (patch.commissionBase !== undefined) {
          live.commissionBase = round2(patch.commissionBase);
          snap.commissionBase = live.commissionBase;
        }
        if (patch.note !== undefined) {
          live.note = patch.note;
          snap.note = patch.note;
        }
      });

      Object.assign(stmt, data);
      stmt.revisions.push({
        id: genRevisionId(),
        at: nowIso(),
        operator: '管理员',
        action: 'amend',
        reason: action.payload.reason,
        changes,
      });
      saveState(state);
    },

    /** 删除未确认的草稿 */
    deleteDraftStatement: (state, action: PayloadAction<{ id: string }>) => {
      const stmt = state.closingStatements.find((s) => s.id === action.payload.id);
      if (!stmt || stmt.status === 'confirmed') return;
      state.closingStatements = state.closingStatements.filter((s) => s.id !== stmt.id);
      saveState(state);
    }
  }
});

export const {
  addCustomer,
  updateCustomer,
  deleteCustomer,
  addSkinAnalysis,
  addAllergy,
  updateAllergy,
  deleteAllergy,
  addService,
  updateService,
  deleteService,
  addPackage,
  updatePackage,
  addAppointment,
  updateAppointment,
  deleteAppointment,
  addEmployee,
  updateEmployee,
  updateSchedule,
  addWaitList,
  updateWaitList,
  deleteWaitList,
  addServiceRecord,
  addPaymentEntry,
  upsertDraftStatement,
  updateDraftStatement,
  confirmStatement,
  amendConfirmedStatement,
  deleteDraftStatement
} = appSlice.actions;

export const store = configureStore({
  reducer: {
    app: appSlice.reducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
