/** Row types as returned by the Supabase API (numeric columns arrive as JSON numbers). */

export interface FinanceCategory {
  id: string;
  code: string;
  name: string;
  applies_to: "income" | "expense" | "both";
  is_active: boolean;
  sort_order: number;
}

export interface Transaction {
  id: string;
  label: string;
  amount: number;
  category_id: string | null;
  booked_on: string;
  recurrence_rule_id: string | null;
  occurrence_date: string | null;
  kind: "income" | "expense";
  job_id: string | null;
}

export type IntervalUnit = "week" | "month" | "year";

export interface RecurrenceRule {
  id: string;
  label: string;
  amount: number;
  category_id: string | null;
  interval_unit: IntervalUnit;
  interval_count: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  generated_through: string | null;
}

export interface MonthlyBalanceRow {
  month: string;
  income: number;
  expense: number;
  balance: number;
  income_recurring: number;
  income_one_time: number;
  expense_recurring: number;
  expense_one_time: number;
}

export interface CategoryTotal {
  category_id: string | null;
  kind: "income" | "expense";
  total: number;
  recurring_total: number;
  booking_count: number;
}

export interface ForecastRow {
  rule_id: string;
  label: string;
  amount: number;
  category_id: string | null;
  occurrence_date: string;
}

export interface UserSettings {
  user_id: string;
  target_hourly_rate: number | null;
  billable_hours_per_month: number | null;
  tax_rate: number | null;
  reserve_rate: number | null;
  org_hours_billable: boolean;
  balance_months: number;
  chart_months: number;
  timezone: string;
}

export interface Job {
  id: string;
  name: string;
  client: string | null;
  start_date: string;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  shooting_hours: number;
  editing_hours: number;
  organisation_hours: number;
  travel_costs: number;
  other_costs: number;
  quoted_price: number | null;
  notes: string | null;
}

/** Result of the database function calculate_job_quote. */
export interface JobQuote {
  total_hours: number;
  planned_costs: number;
  recommended_price: number | null;
  quoted_price: number | null;
  price_used: number | null;
  /** amount to set aside from the profit (informational) */
  taxes_and_reserves: number | null;
  /** profit before tax and reserves */
  expected_profit: number | null;
  effective_hourly_rate: number | null;
  booked_income: number;
  missing_settings: string[];
}

/** Result of the database function check_monthly_hours. */
export interface HourCheck {
  monthly_limit: number | null;
  planned_hours: number;
  new_hours: number;
  total_hours: number;
  exceeds: boolean;
}

export interface EquipmentCategory {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Equipment {
  id: string;
  name: string;
  category_id: string | null;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  quantity: number;
  purchase_value: number | null;
  availability_status: "available" | "unavailable";
}

/** One row of the database function equipment_overview (state for today). */
export interface EquipmentOverview {
  equipment_id: string;
  quantity: number;
  blocked_today: number;
  lent_today: number;
  reserved_upcoming: number;
  available_today: number;
}

export interface EquipmentBlock {
  id: string;
  equipment_id: string;
  units: number;
  start_date: string;
  end_date: string;
  reason: string | null;
}

export interface RentalListing {
  id: string;
  equipment_id: string;
  is_active: boolean;
  public_note: string | null;
}

export interface RentalOffer {
  listing_id: string;
  equipment_id: string;
  owner_id: string;
  owner_name: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  quantity: number;
  public_note: string | null;
  /** free units for the searched period; equals quantity when no period was given */
  available_units: number;
}

export type RentalStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface RentalItem {
  id: string;
  request_id: string;
  requester_id: string;
  owner_id: string;
  equipment_id: string;
  equipment_name: string;
  units: number;
  start_date: string;
  end_date: string;
  status: RentalStatus;
  decision_note: string | null;
  created_at: string;
}

export interface RentalRequest {
  id: string;
  purpose: string;
}
