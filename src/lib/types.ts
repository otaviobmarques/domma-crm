export type Role = "admin" | "member" | "limited" | "guest";
export type BoardAccess = "admin" | "member" | "limited" | "guest" | "viewer";

export interface Profile { id: string; email: string | null; full_name: string | null; avatar_url: string | null; phone: string | null }
export interface Organization { id: string; name: string; cnpj: string | null; segment: string | null; plan: string; status: string; settings: Record<string, unknown>; created_at: string }
export interface Member { user_id: string; role: Role; profile: Profile }

export interface BoardSettings {
  title_field?: string; subtitle_fields?: string[]; hide_clocks?: boolean;
  due_alert_value?: number; due_alert_unit?: string; assign_creator?: boolean;
  block_delete?: boolean; guest_see_all?: boolean; only_assignees?: boolean;
}
export interface Board {
  id: string; org_id: string; name: string; icon: string; color: string; description: string | null;
  visibility: "org" | "private"; settings: BoardSettings; webhook_token: string; created_by: string | null;
  created_at: string; deleted_at: string | null;
}
export interface Totalizer { name?: string; field_id?: string; op?: "sum" | "avg" | "count"; format?: "currency" | "number" }
export interface Phase {
  id: string; org_id: string; board_id: string; name: string; color: string; description: string | null; position: number;
  is_final: boolean; sla_value: number | null; sla_unit: "minutes" | "hours" | "days" | null; auto_assignees: string[];
  distribution: "all" | "sequential"; replace_assignees: boolean; always_assign: boolean; totalizer: Totalizer | null;
  allowed_moves: string[] | null; deleted_at: string | null; archived: boolean; create_enabled: boolean;
}
export interface Field {
  id: string; org_id: string; board_id: string | null; database_id: string | null; phase_id: string | null; type: string;
  label: string; description: string | null; help: string | null; required: boolean; editable: boolean;
  unique_value: boolean; unique_open_only: boolean; integrated_key: string | null; regex: string | null;
  options: Record<string, any>; position: number; hidden: boolean; deleted_at: string | null;
}
export interface Tag { id: string; board_id: string; name: string; color: string; deleted_at: string | null }
export interface Card {
  id: string; org_id: string; board_id: string; phase_id: string; title: string; data: Record<string, any>;
  due_at: string | null; created_by: string | null; created_via: string; phase_entered_at: string; finished_at: string | null;
  first_contact_at: string | null; created_at: string; updated_at: string; deleted_at: string | null;
  card_assignees?: { user_id: string }[]; card_tags?: { tag_id: string }[];
}
export interface Condition { field: string; op: string; value?: any }
export interface RuleAction { type: string; field_id?: string; phase_id?: string }
export interface FieldRule {
  id: string; org_id: string; board_id: string | null; database_id: string | null; phase_id: string | null; name: string;
  conditions: Condition[]; match: "and" | "or"; true_actions: RuleAction[]; false_actions: RuleAction[]; mirror: boolean; enabled: boolean; position: number;
}
export interface Automation {
  id: string; org_id: string; board_id: string; name: string; enabled: boolean; event: string; event_config: Record<string, any>;
  conditions: Condition[]; match: "and" | "or"; actions: Record<string, any>[]; created_by: string | null; created_at: string; deleted_at: string | null;
}
export interface Database { id: string; org_id: string; name: string; icon: string; color: string; settings: { title_field?: string; subtitle_fields?: string[]; limited_view?: boolean }; created_by: string | null; created_at: string; deleted_at: string | null }
export interface DbRecord { id: string; org_id: string; database_id: string; title: string; data: Record<string, any>; status: "active" | "disabled"; disabled_at: string | null; created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null }
export interface Attachment { path: string; name: string; size?: number; mime?: string }
