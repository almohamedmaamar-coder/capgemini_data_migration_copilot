export type ObjectType = "profit-center";

export type RuleCode = "R1" | "R2" | "R3";

export type IssueType = "mandatory" | "consistency" | "duplicate" | "missing";

export type Severity = "blocking" | "warning" | "ok";

export interface DataRow {
  id: string;
  sheet: string;
  lineNo: number;
  key: string;
  cells: Record<string, string>;
}

export interface QualityIssue {
  rowId: string;
  sheet: string;
  lineNo: number;
  rule: RuleCode;
  type: IssueType;
  severity: Severity;
  field: string;
  message: string;
  suggestion: string;
  /** Lignes sœurs pour R3, clé parent manquante pour R2. */
  related?: string;
}

export interface QualitySummary {
  total: number;
  valid: number;
  mandatoryMissing: number;
  inconsistent: number;
  duplicates: number;
}

export interface DetectedSheet {
  name: string;
  headers: string[];
  labels: string[];
  keyColumn: string | null;
  keyConfidence: number;
  mandatoryColumns: string[];
  skipped: number;
  ignored?: boolean;
}

export interface DetectedLink {
  parentSheet: string;
  childSheet: string;
  keyColumn: string;
  overlap: number;
}

export interface AgentClusterItem {
  id: string;
  rule: string;
  title: string;
  severity: "blocking" | "warning";
  explanation: string;
  action: string;
}

export interface AgentSynthesis {
  headline: string;
  verdict: string;
  clusters: AgentClusterItem[];
  priority_actions: string[];
}

export interface QualityReport {
  fileName: string;
  objectType: ObjectType;
  summary: QualitySummary;
  issues: QualityIssue[];
  rows: DataRow[];
  sheets: DetectedSheet[];
  links: DetectedLink[];
  generatedAt: string;
  agentSynthesis?: AgentSynthesis;
}

export interface ChatMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  actionLabel?: string;
  actionFilter?: IssueType | "all";
}

export const RULE_LABEL: Record<RuleCode, string> = {
  R1: "Champs obligatoires",
  R2: "Cohérence Master ↔ Assignment",
  R3: "Doublons",
};
