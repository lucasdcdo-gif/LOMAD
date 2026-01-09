
export interface TranscriptionEntry {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export enum SessionStatus {
  IDLE = 'IDLE',
  PERMISSIONS = 'PERMISSIONS',
  CONNECTING = 'CONNECTING',
  RECORDING = 'RECORDING',
  SUMMARIZING = 'SUMMARIZING',
  SAVING = 'SAVING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export type UserRole = 'FREE' | 'PRO' | 'MASTER';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  meetings_recorded?: number;
  name: string;
  createdAt: number;
  isActive?: boolean;
  cardBrand?: string;
  cardLast4?: string;
  subscriptionStatus?: 'ACTIVE' | 'CANCELED';
  subscriptionEnd?: number;
  cpf?: string;
  phone?: string;
  postalCode?: string;
  addressNumber?: string;
}

export interface Meeting {
  id: string;
  user_id: string;
  title: string;
  transcriptions: { text: string } | TranscriptionEntry[]; // Suporta o novo formato consolidado
  summary: string;
  notes?: string;
  timestamp: number;
  expires_at: number;
}

export type Language = 'pt' | 'en';

export interface AppTranslations {
  title: string;
  subtitle: string;
  startMeeting: string;
  stopMeeting: string;
  processing: string;
  startNew: string;
  audioInput: string;
  reloadDevices: string;
  summaryTitle: string;
  chatTitle: string;
  placeholderChat: string;
  errorTitle: string;
  login: string;
  signup: string;
  logout: string;
  dashboard: string;
  adminPanel: string;
  limitReached: string;
  upgradeToPro: string;
  meetingsLeft: string;
  historyTitle: string;
  noHistory: string;
  back: string;
  viewDetails: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  selectPlan: string;
  freePlan: string;
  proPlan: string;
  regenerateSummary: string;
  profile: string;
  settings: string;
  activePlan: string;
  cardLabel: string;
  managePricing: string;
  userManagement: string;
  systemDashboard: string;
  proPricingMonthly: string;
  proPricingAnnual: string;
  verifyData: string;
  activate: string;
  deactivate: string;
  statusActive: string;
  statusInactive: string;
  userDetails: string;
  registrationDate: string;
  userDisabled: string;
}
