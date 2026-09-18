import { configureStore, createSlice, PayloadAction, combineReducers } from '@reduxjs/toolkit';
import { storage } from '../utils/storage';
import { generateId } from '../utils/format';
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
  Payment,
  DailyStatement,
  CommissionEntry
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
  mockWaitList,
  mockPayments
} from '../mock';

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
  payments: Payment[];
  dailyStatements: DailyStatement[];
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
          // 迁移旧数据：补充日结模块所需数据
          if (!saved.payments) {
            saved.payments = mockPayments(
              saved.customers.map((c) => c.id),
              saved.services,
              saved.employees
            ) as Payment[];
          }
          if (!saved.dailyStatements) {
            saved.dailyStatements = [];
          }
          return saved;
        } catch (e) {
          console.log('Detected corrupted data, regenerating...');
          storage.clear();
        }
      }
    }
  } catch (e) {
    console.log('Loading fresh data...');
  }

  const customers = mockCustomers();
  const customerIds = customers.map(c => c.id);
  const services = mockServices() as Service[];
  const serviceIds = services.map(s => s.id);
  const employees = mockEmployees() as Employee[];
  const employeeIds = employees.map(e => e.id);
  const packages = mockPackages() as Package[];

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
    payments: mockPayments(customerIds, services, employees) as Payment[],
    dailyStatements: [],
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
    addPayment: (state, action: PayloadAction<Payment>) => {
      state.payments.unshift(action.payload);
      saveState(state);
    },
    saveStatement: (state, action: PayloadAction<DailyStatement>) => {
      const index = state.dailyStatements.findIndex(s => s.id === action.payload.id);
      if (index !== -1) {
        state.dailyStatements[index] = action.payload;
      } else {
        state.dailyStatements.unshift(action.payload);
      }
      saveState(state);
    },
    confirmStatement: (state, action: PayloadAction<string>) => {
      const statement = state.dailyStatements.find(s => s.id === action.payload);
      if (statement && statement.status === 'draft') {
        statement.status = 'confirmed';
        statement.confirmedAt = new Date().toISOString();
        statement.confirmedBy = '管理员';
        saveState(state);
      }
    },
    updateStatement: (
      state,
      action: PayloadAction<{ id: string; remark?: string; commissions?: CommissionEntry[]; reason: string }>
    ) => {
      const statement = state.dailyStatements.find(s => s.id === action.payload.id);
      if (!statement) return;
      const changes: { field: string; label: string; from: string; to: string }[] = [];

      if (action.payload.remark !== undefined && action.payload.remark !== statement.remark) {
        changes.push({
          field: 'remark',
          label: '备注',
          from: statement.remark || '(空)',
          to: action.payload.remark || '(空)'
        });
        statement.remark = action.payload.remark;
      }

      if (action.payload.commissions) {
        action.payload.commissions.forEach((c) => {
          const old = statement.commissions.find((o) => o.employeeId === c.employeeId);
          if (old && old.diffNote !== c.diffNote) {
            const employee = state.employees.find((e) => e.id === c.employeeId);
            changes.push({
              field: `diffNote:${c.employeeId}`,
              label: `${employee?.name || c.employeeId} 提成差异说明`,
              from: old.diffNote || '(空)',
              to: c.diffNote || '(空)'
            });
            old.diffNote = c.diffNote;
          }
        });
      }

      if (changes.length > 0) {
        statement.revisions.push({
          id: generateId(),
          revisedAt: new Date().toISOString(),
          revisedBy: '管理员',
          reason: action.payload.reason,
          changes
        });
        saveState(state);
      }
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
  addPayment,
  saveStatement,
  confirmStatement,
  updateStatement
} = appSlice.actions;

export const store = configureStore({
  reducer: {
    app: appSlice.reducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
