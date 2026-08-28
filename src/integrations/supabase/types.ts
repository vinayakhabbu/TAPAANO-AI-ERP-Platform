export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounting_events: {
        Row: {
          actor_id: string
          created_at: string
          entity_id: string
          event_type: string
          id: string
          idempotency_key: string
          journal_entry_id: string | null
          org_id: string
          payload_hash: string
          source_id: string | null
          source_type: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      accounting_period_events: {
        Row: {
          accounting_period_id: string
          actor_id: string
          created_at: string
          entity_id: string
          from_status: string | null
          id: string
          org_id: string
          period_version: number
          reason: string
          to_status: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      accounting_periods: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string
          id: string
          idempotency_key: string
          org_id: string
          period_end: string
          period_start: string
          status: "OPEN" | "SOFT_CLOSED" | "HARD_CLOSED"
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      entity_invoice_account_controls: {
        Row: {
          ar_account_id: string
          configured_at: string
          configured_by: string
          entity_id: string
          id: string
          idempotency_key: string
          org_id: string
          revenue_account_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      entity_customer_receipt_controls: {
        Row: {
          ar_account_id: string
          cash_account_id: string
          configured_at: string
          configured_by: string
          entity_id: string
          id: string
          idempotency_key: string
          invoice_account_control_id: string
          org_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      entity_supplier_bill_account_controls: {
        Row: {
          ap_account_id: string
          configured_at: string
          configured_by: string
          entity_id: string
          expense_account_id: string
          id: string
          idempotency_key: string
          org_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      entity_supplier_payment_controls: {
        Row: {
          ap_account_id: string
          cash_account_id: string
          configured_at: string
          configured_by: string
          entity_id: string
          id: string
          idempotency_key: string
          org_id: string
          supplier_bill_account_control_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          controlling_category: string | null
          created_at: string
          default_cost_center_id: string | null
          default_internal_order_id: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "accounts_default_cost_center_id_fkey"
            columns: ["default_cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_default_internal_order_id_fkey"
            columns: ["default_internal_order_id"]
            isOneToOne: false
            referencedRelation: "internal_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_run_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input_data: Json | null
          output_data: Json | null
          run_id: string
          started_at: string | null
          step_name: string
          step_number: number
          step_status: string
          step_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          run_id: string
          started_at?: string | null
          step_name: string
          step_number: number
          step_status?: string
          step_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          run_id?: string
          started_at?: string | null
          step_name?: string
          step_number?: number
          step_status?: string
          step_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          org_id: string
          result_summary: string | null
          run_status: string
          run_type: string
          started_at: string
          trigger_context: Json | null
          trigger_source: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          org_id: string
          result_summary?: string | null
          run_status?: string
          run_type: string
          started_at?: string
          trigger_context?: Json | null
          trigger_source?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          org_id?: string
          result_summary?: string | null
          run_status?: string
          run_type?: string
          started_at?: string
          trigger_context?: Json | null
          trigger_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audit_logs: {
        Row: {
          agent_name: string
          created_at: string
          id: string
          input_data: Json | null
          model: string | null
          org_id: string
          output_data: Json | null
          tool_name: string | null
          user_id: string | null
        }
        Insert: {
          agent_name: string
          created_at?: string
          id?: string
          input_data?: Json | null
          model?: string | null
          org_id: string
          output_data?: Json | null
          tool_name?: string | null
          user_id?: string | null
        }
        Update: {
          agent_name?: string
          created_at?: string
          id?: string
          input_data?: Json | null
          model?: string | null
          org_id?: string
          output_data?: Json | null
          tool_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_rule_targets: {
        Row: {
          created_at: string
          formula: string | null
          id: string
          percentage: number
          rule_id: string
          target_account_id: string | null
          target_cost_center_id: string | null
          target_project_id: string | null
        }
        Insert: {
          created_at?: string
          formula?: string | null
          id?: string
          percentage?: number
          rule_id: string
          target_account_id?: string | null
          target_cost_center_id?: string | null
          target_project_id?: string | null
        }
        Update: {
          created_at?: string
          formula?: string | null
          id?: string
          percentage?: number
          rule_id?: string
          target_account_id?: string | null
          target_cost_center_id?: string | null
          target_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allocation_rule_targets_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "allocation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_rule_targets_target_account_id_fkey"
            columns: ["target_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_rule_targets_target_cost_center_id_fkey"
            columns: ["target_cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_rule_targets_target_project_id_fkey"
            columns: ["target_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_rules: {
        Row: {
          allocation_method: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          run_frequency: string
          source_account_id: string | null
          updated_at: string
        }
        Insert: {
          allocation_method?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          run_frequency?: string
          source_account_id?: string | null
          updated_at?: string
        }
        Update: {
          allocation_method?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          run_frequency?: string
          source_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_rules_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          journal_entry_id: string | null
          org_id: string
          period_end: string
          period_start: string
          rule_id: string
          run_date: string
          source_amount: number
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          journal_entry_id?: string | null
          org_id: string
          period_end: string
          period_start: string
          rule_id: string
          run_date?: string
          source_amount?: number
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          journal_entry_id?: string | null
          org_id?: string
          period_end?: string
          period_start?: string
          rule_id?: string
          run_date?: string
          source_amount?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "allocation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      amortization_schedule: {
        Row: {
          amount: number
          created_at: string
          cumulative_amount: number
          id: string
          journal_entry_id: string | null
          period_date: string
          posted_at: string | null
          prepaid_expense_id: string
          remaining_balance: number
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          cumulative_amount?: number
          id?: string
          journal_entry_id?: string | null
          period_date: string
          posted_at?: string | null
          prepaid_expense_id: string
          remaining_balance: number
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          cumulative_amount?: number
          id?: string
          journal_entry_id?: string | null
          period_date?: string
          posted_at?: string | null
          prepaid_expense_id?: string
          remaining_balance?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "amortization_schedule_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amortization_schedule_prepaid_expense_id_fkey"
            columns: ["prepaid_expense_id"]
            isOneToOne: false
            referencedRelation: "prepaid_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_depreciation: {
        Row: {
          accumulated_depreciation: number
          asset_id: string
          book_value: number
          created_at: string
          depreciation_amount: number
          id: string
          journal_entry_id: string | null
          org_id: string
          period_date: string
          posted: boolean
          posted_at: string | null
        }
        Insert: {
          accumulated_depreciation: number
          asset_id: string
          book_value: number
          created_at?: string
          depreciation_amount: number
          id?: string
          journal_entry_id?: string | null
          org_id: string
          period_date: string
          posted?: boolean
          posted_at?: string | null
        }
        Update: {
          accumulated_depreciation?: number
          asset_id?: string
          book_value?: number
          created_at?: string
          depreciation_amount?: number
          id?: string
          journal_entry_id?: string | null
          org_id?: string
          period_date?: string
          posted?: boolean
          posted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_depreciation_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_depreciation_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_depreciation_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_depreciation_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          approved_by: string | null
          attendance_date: string
          break_minutes: number | null
          clock_in: string | null
          clock_out: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          org_id: string
          overtime_hours: number | null
          status: string
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          attendance_date: string
          break_minutes?: number | null
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          org_id: string
          overtime_hours?: number | null
          status?: string
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          attendance_date?: string
          break_minutes?: number | null
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          overtime_hours?: number | null
          status?: string
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_approval_configs: {
        Row: {
          created_at: string
          decision_type: string
          enabled: boolean
          id: string
          max_auto_approval_amount: number
          min_precedent_count: number
          min_precedent_similarity: number
          org_id: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "auto_approval_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_approval_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          bank_name: string | null
          created_at: string
          currency: string
          entity_id: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "bank_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: never
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "bank_connections_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_feed_connections: {
        Row: never
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "bank_feed_connections_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_feed_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_feed_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_imports: {
        Row: never
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          bank_account_id: string
          created_at: string
          description: string | null
          id: string
          org_id: string
          transaction_date: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_bill_id_fkey"
            columns: ["matched_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_invoice_id_fkey"
            columns: ["matched_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "matching_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_suggested_account_id_fkey"
            columns: ["suggested_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_lots: {
        Row: {
          batch_number: string
          bin_location_id: string | null
          created_at: string
          expiry_date: string | null
          id: string
          manufacture_date: string | null
          notes: string | null
          org_id: string
          product_id: string
          quantity: number
          received_date: string | null
          status: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          batch_number: string
          bin_location_id?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          manufacture_date?: string | null
          notes?: string | null
          org_id: string
          product_id: string
          quantity?: number
          received_date?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          batch_number?: string
          bin_location_id?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          manufacture_date?: string | null
          notes?: string | null
          org_id?: string
          product_id?: string
          quantity?: number
          received_date?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_lots_bin_location_id_fkey"
            columns: ["bin_location_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_lots_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          account_control_id: string | null
          accounting_event_id: string | null
          accounting_status: "UNVERIFIED_LEGACY" | "POSTED"
          amount_paid: number
          bill_number: string
          created_at: string
          currency: string | null
          due_date: string
          entity_id: string
          exchange_rate: number | null
          functional_total: number | null
          goods_receipt_id: string | null
          id: string
          issue_date: string
          journal_entry_id: string | null
          match_status: string | null
          notes: string | null
          org_id: string
          purchase_order_id: string | null
          posted_at: string | null
          posted_by: string | null
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number
          tax: number
          tax_code_id: string | null
          total: number
          updated_at: string
          vendor_id: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "bills_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_lines: {
        Row: {
          bill_id: string
          created_at: string
          description: string
          entity_id: string
          expense_account_id: string
          id: string
          line_number: number
          line_total: number
          org_id: string
          quantity: number
          unit_price: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      supplier_bill_credit_notes: {
        Row: {
          account_control_id: string
          accounting_event_id: string
          credit_note_number: string
          currency: string
          entity_id: string
          id: string
          idempotency_key: string
          issue_date: string
          journal_entry_id: string
          org_id: string
          original_bill_id: string
          payload_hash: string
          posted_at: string
          posted_by: string
          reason: string
          total: number
          vendor_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      supplier_bill_credit_note_lines: {
        Row: {
          created_at: string
          credit_note_id: string
          description: string
          entity_id: string
          expense_account_id: string
          id: string
          line_number: number
          line_total: number
          org_id: string
          original_bill_id: string
          original_bill_line_id: string
          quantity: number
          unit_price: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      supplier_payment_corrections: {
        Row: {
          accounting_event_id: string
          amount: number
          correction_date: string
          correction_number: string
          currency: string
          entity_id: string
          id: string
          idempotency_key: string
          journal_entry_id: string
          org_id: string
          original_payment_id: string
          payload_hash: string
          posted_at: string
          posted_by: string
          reason: string
          vendor_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      supplier_payments: {
        Row: {
          account_control_id: string
          accounting_event_id: string
          amount: number
          bill_id: string
          currency: string
          entity_id: string
          id: string
          idempotency_key: string
          journal_entry_id: string
          org_id: string
          payload_hash: string
          payment_date: string
          payment_number: string
          payment_reference: string
          posted_at: string
          posted_by: string
          vendor_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      bin_locations: {
        Row: {
          aisle: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string | null
          rack: string | null
          shelf: string | null
          updated_at: string
          warehouse_id: string
          zone: string | null
        }
        Insert: {
          aisle?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string | null
          rack?: string | null
          shelf?: string | null
          updated_at?: string
          warehouse_id: string
          zone?: string | null
        }
        Update: {
          aisle?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string | null
          rack?: string | null
          shelf?: string | null
          updated_at?: string
          warehouse_id?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bin_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_headers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bom_number: string
          created_at: string
          created_by: string | null
          description: string | null
          effective_date: string | null
          expiry_date: string | null
          id: string
          is_active: boolean
          org_id: string
          product_id: string
          standard_quantity: number
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bom_number: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          product_id: string
          standard_quantity?: number
          status?: string
          updated_at?: string
          version?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bom_number?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          product_id?: string
          standard_quantity?: number
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_headers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_headers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_headers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_lines: {
        Row: {
          bom_id: string
          component_product_id: string
          created_at: string
          id: string
          notes: string | null
          position_number: number | null
          quantity: number
          scrap_rate: number
          unit_of_measure: string
        }
        Insert: {
          bom_id: string
          component_product_id: string
          created_at?: string
          id?: string
          notes?: string | null
          position_number?: number | null
          quantity?: number
          scrap_rate?: number
          unit_of_measure?: string
        }
        Update: {
          bom_id?: string
          component_product_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          position_number?: number | null
          quantity?: number
          scrap_rate?: number
          unit_of_measure?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_lines_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_operations: {
        Row: {
          bom_id: string
          created_at: string
          description: string | null
          id: string
          operation_name: string
          operation_number: number
          run_time_per_unit: number
          setup_time: number
          work_center_id: string
        }
        Insert: {
          bom_id: string
          created_at?: string
          description?: string | null
          id?: string
          operation_name: string
          operation_number: number
          run_time_per_unit?: number
          setup_time?: number
          work_center_id: string
        }
        Update: {
          bom_id?: string
          created_at?: string
          description?: string | null
          id?: string
          operation_name?: string
          operation_number?: number
          run_time_per_unit?: number
          setup_time?: number
          work_center_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_operations_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_operations_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "work_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines: {
        Row: {
          account_id: string | null
          actual_amount: number
          budget_id: string
          budgeted_amount: number
          cost_center_id: string | null
          created_at: string
          id: string
          notes: string | null
          period_month: number
          project_id: string | null
          updated_at: string
          variance: number | null
        }
        Insert: {
          account_id?: string | null
          actual_amount?: number
          budget_id: string
          budgeted_amount?: number
          cost_center_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_month: number
          project_id?: string | null
          updated_at?: string
          variance?: number | null
        }
        Update: {
          account_id?: string | null
          actual_amount?: number
          budget_id?: string
          budgeted_amount?: number
          cost_center_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_month?: number
          project_id?: string | null
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          budget_number: string
          created_at: string
          entity_id: string
          fiscal_year: number
          id: string
          name: string
          notes: string | null
          org_id: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          budget_number: string
          created_at?: string
          entity_id: string
          fiscal_year: number
          id?: string
          name: string
          notes?: string | null
          org_id: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          budget_number?: string
          created_at?: string
          entity_id?: string
          fiscal_year?: number
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_schedules: {
        Row: {
          actual_hours: number
          available_hours: number
          created_at: string
          id: string
          notes: string | null
          org_id: string
          planned_hours: number
          schedule_date: string
          updated_at: string
          utilization_rate: number | null
          work_center_id: string
        }
        Insert: {
          actual_hours?: number
          available_hours?: number
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          planned_hours?: number
          schedule_date: string
          updated_at?: string
          utilization_rate?: number | null
          work_center_id: string
        }
        Update: {
          actual_hours?: number
          available_hours?: number
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          planned_hours?: number
          schedule_date?: string
          updated_at?: string
          utilization_rate?: number | null
          work_center_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacity_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacity_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacity_schedules_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "work_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_forecasts: {
        Row: {
          actual_inflow: number
          actual_outflow: number
          category: string
          confidence_level: string | null
          created_at: string
          description: string | null
          entity_id: string
          expected_inflow: number
          expected_outflow: number
          forecast_date: string
          id: string
          notes: string | null
          org_id: string
          source_id: string | null
          source_type: string | null
          updated_at: string
        }
        Insert: {
          actual_inflow?: number
          actual_outflow?: number
          category: string
          confidence_level?: string | null
          created_at?: string
          description?: string | null
          entity_id: string
          expected_inflow?: number
          expected_outflow?: number
          forecast_date: string
          id?: string
          notes?: string | null
          org_id: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Update: {
          actual_inflow?: number
          actual_outflow?: number
          category?: string
          confidence_level?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string
          expected_inflow?: number
          expected_outflow?: number
          forecast_date?: string
          id?: string
          notes?: string | null
          org_id?: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_forecasts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_forecasts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_forecasts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_predictions: {
        Row: {
          confidence_score: number | null
          created_at: string
          entity_id: string | null
          factors: Json | null
          forecast_date: string
          id: string
          model_version: string | null
          org_id: string
          predicted_balance: number
          predicted_inflow: number
          predicted_outflow: number
          prediction_date: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          entity_id?: string | null
          factors?: Json | null
          forecast_date: string
          id?: string
          model_version?: string | null
          org_id: string
          predicted_balance?: number
          predicted_inflow?: number
          predicted_outflow?: number
          prediction_date: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          entity_id?: string | null
          factors?: Json | null
          forecast_date?: string
          id?: string
          model_version?: string | null
          org_id?: string
          predicted_balance?: number
          predicted_inflow?: number
          predicted_outflow?: number
          prediction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_predictions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_predictions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_predictions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          org_id: string
          role: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      close_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          entity_id: string
          id: string
          name: string
          org_id: string
          period_id: string
          status: Database["public"]["Enums"]["close_task_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          entity_id: string
          id?: string
          name: string
          org_id: string
          period_id: string
          status?: Database["public"]["Enums"]["close_task_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          entity_id?: string
          id?: string
          name?: string
          org_id?: string
          period_id?: string
          status?: Database["public"]["Enums"]["close_task_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "close_tasks_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      co_document_lines: {
        Row: {
          account_id: string
          amount: number
          co_document_id: string
          cost_center_id: string | null
          created_at: string
          currency: string
          id: string
          internal_order_id: string | null
          journal_line_id: string
          line_number: number
          profit_center_id: string | null
          wbs_element_id: string | null
        }
        Insert: {
          account_id: string
          amount?: number
          co_document_id: string
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          internal_order_id?: string | null
          journal_line_id: string
          line_number: number
          profit_center_id?: string | null
          wbs_element_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          co_document_id?: string
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          internal_order_id?: string | null
          journal_line_id?: string
          line_number?: number
          profit_center_id?: string | null
          wbs_element_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "co_document_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_document_lines_co_document_id_fkey"
            columns: ["co_document_id"]
            isOneToOne: false
            referencedRelation: "co_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_document_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_document_lines_internal_order_id_fkey"
            columns: ["internal_order_id"]
            isOneToOne: false
            referencedRelation: "internal_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_document_lines_journal_line_id_fkey"
            columns: ["journal_line_id"]
            isOneToOne: false
            referencedRelation: "journal_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      co_documents: {
        Row: {
          created_at: string
          currency: string
          document_number: string
          id: string
          journal_entry_id: string
          org_id: string
          posting_date: string
          source_module: string
        }
        Insert: {
          created_at?: string
          currency?: string
          document_number: string
          id?: string
          journal_entry_id: string
          org_id: string
          posting_date?: string
          source_module?: string
        }
        Update: {
          created_at?: string
          currency?: string
          document_number?: string
          id?: string
          journal_entry_id?: string
          org_id?: string
          posting_date?: string
          source_module?: string
        }
        Relationships: [
          {
            foreignKeyName: "co_documents_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: true
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      confidence_adjustments: {
        Row: {
          adjustment_factor: number
          created_at: string
          decision_type: string
          id: string
          last_calculated_at: string
          org_id: string
          override_count: number
          source_type: string
          updated_at: string
        }
        Insert: {
          adjustment_factor?: number
          created_at?: string
          decision_type: string
          id?: string
          last_calculated_at?: string
          org_id: string
          override_count?: number
          source_type: string
          updated_at?: string
        }
        Update: {
          adjustment_factor?: number
          created_at?: string
          decision_type?: string
          id?: string
          last_calculated_at?: string
          org_id?: string
          override_count?: number
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "confidence_adjustments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confidence_adjustments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      consignment_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          org_id: string
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          total_value: number | null
          transaction_date: string
          transaction_type: string
          unit_cost: number
          vendor_id: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id: string
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          total_value?: number | null
          transaction_date?: string
          transaction_type: string
          unit_cost?: number
          vendor_id: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          total_value?: number | null
          transaction_date?: string
          transaction_type?: string
          unit_cost?: number
          vendor_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consignment_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_transactions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          org_id: string
          parent_id: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          org_id: string
          parent_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          org_id?: string
          parent_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_revaluations: {
        Row: {
          created_at: string
          current_functional_amount: number
          current_rate: number
          entity_id: string
          functional_currency: string
          gain_loss_amount: number
          gain_loss_type: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          org_id: string
          original_amount: number
          original_currency: string
          original_functional_amount: number
          original_rate: number
          revaluation_date: string
          source_id: string
          source_type: string
        }
        Insert: {
          created_at?: string
          current_functional_amount: number
          current_rate: number
          entity_id: string
          functional_currency?: string
          gain_loss_amount: number
          gain_loss_type: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          org_id: string
          original_amount: number
          original_currency: string
          original_functional_amount: number
          original_rate: number
          revaluation_date: string
          source_id: string
          source_type: string
        }
        Update: {
          created_at?: string
          current_functional_amount?: number
          current_rate?: number
          entity_id?: string
          functional_currency?: string
          gain_loss_amount?: number
          gain_loss_type?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          org_id?: string
          original_amount?: number
          original_currency?: string
          original_functional_amount?: number
          original_rate?: number
          revaluation_date?: string
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "currency_revaluations_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_revaluations_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_revaluations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_revaluations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_note_lines: {
        Row: {
          created_at: string
          credit_note_id: string
          description: string
          entity_id: string
          id: string
          line_number: number
          line_total: number
          org_id: string
          original_invoice_id: string
          original_invoice_line_id: string
          quantity: number
          revenue_account_id: string
          unit_price: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      customer_credit_notes: {
        Row: {
          account_control_id: string
          accounting_event_id: string
          credit_note_number: string
          currency: string
          customer_id: string
          entity_id: string
          id: string
          idempotency_key: string
          issue_date: string
          journal_entry_id: string
          org_id: string
          original_invoice_id: string
          payload_hash: string
          posted_at: string
          posted_by: string
          reason: string
          total: number
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "customer_credit_notes_org_invoice_fkey"
            columns: ["org_id", "entity_id", "original_invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["org_id", "entity_id", "id"]
          },
        ]
      }
      customer_receipt_corrections: {
        Row: {
          accounting_event_id: string
          amount: number
          correction_date: string
          correction_number: string
          currency: string
          customer_id: string
          entity_id: string
          id: string
          idempotency_key: string
          journal_entry_id: string
          org_id: string
          original_receipt_id: string
          payload_hash: string
          posted_at: string
          posted_by: string
          reason: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      customer_receipts: {
        Row: {
          account_control_id: string
          accounting_event_id: string
          amount: number
          currency: string
          customer_id: string
          entity_id: string
          id: string
          idempotency_key: string
          invoice_id: string
          journal_entry_id: string
          org_id: string
          payload_hash: string
          posted_at: string
          posted_by: string
          receipt_date: string
          receipt_number: string
          receipt_reference: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          credit_limit: number | null
          email: string | null
          id: string
          name: string
          org_id: string
          payment_terms: number | null
          phone: string | null
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_count_lines: {
        Row: {
          bin_location_id: string | null
          counted_at: string | null
          counted_quantity: number | null
          created_at: string
          cycle_count_id: string
          expected_quantity: number
          id: string
          notes: string | null
          product_id: string
          variance: number | null
          variance_value: number | null
        }
        Insert: {
          bin_location_id?: string | null
          counted_at?: string | null
          counted_quantity?: number | null
          created_at?: string
          cycle_count_id: string
          expected_quantity?: number
          id?: string
          notes?: string | null
          product_id: string
          variance?: number | null
          variance_value?: number | null
        }
        Update: {
          bin_location_id?: string | null
          counted_at?: string | null
          counted_quantity?: number | null
          created_at?: string
          cycle_count_id?: string
          expected_quantity?: number
          id?: string
          notes?: string | null
          product_id?: string
          variance?: number | null
          variance_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cycle_count_lines_bin_location_id_fkey"
            columns: ["bin_location_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_count_lines_cycle_count_id_fkey"
            columns: ["cycle_count_id"]
            isOneToOne: false
            referencedRelation: "cycle_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_count_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_counts: {
        Row: {
          completed_at: string | null
          count_number: string
          counted_by: string | null
          created_at: string
          id: string
          notes: string | null
          org_id: string
          scheduled_date: string
          started_at: string | null
          status: Database["public"]["Enums"]["cycle_count_status"]
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          completed_at?: string | null
          count_number: string
          counted_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          scheduled_date: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["cycle_count_status"]
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          completed_at?: string | null
          count_number?: string
          counted_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          scheduled_date?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["cycle_count_status"]
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_desk_tabs: {
        Row: {
          created_at: string
          display_order: number
          icon_name: string
          id: string
          is_visible: boolean
          org_id: string
          tab_key: string
          tab_label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          icon_name: string
          id?: string
          is_visible?: boolean
          org_id: string
          tab_key: string
          tab_label: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          icon_name?: string
          id?: string
          is_visible?: boolean
          org_id?: string
          tab_key?: string
          tab_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_desk_tabs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_desk_tabs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_entities: {
        Row: {
          created_at: string
          decision_id: string
          entity_id: string
          entity_label: string | null
          entity_snapshot: Json | null
          entity_type: string
          id: string
        }
        Insert: {
          created_at?: string
          decision_id: string
          entity_id: string
          entity_label?: string | null
          entity_snapshot?: Json | null
          entity_type: string
          id?: string
        }
        Update: {
          created_at?: string
          decision_id?: string
          entity_id?: string
          entity_label?: string | null
          entity_snapshot?: Json | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_entities_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_traces"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_overrides: {
        Row: {
          created_at: string
          decision_type: string
          id: string
          learned: boolean
          learned_at: string | null
          org_id: string
          original_confidence: number | null
          original_decision_id: string
          overridden_at: string
          overridden_by: string | null
          override_reason: string
          override_type: string
          source_id: string | null
          source_type: string
        }
        Insert: {
          created_at?: string
          decision_type: string
          id?: string
          learned?: boolean
          learned_at?: string | null
          org_id: string
          original_confidence?: number | null
          original_decision_id: string
          overridden_at?: string
          overridden_by?: string | null
          override_reason: string
          override_type: string
          source_id?: string | null
          source_type: string
        }
        Update: {
          created_at?: string
          decision_type?: string
          id?: string
          learned?: boolean
          learned_at?: string | null
          org_id?: string
          original_confidence?: number | null
          original_decision_id?: string
          overridden_at?: string
          overridden_by?: string | null
          override_reason?: string
          override_type?: string
          source_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_overrides_original_decision_id_fkey"
            columns: ["original_decision_id"]
            isOneToOne: false
            referencedRelation: "decision_traces"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_traces: {
        Row: {
          agent_run_id: string | null
          approval_channel: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          commit_writes: Json | null
          context_embedding: string | null
          created_at: string
          decision_type: string
          id: string
          input_snapshot: Json
          is_precedent: boolean | null
          org_id: string
          policy_evaluation: Json | null
          precedent_notes: string | null
          precedent_scope: string | null
          precedents_referenced: Json | null
          rationale_text: string | null
          reason_codes: string[] | null
          source_id: string | null
          source_type: string | null
          updated_at: string
        }
        Insert: {
          agent_run_id?: string | null
          approval_channel?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          commit_writes?: Json | null
          context_embedding?: string | null
          created_at?: string
          decision_type: string
          id?: string
          input_snapshot?: Json
          is_precedent?: boolean | null
          org_id: string
          policy_evaluation?: Json | null
          precedent_notes?: string | null
          precedent_scope?: string | null
          precedents_referenced?: Json | null
          rationale_text?: string | null
          reason_codes?: string[] | null
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Update: {
          agent_run_id?: string | null
          approval_channel?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          commit_writes?: Json | null
          context_embedding?: string | null
          created_at?: string
          decision_type?: string
          id?: string
          input_snapshot?: Json
          is_precedent?: boolean | null
          org_id?: string
          policy_evaluation?: Json | null
          precedent_notes?: string | null
          precedent_scope?: string | null
          precedents_referenced?: Json | null
          rationale_text?: string | null
          reason_codes?: string[] | null
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_traces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_traces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      deduction_types: {
        Row: {
          calculation_type: string
          category: string
          code: string
          created_at: string
          default_amount: number | null
          default_percentage: number | null
          gl_account_id: string | null
          id: string
          is_active: boolean
          is_employer_contribution: boolean
          is_pretax: boolean
          name: string
          org_id: string
        }
        Insert: {
          calculation_type?: string
          category: string
          code: string
          created_at?: string
          default_amount?: number | null
          default_percentage?: number | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          is_employer_contribution?: boolean
          is_pretax?: boolean
          name: string
          org_id: string
        }
        Update: {
          calculation_type?: string
          category?: string
          code?: string
          created_at?: string
          default_amount?: number | null
          default_percentage?: number | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          is_employer_contribution?: boolean
          is_pretax?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deduction_types_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deduction_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deduction_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          cost_center_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          org_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          cost_center_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          org_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          cost_center_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          org_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_deductions: {
        Row: {
          amount: number | null
          created_at: string
          deduction_type_id: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          is_active: boolean
          org_id: string
          percentage: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          deduction_type_id: string
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          is_active?: boolean
          org_id: string
          percentage?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          deduction_type_id?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          is_active?: boolean
          org_id?: string
          percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_deductions_deduction_type_id_fkey"
            columns: ["deduction_type_id"]
            isOneToOne: false
            referencedRelation: "deduction_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_deductions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_deductions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_deductions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          created_at: string
          document_name: string
          document_type: string
          employee_id: string
          expiry_date: string | null
          file_size: number | null
          file_url: string | null
          id: string
          mime_type: string | null
          notes: string | null
          org_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_name: string
          document_type: string
          employee_id: string
          expiry_date?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          org_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_name?: string
          document_type?: string
          employee_id?: string
          expiry_date?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          org_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_emergency_contacts: {
        Row: {
          address: string | null
          contact_name: string
          created_at: string
          email: string | null
          employee_id: string
          id: string
          is_primary: boolean | null
          org_id: string
          phone_primary: string
          phone_secondary: string | null
          relationship: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_name: string
          created_at?: string
          email?: string | null
          employee_id: string
          id?: string
          is_primary?: boolean | null
          org_id: string
          phone_primary: string
          phone_secondary?: string | null
          relationship: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_name?: string
          created_at?: string
          email?: string | null
          employee_id?: string
          id?: string
          is_primary?: boolean | null
          org_id?: string
          phone_primary?: string
          phone_secondary?: string | null
          relationship?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_emergency_contacts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_emergency_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_emergency_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          bank_account_number: string | null
          bank_routing_number: string | null
          base_salary: number | null
          city: string | null
          country: string | null
          created_at: string
          currency: string
          date_of_birth: string | null
          department_id: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_number: string
          employment_status: string
          employment_type: string
          first_name: string
          hire_date: string
          hourly_rate: number | null
          id: string
          last_name: string
          manager_id: string | null
          notes: string | null
          org_id: string
          pay_frequency: string
          phone: string | null
          position_id: string | null
          postal_code: string | null
          state_province: string | null
          tax_id: string | null
          termination_date: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account_number?: string | null
          bank_routing_number?: string | null
          base_salary?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_number: string
          employment_status?: string
          employment_type?: string
          first_name: string
          hire_date: string
          hourly_rate?: number | null
          id?: string
          last_name: string
          manager_id?: string | null
          notes?: string | null
          org_id: string
          pay_frequency?: string
          phone?: string | null
          position_id?: string | null
          postal_code?: string | null
          state_province?: string | null
          tax_id?: string | null
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account_number?: string | null
          bank_routing_number?: string | null
          base_salary?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_number?: string
          employment_status?: string
          employment_type?: string
          first_name?: string
          hire_date?: string
          hourly_rate?: number | null
          id?: string
          last_name?: string
          manager_id?: string | null
          notes?: string | null
          org_id?: string
          pay_frequency?: string
          phone?: string | null
          position_id?: string | null
          postal_code?: string | null
          state_province?: string | null
          tax_id?: string | null
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "entities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          from_currency: string
          id: string
          is_active: boolean
          org_id: string
          rate: number
          rate_date: string
          rate_type: string
          source: string | null
          to_currency: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_currency: string
          id?: string
          is_active?: boolean
          org_id: string
          rate: number
          rate_date: string
          rate_type?: string
          source?: string | null
          to_currency: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_currency?: string
          id?: string
          is_active?: boolean
          org_id?: string
          rate?: number
          rate_date?: string
          rate_type?: string
          source?: string | null
          to_currency?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_rates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_claims: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category: string
          claim_date: string
          claim_number: string
          created_at: string
          currency: string | null
          description: string
          employee_id: string
          id: string
          notes: string | null
          org_id: string
          paid_at: string | null
          receipt_url: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          category: string
          claim_date?: string
          claim_number: string
          created_at?: string
          currency?: string | null
          description: string
          employee_id: string
          id?: string
          notes?: string | null
          org_id: string
          paid_at?: string | null
          receipt_url?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          claim_date?: string
          claim_number?: string
          created_at?: string
          currency?: string | null
          description?: string
          employee_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          receipt_url?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_claims_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      field_service_visits: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          created_at: string
          customer_id: string
          customer_signature: string | null
          id: string
          location_address: string | null
          location_notes: string | null
          mileage: number | null
          notes: string | null
          org_id: string
          parts_used: string | null
          scheduled_end: string | null
          scheduled_start: string
          service_call_id: string | null
          status: string
          technician_id: string | null
          travel_time_hours: number | null
          updated_at: string
          visit_number: string
          visit_type: string
          work_performed: string | null
          work_time_hours: number | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          created_at?: string
          customer_id: string
          customer_signature?: string | null
          id?: string
          location_address?: string | null
          location_notes?: string | null
          mileage?: number | null
          notes?: string | null
          org_id: string
          parts_used?: string | null
          scheduled_end?: string | null
          scheduled_start: string
          service_call_id?: string | null
          status?: string
          technician_id?: string | null
          travel_time_hours?: number | null
          updated_at?: string
          visit_number: string
          visit_type?: string
          work_performed?: string | null
          work_time_hours?: number | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          created_at?: string
          customer_id?: string
          customer_signature?: string | null
          id?: string
          location_address?: string | null
          location_notes?: string | null
          mileage?: number | null
          notes?: string | null
          org_id?: string
          parts_used?: string | null
          scheduled_end?: string | null
          scheduled_start?: string
          service_call_id?: string | null
          status?: string
          technician_id?: string | null
          travel_time_hours?: number | null
          updated_at?: string
          visit_number?: string
          visit_type?: string
          work_performed?: string | null
          work_time_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "field_service_visits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_service_visits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_service_visits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_service_visits_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          accumulated_depreciation: number
          acquisition_cost: number
          acquisition_date: string
          asset_number: string
          book_value: number
          category: string
          cost_center_id: string | null
          created_at: string
          depreciation_method: string
          description: string | null
          disposal_amount: number | null
          disposed_date: string | null
          id: string
          location: string | null
          name: string
          notes: string | null
          org_id: string
          salvage_value: number
          status: string
          updated_at: string
          useful_life_months: number
        }
        Insert: {
          accumulated_depreciation?: number
          acquisition_cost: number
          acquisition_date: string
          asset_number: string
          book_value?: number
          category: string
          cost_center_id?: string | null
          created_at?: string
          depreciation_method?: string
          description?: string | null
          disposal_amount?: number | null
          disposed_date?: string | null
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          org_id: string
          salvage_value?: number
          status?: string
          updated_at?: string
          useful_life_months: number
        }
        Update: {
          accumulated_depreciation?: number
          acquisition_cost?: number
          acquisition_date?: string
          asset_number?: string
          book_value?: number
          category?: string
          cost_center_id?: string | null
          created_at?: string
          depreciation_method?: string
          description?: string | null
          disposal_amount?: number | null
          disposed_date?: string | null
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          salvage_value?: number
          status?: string
          updated_at?: string
          useful_life_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_lines: {
        Row: {
          created_at: string
          goods_receipt_id: string
          id: string
          purchase_order_line_id: string
          quantity_received: number
        }
        Insert: {
          created_at?: string
          goods_receipt_id: string
          id?: string
          purchase_order_line_id: string
          quantity_received?: number
        }
        Update: {
          created_at?: string
          goods_receipt_id?: string
          id?: string
          purchase_order_line_id?: string
          quantity_received?: number
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_lines_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_purchase_order_line_id_fkey"
            columns: ["purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          created_at: string
          entity_id: string
          id: string
          notes: string | null
          org_id: string
          purchase_order_id: string
          receipt_date: string
          receipt_number: string
          received_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          id?: string
          notes?: string | null
          org_id: string
          purchase_order_id: string
          receipt_date?: string
          receipt_number: string
          received_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          purchase_order_id?: string
          receipt_date?: string
          receipt_number?: string
          received_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_details: Json | null
          id: string
          integration_id: string
          records_created: number | null
          records_failed: number | null
          records_processed: number | null
          records_updated: number | null
          started_at: string
          status: string
          sync_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_details?: Json | null
          id?: string
          integration_id: string
          records_created?: number | null
          records_failed?: number | null
          records_processed?: number | null
          records_updated?: number | null
          started_at?: string
          status?: string
          sync_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_details?: Json | null
          id?: string
          integration_id?: string
          records_created?: number | null
          records_failed?: number | null
          records_processed?: number | null
          records_updated?: number | null
          started_at?: string
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          credentials_encrypted: string | null
          error_message: string | null
          id: string
          integration_type: string
          is_active: boolean
          last_sync_at: string | null
          name: string
          org_id: string
          sync_status: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          credentials_encrypted?: string | null
          error_message?: string | null
          id?: string
          integration_type: string
          is_active?: boolean
          last_sync_at?: string | null
          name: string
          org_id: string
          sync_status?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          credentials_encrypted?: string | null
          error_message?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean
          last_sync_at?: string | null
          name?: string
          org_id?: string
          sync_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_orders: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          order_type: string
          org_id: string
          status: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          order_type?: string
          org_id: string
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          order_type?: string
          org_id?: string
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_date: string
          movement_type: string
          notes: string | null
          org_id: string
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          total_cost: number
          unit_cost: number
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date?: string
          movement_type: string
          notes?: string | null
          org_id: string
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          total_cost?: number
          unit_cost?: number
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date?: string
          movement_type?: string
          notes?: string | null
          org_id?: string
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          total_cost?: number
          unit_cost?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_receipt_lines: {
        Row: {
          batch_lot_id: string | null
          bin_location_id: string | null
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string | null
          receipt_id: string
          serial_number_id: string | null
          total_value: number | null
          unit_cost: number
        }
        Insert: {
          batch_lot_id?: string | null
          bin_location_id?: string | null
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          receipt_id: string
          serial_number_id?: string | null
          total_value?: number | null
          unit_cost?: number
        }
        Update: {
          batch_lot_id?: string | null
          bin_location_id?: string | null
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          receipt_id?: string
          serial_number_id?: string | null
          total_value?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_receipt_lines_batch_lot_id_fkey"
            columns: ["batch_lot_id"]
            isOneToOne: false
            referencedRelation: "batch_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipt_lines_bin_location_id_fkey"
            columns: ["bin_location_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipt_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "inventory_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipt_lines_serial_number_id_fkey"
            columns: ["serial_number_id"]
            isOneToOne: false
            referencedRelation: "serial_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_receipts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          org_id: string
          posted_at: string | null
          posted_by: string | null
          receipt_date: string
          receipt_number: string
          receipt_type: string
          status: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id: string
          posted_at?: string | null
          posted_by?: string | null
          receipt_date?: string
          receipt_number: string
          receipt_type: string
          status?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          posted_at?: string | null
          posted_by?: string | null
          receipt_date?: string
          receipt_number?: string
          receipt_type?: string
          status?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock: {
        Row: {
          bin_location_id: string | null
          created_at: string
          id: string
          last_count_date: string | null
          org_id: string
          product_id: string
          quantity_available: number | null
          quantity_on_hand: number
          quantity_reserved: number
          sales_order_id: string | null
          sales_order_item_id: string | null
          stock_type: Database["public"]["Enums"]["goods_receipt_stock_type"]
          total_value: number | null
          unit_cost: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          bin_location_id?: string | null
          created_at?: string
          id?: string
          last_count_date?: string | null
          org_id: string
          product_id: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          sales_order_id?: string | null
          sales_order_item_id?: string | null
          stock_type?: Database["public"]["Enums"]["goods_receipt_stock_type"]
          total_value?: number | null
          unit_cost?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          bin_location_id?: string | null
          created_at?: string
          id?: string
          last_count_date?: string | null
          org_id?: string
          product_id?: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          sales_order_id?: string | null
          sales_order_item_id?: string | null
          stock_type?: Database["public"]["Enums"]["goods_receipt_stock_type"]
          total_value?: number | null
          unit_cost?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_bin_location_id_fkey"
            columns: ["bin_location_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          batch_lot_id: string | null
          bin_location_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          org_id: string
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          running_balance: number | null
          serial_number_id: string | null
          total_value: number | null
          transaction_type: string
          unit_cost: number
          warehouse_id: string
        }
        Insert: {
          batch_lot_id?: string | null
          bin_location_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id: string
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          running_balance?: number | null
          serial_number_id?: string | null
          total_value?: number | null
          transaction_type: string
          unit_cost?: number
          warehouse_id: string
        }
        Update: {
          batch_lot_id?: string | null
          bin_location_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          running_balance?: number | null
          serial_number_id?: string | null
          total_value?: number | null
          transaction_type?: string
          unit_cost?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_batch_lot_id_fkey"
            columns: ["batch_lot_id"]
            isOneToOne: false
            referencedRelation: "batch_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_bin_location_id_fkey"
            columns: ["bin_location_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_serial_number_id_fkey"
            columns: ["serial_number_id"]
            isOneToOne: false
            referencedRelation: "serial_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_metrics_snapshots: {
        Row: {
          active_customers: number | null
          arr: number | null
          churned_customers: number | null
          churned_mrr: number | null
          contraction_mrr: number | null
          created_at: string | null
          expansion_mrr: number | null
          gross_churn_rate: number | null
          id: string
          mrr: number | null
          new_customers: number | null
          new_mrr: number | null
          nrr: number | null
          org_id: string
          period_date: string
          updated_at: string | null
        }
        Insert: {
          active_customers?: number | null
          arr?: number | null
          churned_customers?: number | null
          churned_mrr?: number | null
          contraction_mrr?: number | null
          created_at?: string | null
          expansion_mrr?: number | null
          gross_churn_rate?: number | null
          id?: string
          mrr?: number | null
          new_customers?: number | null
          new_mrr?: number | null
          nrr?: number | null
          org_id: string
          period_date: string
          updated_at?: string | null
        }
        Update: {
          active_customers?: number | null
          arr?: number | null
          churned_customers?: number | null
          churned_mrr?: number | null
          contraction_mrr?: number | null
          created_at?: string | null
          expansion_mrr?: number | null
          gross_churn_rate?: number | null
          id?: string
          mrr?: number | null
          new_customers?: number | null
          new_mrr?: number | null
          nrr?: number | null
          org_id?: string
          period_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_metrics_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_metrics_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          created_at: string
          description: string
          entity_id: string
          id: string
          invoice_id: string
          line_number: number
          line_total: number
          org_id: string
          quantity: number
          revenue_account_id: string
          unit_price: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      invoices: {
        Row: {
          account_control_id: string | null
          accounting_event_id: string | null
          accounting_status: "UNVERIFIED_LEGACY" | "POSTED"
          amount_paid: number
          created_at: string
          currency: string | null
          customer_id: string
          due_date: string
          entity_id: string
          exchange_rate: number | null
          functional_total: number | null
          id: string
          invoice_number: string
          issue_date: string
          journal_entry_id: string | null
          notes: string | null
          org_id: string
          posted_at: string | null
          posted_by: string | null
          sales_order_id: string | null
          shipment_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          tax_code_id: string | null
          total: number
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          accounting_event_id: string | null
          accounting_period_id: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          entry_date: string
          entry_number: string
          id: string
          memo: string | null
          org_id: string
          posted_at: string | null
          reversal_of_id: string | null
          reversed_by_id: string | null
          source_module: string | null
          status: Database["public"]["Enums"]["journal_status"]
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "journal_entries_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          cost_center_id: string | null
          created_at: string
          credit: number
          debit: number
          id: string
          entity_id: string
          internal_order_id: string | null
          journal_entry_id: string
          line_number: number
          memo: string | null
          org_id: string
          profit_center_id: string | null
          wbs_element_id: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_internal_order_id_fkey"
            columns: ["internal_order_id"]
            isOneToOne: false
            referencedRelation: "internal_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      matching_rules: {
        Row: never
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "matching_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matching_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matching_rules_target_account_id_fkey"
            columns: ["target_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matching_rules_target_cost_center_id_fkey"
            columns: ["target_cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      mrp_results: {
        Row: {
          created_at: string
          gross_requirement: number
          id: string
          mrp_run_id: string
          net_requirement: number
          planned_order_date: string | null
          planned_order_qty: number
          product_id: string
          projected_on_hand: number
          requirement_date: string
          scheduled_receipts: number
          source_id: string | null
          source_type: string | null
        }
        Insert: {
          created_at?: string
          gross_requirement?: number
          id?: string
          mrp_run_id: string
          net_requirement?: number
          planned_order_date?: string | null
          planned_order_qty?: number
          product_id: string
          projected_on_hand?: number
          requirement_date: string
          scheduled_receipts?: number
          source_id?: string | null
          source_type?: string | null
        }
        Update: {
          created_at?: string
          gross_requirement?: number
          id?: string
          mrp_run_id?: string
          net_requirement?: number
          planned_order_date?: string | null
          planned_order_qty?: number
          product_id?: string
          projected_on_hand?: number
          requirement_date?: string
          scheduled_receipts?: number
          source_id?: string | null
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mrp_results_mrp_run_id_fkey"
            columns: ["mrp_run_id"]
            isOneToOne: false
            referencedRelation: "mrp_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mrp_results_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      mrp_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          planning_horizon_days: number
          run_date: string
          run_number: string
          status: string
          total_requirements: number
          total_shortages: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          planning_horizon_days?: number
          run_date?: string
          run_number: string
          status?: string
          total_requirements?: number
          total_shortages?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          planning_horizon_days?: number
          run_date?: string
          run_number?: string
          status?: string
          total_requirements?: number
          total_shortages?: number
        }
        Relationships: [
          {
            foreignKeyName: "mrp_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mrp_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          assigned_to: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          expected_close_date: string | null
          expected_value: number
          id: string
          lost_reason: string | null
          notes: string | null
          opportunity_name: string
          opportunity_number: string
          org_id: string
          probability: number | null
          source: string | null
          stage: string
          updated_at: string
          won_reason: string | null
        }
        Insert: {
          assigned_to?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          expected_close_date?: string | null
          expected_value?: number
          id?: string
          lost_reason?: string | null
          notes?: string | null
          opportunity_name: string
          opportunity_number: string
          org_id: string
          probability?: number | null
          source?: string | null
          stage?: string
          updated_at?: string
          won_reason?: string | null
        }
        Update: {
          assigned_to?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          expected_close_date?: string | null
          expected_value?: number
          id?: string
          lost_reason?: string | null
          notes?: string | null
          opportunity_name?: string
          opportunity_number?: string
          org_id?: string
          probability?: number | null
          source?: string | null
          stage?: string
          updated_at?: string
          won_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      payment_run_items: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          entity_id: string
          id: string
          org_id: string
          payment_run_id: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "payment_run_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_run_items_payment_run_id_fkey"
            columns: ["payment_run_id"]
            isOneToOne: false
            referencedRelation: "payment_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          id: string
          org_id: string
          payment_method: string | null
          processed_at: string | null
          run_date: string
          run_number: string
          status: Database["public"]["Enums"]["payment_run_status"]
          total_amount: number
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "payment_runs_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_item_deductions: {
        Row: {
          created_at: string
          deduction_type_id: string
          employee_amount: number
          employer_amount: number
          id: string
          payroll_item_id: string
        }
        Insert: {
          created_at?: string
          deduction_type_id: string
          employee_amount?: number
          employer_amount?: number
          id?: string
          payroll_item_id: string
        }
        Update: {
          created_at?: string
          deduction_type_id?: string
          employee_amount?: number
          employer_amount?: number
          id?: string
          payroll_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_item_deductions_deduction_type_id_fkey"
            columns: ["deduction_type_id"]
            isOneToOne: false
            referencedRelation: "deduction_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_item_deductions_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          created_at: string
          employee_id: string
          employer_benefits: number
          employer_medicare: number
          employer_ss: number
          federal_tax: number
          gross_pay: number
          hours_worked: number | null
          id: string
          local_tax: number
          medicare: number
          net_pay: number
          org_id: string
          other_deductions: number
          overtime_hours: number | null
          payroll_run_id: string
          regular_hours: number | null
          social_security: number
          state_tax: number
          status: string
          total_deductions: number
          total_employer_cost: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          employer_benefits?: number
          employer_medicare?: number
          employer_ss?: number
          federal_tax?: number
          gross_pay?: number
          hours_worked?: number | null
          id?: string
          local_tax?: number
          medicare?: number
          net_pay?: number
          org_id: string
          other_deductions?: number
          overtime_hours?: number | null
          payroll_run_id: string
          regular_hours?: number | null
          social_security?: number
          state_tax?: number
          status?: string
          total_deductions?: number
          total_employer_cost?: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          employer_benefits?: number
          employer_medicare?: number
          employer_ss?: number
          federal_tax?: number
          gross_pay?: number
          hours_worked?: number | null
          id?: string
          local_tax?: number
          medicare?: number
          net_pay?: number
          org_id?: string
          other_deductions?: number
          overtime_hours?: number | null
          payroll_run_id?: string
          regular_hours?: number | null
          social_security?: number
          state_tax?: number
          status?: string
          total_deductions?: number
          total_employer_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          created_at: string
          entity_id: string
          id: string
          org_id: string
          pay_date: string
          pay_frequency: string
          period_end: string
          period_name: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          id?: string
          org_id: string
          pay_date: string
          pay_frequency: string
          period_end: string
          period_name: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          id?: string
          org_id?: string
          pay_date?: string
          pay_frequency?: string
          period_end?: string
          period_name?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          employee_count: number
          id: string
          journal_entry_id: string | null
          notes: string | null
          org_id: string
          payroll_period_id: string
          posted_at: string | null
          posted_by: string | null
          run_date: string
          run_number: string
          status: string
          total_deductions: number
          total_employer_cost: number
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_count?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          org_id: string
          payroll_period_id: string
          posted_at?: string | null
          posted_by?: string | null
          run_date?: string
          run_number: string
          status?: string
          total_deductions?: number
          total_employer_cost?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_count?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          org_id?: string
          payroll_period_id?: string
          posted_at?: string | null
          posted_by?: string | null
          run_date?: string
          run_number?: string
          status?: string
          total_deductions?: number
          total_employer_cost?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          created_at: string
          deductions_breakdown: Json | null
          earnings_breakdown: Json | null
          employee_id: string
          generated_at: string
          gross_pay: number
          id: string
          net_pay: number
          org_id: string
          pay_date: string
          payroll_item_id: string
          payroll_run_id: string
          payslip_number: string
          period_end: string
          period_start: string
          total_deductions: number
          ytd_deductions: number | null
          ytd_gross: number | null
          ytd_net: number | null
        }
        Insert: {
          created_at?: string
          deductions_breakdown?: Json | null
          earnings_breakdown?: Json | null
          employee_id: string
          generated_at?: string
          gross_pay: number
          id?: string
          net_pay: number
          org_id: string
          pay_date: string
          payroll_item_id: string
          payroll_run_id: string
          payslip_number: string
          period_end: string
          period_start: string
          total_deductions: number
          ytd_deductions?: number | null
          ytd_gross?: number | null
          ytd_net?: number | null
        }
        Update: {
          created_at?: string
          deductions_breakdown?: Json | null
          earnings_breakdown?: Json | null
          employee_id?: string
          generated_at?: string
          gross_pay?: number
          id?: string
          net_pay?: number
          org_id?: string
          pay_date?: string
          payroll_item_id?: string
          payroll_run_id?: string
          payslip_number?: string
          period_end?: string
          period_start?: string
          total_deductions?: number
          ytd_deductions?: number | null
          ytd_gross?: number | null
          ytd_net?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          code: string
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean
          max_salary: number | null
          min_salary: number | null
          org_id: string
          title: string
        }
        Insert: {
          code: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_salary?: number | null
          min_salary?: number | null
          org_id: string
          title: string
        }
        Update: {
          code?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_salary?: number | null
          min_salary?: number | null
          org_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      positive_pay_checks: {
        Row: never
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "positive_pay_checks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positive_pay_checks_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positive_pay_checks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positive_pay_checks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      precedent_references: {
        Row: {
          created_at: string
          decision_id: string
          id: string
          match_reason: string | null
          precedent_decision_id: string
          similarity_score: number | null
        }
        Insert: {
          created_at?: string
          decision_id: string
          id?: string
          match_reason?: string | null
          precedent_decision_id: string
          similarity_score?: number | null
        }
        Update: {
          created_at?: string
          decision_id?: string
          id?: string
          match_reason?: string | null
          precedent_decision_id?: string
          similarity_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "precedent_references_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_traces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precedent_references_precedent_decision_id_fkey"
            columns: ["precedent_decision_id"]
            isOneToOne: false
            referencedRelation: "decision_traces"
            referencedColumns: ["id"]
          },
        ]
      }
      prepaid_expenses: {
        Row: {
          amortization_method: string
          cost_center_id: string | null
          created_at: string
          description: string
          end_date: string
          entity_id: string
          expense_account_id: string | null
          id: string
          notes: string | null
          org_id: string
          original_amount: number
          prepaid_account_id: string | null
          reference_number: string | null
          remaining_amount: number
          start_date: string
          status: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          amortization_method?: string
          cost_center_id?: string | null
          created_at?: string
          description: string
          end_date: string
          entity_id: string
          expense_account_id?: string | null
          id?: string
          notes?: string | null
          org_id: string
          original_amount: number
          prepaid_account_id?: string | null
          reference_number?: string | null
          remaining_amount: number
          start_date: string
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          amortization_method?: string
          cost_center_id?: string | null
          created_at?: string
          description?: string
          end_date?: string
          entity_id?: string
          expense_account_id?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          original_amount?: number
          prepaid_account_id?: string | null
          reference_number?: string | null
          remaining_amount?: number
          start_date?: string
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prepaid_expenses_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prepaid_expenses_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prepaid_expenses_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prepaid_expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prepaid_expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prepaid_expenses_prepaid_account_id_fkey"
            columns: ["prepaid_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prepaid_expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      production_goods_receipts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          posting_date: string
          product_id: string
          production_order_id: string
          quantity: number
          receipt_number: string
          sales_order_id: string | null
          sales_order_item_id: string | null
          stock_type: Database["public"]["Enums"]["goods_receipt_stock_type"]
          uom: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          posting_date?: string
          product_id: string
          production_order_id: string
          quantity: number
          receipt_number: string
          sales_order_id?: string | null
          sales_order_item_id?: string | null
          stock_type: Database["public"]["Enums"]["goods_receipt_stock_type"]
          uom?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          posting_date?: string
          product_id?: string
          production_order_id?: string
          quantity?: number
          receipt_number?: string
          sales_order_id?: string | null
          sales_order_item_id?: string | null
          stock_type?: Database["public"]["Enums"]["goods_receipt_stock_type"]
          uom?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_goods_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_goods_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_goods_receipts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_goods_receipts_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_goods_receipts_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_goods_receipts_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_goods_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_components: {
        Row: {
          backflushed_at: string | null
          bin_location_id: string | null
          created_at: string
          id: string
          is_backflushed: boolean
          issued_quantity: number
          product_id: string
          production_order_id: string
          required_quantity: number
          unit_cost: number
        }
        Insert: {
          backflushed_at?: string | null
          bin_location_id?: string | null
          created_at?: string
          id?: string
          is_backflushed?: boolean
          issued_quantity?: number
          product_id: string
          production_order_id: string
          required_quantity?: number
          unit_cost?: number
        }
        Update: {
          backflushed_at?: string | null
          bin_location_id?: string | null
          created_at?: string
          id?: string
          is_backflushed?: boolean
          issued_quantity?: number
          product_id?: string
          production_order_id?: string
          required_quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_order_components_bin_location_id_fkey"
            columns: ["bin_location_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_components_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_components_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_operations: {
        Row: {
          actual_run_time: number | null
          actual_setup_time: number | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          notes: string | null
          operation_name: string
          operation_number: number
          planned_run_time: number
          planned_setup_time: number
          production_order_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["operation_status"]
          work_center_id: string
        }
        Insert: {
          actual_run_time?: number | null
          actual_setup_time?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          operation_name: string
          operation_number: number
          planned_run_time?: number
          planned_setup_time?: number
          production_order_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["operation_status"]
          work_center_id: string
        }
        Update: {
          actual_run_time?: number | null
          actual_setup_time?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          operation_name?: string
          operation_number?: number
          planned_run_time?: number
          planned_setup_time?: number
          production_order_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["operation_status"]
          work_center_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_order_operations_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_operations_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "work_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          approved_at: string | null
          approved_by: string | null
          bom_id: string
          completed_quantity: number
          confirmed_quantity: number
          created_at: string
          created_by: string | null
          entity_id: string
          id: string
          notes: string | null
          order_number: string
          org_id: string
          planned_end_date: string | null
          planned_quantity: number
          planned_start_date: string | null
          priority: number
          product_id: string
          released_at: string | null
          sales_order_id: string | null
          sales_order_item_id: string | null
          scrapped_quantity: number
          status: Database["public"]["Enums"]["production_order_status"]
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bom_id: string
          completed_quantity?: number
          confirmed_quantity?: number
          created_at?: string
          created_by?: string | null
          entity_id: string
          id?: string
          notes?: string | null
          order_number: string
          org_id: string
          planned_end_date?: string | null
          planned_quantity?: number
          planned_start_date?: string | null
          priority?: number
          product_id: string
          released_at?: string | null
          sales_order_id?: string | null
          sales_order_item_id?: string | null
          scrapped_quantity?: number
          status?: Database["public"]["Enums"]["production_order_status"]
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bom_id?: string
          completed_quantity?: number
          confirmed_quantity?: number
          created_at?: string
          created_by?: string | null
          entity_id?: string
          id?: string
          notes?: string | null
          order_number?: string
          org_id?: string
          planned_end_date?: string | null
          planned_quantity?: number
          planned_start_date?: string | null
          priority?: number
          product_id?: string
          released_at?: string | null
          sales_order_id?: string | null
          sales_order_item_id?: string | null
          scrapped_quantity?: number
          status?: Database["public"]["Enums"]["production_order_status"]
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          consignment_vendor_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_batch_tracked: boolean
          is_consignment: boolean
          is_serialized: boolean
          name: string
          org_id: string
          planning_strategy: Database["public"]["Enums"]["planning_strategy"]
          reorder_point: number | null
          reorder_quantity: number | null
          sku: string
          standard_cost: number
          unit_of_measure: string
          updated_at: string
          valuation_method: Database["public"]["Enums"]["inventory_valuation_method"]
        }
        Insert: {
          consignment_vendor_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_batch_tracked?: boolean
          is_consignment?: boolean
          is_serialized?: boolean
          name: string
          org_id: string
          planning_strategy?: Database["public"]["Enums"]["planning_strategy"]
          reorder_point?: number | null
          reorder_quantity?: number | null
          sku: string
          standard_cost?: number
          unit_of_measure?: string
          updated_at?: string
          valuation_method?: Database["public"]["Enums"]["inventory_valuation_method"]
        }
        Update: {
          consignment_vendor_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_batch_tracked?: boolean
          is_consignment?: boolean
          is_serialized?: boolean
          name?: string
          org_id?: string
          planning_strategy?: Database["public"]["Enums"]["planning_strategy"]
          reorder_point?: number | null
          reorder_quantity?: number | null
          sku?: string
          standard_cost?: number
          unit_of_measure?: string
          updated_at?: string
          valuation_method?: Database["public"]["Enums"]["inventory_valuation_method"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_cost: number
          budget_amount: number
          cost_center_id: string | null
          created_at: string
          customer_id: string | null
          description: string | null
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          project_number: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actual_cost?: number
          budget_amount?: number
          cost_center_id?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          project_number: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actual_cost?: number
          budget_amount?: number
          cost_center_id?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          project_number?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          description: string
          id: string
          purchase_order_id: string
          quantity: number
          received_quantity: number
          unit_price: number
        }
        Insert: {
          account_id?: string | null
          amount?: number
          created_at?: string
          description: string
          id?: string
          purchase_order_id: string
          quantity?: number
          received_quantity?: number
          unit_price?: number
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          description?: string
          id?: string
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          expected_delivery_date: string | null
          id: string
          notes: string | null
          order_date: string
          org_id: string
          po_number: string
          status: Database["public"]["Enums"]["po_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          org_id: string
          po_number: string
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          org_id?: string
          po_number?: string
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisition_lines: {
        Row: {
          created_at: string
          description: string
          estimated_total: number | null
          estimated_unit_cost: number
          id: string
          notes: string | null
          product_id: string | null
          quantity: number
          requisition_id: string
          suggested_vendor_id: string | null
          unit_of_measure: string
        }
        Insert: {
          created_at?: string
          description: string
          estimated_total?: number | null
          estimated_unit_cost?: number
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          requisition_id: string
          suggested_vendor_id?: string | null
          unit_of_measure?: string
        }
        Update: {
          created_at?: string
          description?: string
          estimated_total?: number | null
          estimated_unit_cost?: number
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          requisition_id?: string
          suggested_vendor_id?: string | null
          unit_of_measure?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisition_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_lines_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_lines_suggested_vendor_id_fkey"
            columns: ["suggested_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisitions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          converted_at: string | null
          created_at: string
          department: string | null
          entity_id: string
          id: string
          notes: string | null
          org_id: string
          priority: string
          purchase_order_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requester_id: string | null
          required_date: string | null
          requisition_number: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          converted_at?: string | null
          created_at?: string
          department?: string | null
          entity_id: string
          id?: string
          notes?: string | null
          org_id: string
          priority?: string
          purchase_order_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requester_id?: string | null
          required_date?: string | null
          requisition_number: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          converted_at?: string | null
          created_at?: string
          department?: string | null
          entity_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          priority?: string
          purchase_order_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requester_id?: string | null
          required_date?: string | null
          requisition_number?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisitions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_lines: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          description: string
          id: string
          quantity: number
          quotation_id: string
          unit_price: number
        }
        Insert: {
          account_id?: string | null
          amount?: number
          created_at?: string
          description: string
          id?: string
          quantity?: number
          quotation_id: string
          unit_price?: number
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          quotation_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_lines_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          converted_so_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          entity_id: string
          id: string
          notes: string | null
          org_id: string
          quote_date: string
          quote_number: string
          status: Database["public"]["Enums"]["quotation_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          converted_so_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          entity_id: string
          id?: string
          notes?: string | null
          org_id: string
          quote_date?: string
          quote_number: string
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          converted_so_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          entity_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          quote_date?: string
          quote_number?: string
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_converted_so_id_fkey"
            columns: ["converted_so_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_predictions: {
        Row: {
          confidence_score: number | null
          created_at: string
          factors: Json | null
          forecast_period: string
          id: string
          model_version: string | null
          org_id: string
          predicted_pipeline_value: number
          predicted_revenue: number
          prediction_date: string
          weighted_pipeline: number
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          factors?: Json | null
          forecast_period: string
          id?: string
          model_version?: string | null
          org_id: string
          predicted_pipeline_value?: number
          predicted_revenue?: number
          prediction_date: string
          weighted_pipeline?: number
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          factors?: Json | null
          forecast_period?: string
          id?: string
          model_version?: string | null
          org_id?: string
          predicted_pipeline_value?: number
          predicted_revenue?: number
          prediction_date?: string
          weighted_pipeline?: number
        }
        Relationships: [
          {
            foreignKeyName: "revenue_predictions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_predictions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_lines: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          description: string
          id: string
          quantity: number
          sales_order_id: string
          shipped_quantity: number
          unit_price: number
        }
        Insert: {
          account_id?: string | null
          amount?: number
          created_at?: string
          description: string
          id?: string
          quantity?: number
          sales_order_id: string
          shipped_quantity?: number
          unit_price?: number
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          sales_order_id?: string
          shipped_quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          entity_id: string
          id: string
          notes: string | null
          order_date: string
          org_id: string
          requested_delivery_date: string | null
          so_number: string
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          entity_id: string
          id?: string
          notes?: string | null
          order_date?: string
          org_id: string
          requested_delivery_date?: string | null
          so_number: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          entity_id?: string
          id?: string
          notes?: string | null
          order_date?: string
          org_id?: string
          requested_delivery_date?: string | null
          so_number?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_targets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          period_end: string
          period_start: string
          period_type: string
          target_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          period_end: string
          period_start: string
          period_type?: string
          target_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          period_end?: string
          period_start?: string
          period_type?: string
          target_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_targets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_targets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_run_at: string | null
          name: string
          next_run_at: string | null
          org_id: string
          recipients: string[]
          report_config: Json
          report_type: string
          schedule_day: number | null
          schedule_frequency: string
          schedule_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          org_id: string
          recipients?: string[]
          report_config?: Json
          report_type: string
          schedule_day?: number | null
          schedule_frequency?: string
          schedule_time?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          org_id?: string
          recipients?: string[]
          report_config?: Json
          report_type?: string
          schedule_day?: number | null
          schedule_frequency?: string
          schedule_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      serial_numbers: {
        Row: {
          bin_location_id: string | null
          created_at: string
          id: string
          notes: string | null
          org_id: string
          product_id: string
          received_date: string | null
          serial_number: string
          sold_date: string | null
          status: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          bin_location_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          product_id: string
          received_date?: string | null
          serial_number: string
          sold_date?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          bin_location_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          product_id?: string
          received_date?: string | null
          serial_number?: string
          sold_date?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "serial_numbers_bin_location_id_fkey"
            columns: ["bin_location_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_calls: {
        Row: {
          actual_duration_hours: number | null
          assigned_to: string | null
          call_number: string
          call_type: string
          completed_at: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          estimated_duration_hours: number | null
          id: string
          is_billable: boolean | null
          labor_cost: number | null
          org_id: string
          parts_cost: number | null
          priority: string
          product_id: string | null
          reported_at: string
          reported_issue: string | null
          resolution: string | null
          scheduled_date: string | null
          status: string
          subject: string
          total_cost: number | null
          updated_at: string
          warranty_id: string | null
        }
        Insert: {
          actual_duration_hours?: number | null
          assigned_to?: string | null
          call_number: string
          call_type?: string
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          estimated_duration_hours?: number | null
          id?: string
          is_billable?: boolean | null
          labor_cost?: number | null
          org_id: string
          parts_cost?: number | null
          priority?: string
          product_id?: string | null
          reported_at?: string
          reported_issue?: string | null
          resolution?: string | null
          scheduled_date?: string | null
          status?: string
          subject: string
          total_cost?: number | null
          updated_at?: string
          warranty_id?: string | null
        }
        Update: {
          actual_duration_hours?: number | null
          assigned_to?: string | null
          call_number?: string
          call_type?: string
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          estimated_duration_hours?: number | null
          id?: string
          is_billable?: boolean | null
          labor_cost?: number | null
          org_id?: string
          parts_cost?: number | null
          priority?: string
          product_id?: string | null
          reported_at?: string
          reported_issue?: string | null
          resolution?: string | null
          scheduled_date?: string | null
          status?: string
          subject?: string
          total_cost?: number | null
          updated_at?: string
          warranty_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_calls_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_warranty_id_fkey"
            columns: ["warranty_id"]
            isOneToOne: false
            referencedRelation: "warranties"
            referencedColumns: ["id"]
          },
        ]
      }
      service_contracts: {
        Row: {
          auto_renew: boolean | null
          billing_frequency: string | null
          contract_number: string
          contract_type: string
          contract_value: number
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          end_date: string
          id: string
          org_id: string
          renewal_period_months: number | null
          start_date: string
          status: string
          terms_and_conditions: string | null
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean | null
          billing_frequency?: string | null
          contract_number: string
          contract_type?: string
          contract_value?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          end_date: string
          id?: string
          org_id: string
          renewal_period_months?: number | null
          start_date: string
          status?: string
          terms_and_conditions?: string | null
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean | null
          billing_frequency?: string | null
          contract_number?: string
          contract_type?: string
          contract_value?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          end_date?: string
          id?: string
          org_id?: string
          renewal_period_months?: number | null
          start_date?: string
          status?: string
          terms_and_conditions?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_lines: {
        Row: {
          created_at: string
          id: string
          quantity_shipped: number
          sales_order_line_id: string
          shipment_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          quantity_shipped?: number
          sales_order_line_id: string
          shipment_id: string
        }
        Update: {
          created_at?: string
          id?: string
          quantity_shipped?: number
          sales_order_line_id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_lines_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_lines_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          created_at: string
          entity_id: string
          id: string
          notes: string | null
          org_id: string
          sales_order_id: string
          ship_date: string
          shipment_number: string
          shipped_by: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          entity_id: string
          id?: string
          notes?: string | null
          org_id: string
          sales_order_id: string
          ship_date?: string
          shipment_number: string
          shipped_by?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          entity_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          sales_order_id?: string
          ship_date?: string
          shipment_number?: string
          shipped_by?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_lines: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity_received: number
          quantity_requested: number
          quantity_shipped: number
          transfer_id: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity_received?: number
          quantity_requested?: number
          quantity_shipped?: number
          transfer_id: string
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity_received?: number
          quantity_requested?: number
          quantity_shipped?: number
          transfer_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          actual_arrival_date: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          expected_arrival_date: string | null
          from_bin_id: string | null
          from_warehouse_id: string
          id: string
          notes: string | null
          org_id: string
          status: Database["public"]["Enums"]["transfer_status"]
          to_bin_id: string | null
          to_warehouse_id: string
          transfer_date: string
          transfer_number: string
          updated_at: string
        }
        Insert: {
          actual_arrival_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          expected_arrival_date?: string | null
          from_bin_id?: string | null
          from_warehouse_id: string
          id?: string
          notes?: string | null
          org_id: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_bin_id?: string | null
          to_warehouse_id: string
          transfer_date?: string
          transfer_number: string
          updated_at?: string
        }
        Update: {
          actual_arrival_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          expected_arrival_date?: string | null
          from_bin_id?: string | null
          from_warehouse_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_bin_id?: string | null
          to_warehouse_id?: string
          transfer_date?: string
          transfer_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_bin_id_fkey"
            columns: ["from_bin_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_bin_id_fkey"
            columns: ["to_bin_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_codes: {
        Row: {
          code: string
          created_at: string
          description: string | null
          gl_account_id: string | null
          id: string
          is_active: boolean
          is_recoverable: boolean
          name: string
          org_id: string
          tax_type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          is_recoverable?: boolean
          name: string
          org_id: string
          tax_type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          is_recoverable?: boolean
          name?: string
          org_id?: string
          tax_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_codes_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_filing_periods: {
        Row: {
          created_at: string
          entity_id: string
          filed_at: string | null
          filing_due_date: string
          id: string
          jurisdiction_id: string
          net_tax_payable: number | null
          notes: string | null
          org_id: string
          paid_at: string | null
          period_end: string
          period_name: string
          period_start: string
          status: string
          total_purchase_tax: number | null
          total_sales_tax: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          filed_at?: string | null
          filing_due_date: string
          id?: string
          jurisdiction_id: string
          net_tax_payable?: number | null
          notes?: string | null
          org_id: string
          paid_at?: string | null
          period_end: string
          period_name: string
          period_start: string
          status?: string
          total_purchase_tax?: number | null
          total_sales_tax?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          filed_at?: string | null
          filing_due_date?: string
          id?: string
          jurisdiction_id?: string
          net_tax_payable?: number | null
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          period_end?: string
          period_name?: string
          period_start?: string
          status?: string
          total_purchase_tax?: number | null
          total_sales_tax?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_filing_periods_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_filing_periods_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "tax_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_filing_periods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_filing_periods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_jurisdictions: {
        Row: {
          code: string
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          jurisdiction_type: string
          name: string
          org_id: string
          parent_id: string | null
          state_province: string | null
          updated_at: string
        }
        Insert: {
          code: string
          country_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          jurisdiction_type?: string
          name: string
          org_id: string
          parent_id?: string | null
          state_province?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          jurisdiction_type?: string
          name?: string
          org_id?: string
          parent_id?: string | null
          state_province?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_jurisdictions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_jurisdictions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_jurisdictions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tax_jurisdictions"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          is_compound: boolean
          jurisdiction_id: string | null
          org_id: string
          priority: number
          rate: number
          tax_code_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_compound?: boolean
          jurisdiction_id?: string | null
          org_id: string
          priority?: number
          rate: number
          tax_code_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_compound?: boolean
          jurisdiction_id?: string | null
          org_id?: string
          priority?: number
          rate?: number
          tax_code_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "tax_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_transactions: {
        Row: {
          base_amount: number
          created_at: string
          currency: string
          entity_id: string
          exchange_rate: number | null
          filed_at: string | null
          functional_tax_amount: number | null
          id: string
          is_recoverable: boolean
          jurisdiction_id: string | null
          org_id: string
          source_id: string
          source_type: string
          status: string
          tax_amount: number
          tax_code_id: string
          tax_period: string
          tax_rate: number
          tax_rate_id: string | null
          transaction_date: string
          updated_at: string
        }
        Insert: {
          base_amount: number
          created_at?: string
          currency?: string
          entity_id: string
          exchange_rate?: number | null
          filed_at?: string | null
          functional_tax_amount?: number | null
          id?: string
          is_recoverable?: boolean
          jurisdiction_id?: string | null
          org_id: string
          source_id: string
          source_type: string
          status?: string
          tax_amount: number
          tax_code_id: string
          tax_period: string
          tax_rate: number
          tax_rate_id?: string | null
          transaction_date: string
          updated_at?: string
        }
        Update: {
          base_amount?: number
          created_at?: string
          currency?: string
          entity_id?: string
          exchange_rate?: number | null
          filed_at?: string | null
          functional_tax_amount?: number | null
          id?: string
          is_recoverable?: boolean
          jurisdiction_id?: string | null
          org_id?: string
          source_id?: string
          source_type?: string
          status?: string
          tax_amount?: number
          tax_code_id?: string
          tax_period?: string
          tax_rate?: number
          tax_rate_id?: string | null
          transaction_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_transactions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_transactions_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "tax_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_transactions_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_transactions_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off_balances: {
        Row: {
          accrued_days: number
          adjusted_days: number
          carried_over: number
          created_at: string
          employee_id: string
          id: string
          org_id: string
          time_off_type_id: string
          updated_at: string
          used_days: number
          year: number
        }
        Insert: {
          accrued_days?: number
          adjusted_days?: number
          carried_over?: number
          created_at?: string
          employee_id: string
          id?: string
          org_id: string
          time_off_type_id: string
          updated_at?: string
          used_days?: number
          year: number
        }
        Update: {
          accrued_days?: number
          adjusted_days?: number
          carried_over?: number
          created_at?: string
          employee_id?: string
          id?: string
          org_id?: string
          time_off_type_id?: string
          updated_at?: string
          used_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "time_off_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_balances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_balances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_balances_time_off_type_id_fkey"
            columns: ["time_off_type_id"]
            isOneToOne: false
            referencedRelation: "time_off_types"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          days_requested: number
          employee_id: string
          end_date: string
          id: string
          org_id: string
          reason: string | null
          rejection_reason: string | null
          start_date: string
          status: string
          time_off_type_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          days_requested: number
          employee_id: string
          end_date: string
          id?: string
          org_id: string
          reason?: string | null
          rejection_reason?: string | null
          start_date: string
          status?: string
          time_off_type_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          days_requested?: number
          employee_id?: string
          end_date?: string
          id?: string
          org_id?: string
          reason?: string | null
          rejection_reason?: string | null
          start_date?: string
          status?: string
          time_off_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_time_off_type_id_fkey"
            columns: ["time_off_type_id"]
            isOneToOne: false
            referencedRelation: "time_off_types"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off_types: {
        Row: {
          code: string
          created_at: string
          default_days_per_year: number
          id: string
          is_active: boolean
          is_paid: boolean
          name: string
          org_id: string
        }
        Insert: {
          code: string
          created_at?: string
          default_days_per_year?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name: string
          org_id: string
        }
        Update: {
          code?: string
          created_at?: string
          default_days_per_year?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "user_roles_profile_identity_fkey"
            columns: ["org_id", "user_id", "role"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["org_id", "id", "role"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          org_id: string
          payment_terms: number | null
          phone: string | null
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "vendors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      warranties: {
        Row: {
          coverage_details: string | null
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          org_id: string
          product_id: string | null
          purchase_date: string | null
          serial_number: string | null
          status: string
          updated_at: string
          warranty_end_date: string
          warranty_number: string
          warranty_start_date: string
          warranty_type: string
        }
        Insert: {
          coverage_details?: string | null
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          org_id: string
          product_id?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_end_date: string
          warranty_number: string
          warranty_start_date: string
          warranty_type?: string
        }
        Update: {
          coverage_details?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          product_id?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_end_date?: string
          warranty_number?: string
          warranty_start_date?: string
          warranty_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      work_centers: {
        Row: {
          capacity_per_day: number
          code: string
          created_at: string
          description: string | null
          efficiency_rate: number
          hourly_rate: number
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          capacity_per_day?: number
          code: string
          created_at?: string
          description?: string | null
          efficiency_rate?: number
          hourly_rate?: number
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          capacity_per_day?: number
          code?: string
          created_at?: string
          description?: string | null
          efficiency_rate?: number
          hourly_rate?: number
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_centers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_centers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      organizations_safe: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      configure_entity_supplier_bill_accounts: {
        Args: {
          p_ap_account_id: string
          p_entity_id: string
          p_expense_account_id: string
          p_idempotency_key: string
        }
        Returns: string
      }
      configure_entity_supplier_payment_accounts: {
        Args: {
          p_cash_account_id: string
          p_entity_id: string
          p_idempotency_key: string
        }
        Returns: string
      }
      configure_entity_customer_receipt_accounts: {
        Args: {
          p_cash_account_id: string
          p_entity_id: string
          p_idempotency_key: string
        }
        Returns: string
      }
      configure_entity_invoice_accounts: {
        Args: {
          p_ar_account_id: string
          p_entity_id: string
          p_idempotency_key: string
          p_revenue_account_id: string
        }
        Returns: string
      }
      create_accounting_period: {
        Args: {
          p_entity_id: string
          p_idempotency_key: string
          p_period_end: string
          p_period_start: string
        }
        Returns: string
      }
      calculate_tax: {
        Args: {
          p_amount: number
          p_jurisdiction_id?: string
          p_tax_code_id: string
          p_transaction_date?: string
        }
        Returns: number
      }
      convert_currency: {
        Args: {
          p_amount: number
          p_date?: string
          p_from_currency: string
          p_org_id: string
          p_to_currency: string
        }
        Returns: number
      }
      find_similar_precedents: {
        Args: {
          p_decision_type?: string
          p_embedding: string
          p_limit?: number
          p_org_id: string
          p_threshold?: number
        }
        Returns: {
          approval_status: string
          created_at: string
          decision_id: string
          decision_type: string
          input_snapshot: Json
          rationale_text: string
          similarity: number
        }[]
      }
      get_current_tax_rate: {
        Args: { p_jurisdiction_id?: string; p_tax_code_id: string }
        Returns: number
      }
      get_exchange_rate: {
        Args: {
          p_date?: string
          p_from_currency: string
          p_org_id: string
          p_rate_type?: string
          p_to_currency: string
        }
        Returns: number
      }
      get_org_openai_key: { Args: never; Returns: string }
      get_user_org_id: { Args: never; Returns: string }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      post_production_goods_receipt: {
        Args: {
          p_created_by?: string
          p_org_id: string
          p_production_order_id: string
          p_quantity: number
          p_warehouse_id: string
        }
        Returns: string
      }
      post_manual_journal: {
        Args: {
          p_entity_id: string
          p_entry_date: string
          p_entry_number: string
          p_idempotency_key: string
          p_lines: Json
          p_memo: string | null
        }
        Returns: string
      }
      post_customer_invoice: {
        Args: {
          p_currency: string
          p_customer_id: string
          p_due_date: string
          p_entity_id: string
          p_idempotency_key: string
          p_invoice_number: string
          p_issue_date: string
          p_lines: Json
          p_notes: string | null
          p_tax: number
        }
        Returns: string
      }
      post_customer_credit_note: {
        Args: {
          p_credit_date: string
          p_credit_note_number: string
          p_idempotency_key: string
          p_invoice_id: string
          p_reason: string
        }
        Returns: string
      }
      post_customer_receipt: {
        Args: {
          p_currency: string
          p_idempotency_key: string
          p_invoice_id: string
          p_receipt_date: string
          p_receipt_number: string
          p_reference: string
        }
        Returns: string
      }
      post_customer_receipt_correction: {
        Args: {
          p_correction_date: string
          p_correction_number: string
          p_idempotency_key: string
          p_reason: string
          p_receipt_id: string
        }
        Returns: string
      }
      post_supplier_bill: {
        Args: {
          p_bill_number: string
          p_currency: string
          p_due_date: string
          p_entity_id: string
          p_idempotency_key: string
          p_issue_date: string
          p_lines: Json
          p_notes: string | null
          p_tax: number
          p_vendor_id: string
        }
        Returns: string
      }
      post_supplier_bill_credit: {
        Args: {
          p_bill_id: string
          p_credit_date: string
          p_credit_note_number: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: string
      }
      post_supplier_payment: {
        Args: {
          p_bill_id: string
          p_currency: string
          p_idempotency_key: string
          p_payment_date: string
          p_payment_number: string
          p_reference: string
        }
        Returns: string
      }
      post_supplier_payment_correction: {
        Args: {
          p_correction_date: string
          p_correction_number: string
          p_idempotency_key: string
          p_payment_id: string
          p_reason: string
        }
        Returns: string
      }
      reverse_posted_journal: {
        Args: {
          p_idempotency_key: string
          p_journal_entry_id: string
          p_reason: string
          p_reversal_date: string
        }
        Returns: string
      }
      search_precedents_by_text: {
        Args: {
          p_decision_type?: string
          p_limit?: number
          p_org_id: string
          p_search_text: string
        }
        Returns: {
          approval_status: string
          created_at: string
          decision_id: string
          decision_type: string
          input_snapshot: Json
          rationale_text: string
          reason_codes: string[]
          relevance: number
        }[]
      }
      transition_accounting_period: {
        Args: {
          p_period_id: string
          p_reason: string
          p_to_status: string
        }
        Returns: string
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
      app_role: "admin" | "moderator" | "user" | "viewer"
      bill_status: "draft" | "pending" | "paid" | "overdue" | "cancelled"
      close_task_status: "pending" | "in_progress" | "complete" | "overdue"
      cycle_count_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      goods_receipt_stock_type: "unrestricted" | "sales_order_stock"
      inventory_valuation_method: "fifo" | "lifo" | "average"
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
      journal_status: "draft" | "posted" | "reversed"
      operation_status: "pending" | "in_progress" | "completed" | "cancelled"
      payment_run_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "processing"
        | "completed"
        | "failed"
      planning_strategy: "mts" | "mto"
      po_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "partially_received"
        | "received"
        | "cancelled"
      production_order_status:
        | "draft"
        | "planned"
        | "released"
        | "in_progress"
        | "partially_delivered"
        | "completed"
        | "cancelled"
      quotation_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "converted"
      transaction_status: "pending" | "matched" | "reconciled"
      transfer_status:
        | "draft"
        | "pending"
        | "in_transit"
        | "completed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["asset", "liability", "equity", "revenue", "expense"],
      app_role: ["admin", "moderator", "user", "viewer"],
      bill_status: ["draft", "pending", "paid", "overdue", "cancelled"],
      close_task_status: ["pending", "in_progress", "complete", "overdue"],
      cycle_count_status: [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      goods_receipt_stock_type: ["unrestricted", "sales_order_stock"],
      inventory_valuation_method: ["fifo", "lifo", "average"],
      invoice_status: ["draft", "sent", "paid", "overdue", "cancelled"],
      journal_status: ["draft", "posted", "reversed"],
      operation_status: ["pending", "in_progress", "completed", "cancelled"],
      payment_run_status: [
        "draft",
        "pending_approval",
        "approved",
        "processing",
        "completed",
        "failed",
      ],
      planning_strategy: ["mts", "mto"],
      po_status: [
        "draft",
        "pending_approval",
        "approved",
        "partially_received",
        "received",
        "cancelled",
      ],
      production_order_status: [
        "draft",
        "planned",
        "released",
        "in_progress",
        "partially_delivered",
        "completed",
        "cancelled",
      ],
      quotation_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "converted",
      ],
      transaction_status: ["pending", "matched", "reconciled"],
      transfer_status: [
        "draft",
        "pending",
        "in_transit",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
