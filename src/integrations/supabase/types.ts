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
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
        ]
      }
      bank_accounts: {
        Row: {
          account_id: string | null
          account_number: string | null
          bank_name: string | null
          created_at: string
          currency: string
          current_balance: number
          entity_id: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          routing_number: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          entity_id: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          routing_number?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          entity_id?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          routing_number?: string | null
          updated_at?: string
        }
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
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string
          description: string | null
          id: string
          matched_bill_id: string | null
          matched_invoice_id: string | null
          org_id: string
          status: Database["public"]["Enums"]["transaction_status"]
          suggested_account_id: string | null
          transaction_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          created_at?: string
          description?: string | null
          id?: string
          matched_bill_id?: string | null
          matched_invoice_id?: string | null
          org_id: string
          status?: Database["public"]["Enums"]["transaction_status"]
          suggested_account_id?: string | null
          transaction_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string
          description?: string | null
          id?: string
          matched_bill_id?: string | null
          matched_invoice_id?: string | null
          org_id?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          suggested_account_id?: string | null
          transaction_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
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
            foreignKeyName: "bank_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          amount_paid: number
          bill_number: string
          created_at: string
          due_date: string
          entity_id: string
          goods_receipt_id: string | null
          id: string
          issue_date: string
          match_status: string | null
          notes: string | null
          org_id: string
          purchase_order_id: string | null
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount_paid?: number
          bill_number: string
          created_at?: string
          due_date: string
          entity_id: string
          goods_receipt_id?: string | null
          id?: string
          issue_date?: string
          match_status?: string | null
          notes?: string | null
          org_id: string
          purchase_order_id?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount_paid?: number
          bill_number?: string
          created_at?: string
          due_date?: string
          entity_id?: string
          goods_receipt_id?: string | null
          id?: string
          issue_date?: string
          match_status?: string | null
          notes?: string | null
          org_id?: string
          purchase_order_id?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          vendor_id?: string
        }
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
            foreignKeyName: "bills_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
            foreignKeyName: "capacity_schedules_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "work_centers"
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
        Insert: {
          address?: string | null
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          id?: string
          name: string
          org_id: string
          payment_terms?: number | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          id?: string
          name?: string
          org_id?: string
          payment_terms?: number | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      entities: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      invoices: {
        Row: {
          amount_paid: number
          created_at: string
          customer_id: string
          due_date: string
          entity_id: string
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          org_id: string
          sales_order_id: string | null
          shipment_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          customer_id: string
          due_date: string
          entity_id: string
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          org_id: string
          sales_order_id?: string | null
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          customer_id?: string
          due_date?: string
          entity_id?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          org_id?: string
          sales_order_id?: string | null
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
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
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entry_date: string
          entry_number: string
          id: string
          memo: string | null
          org_id: string
          posted_at: string | null
          status: Database["public"]["Enums"]["journal_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entry_date?: string
          entry_number: string
          id?: string
          memo?: string | null
          org_id: string
          posted_at?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entry_date?: string
          entry_number?: string
          id?: string
          memo?: string | null
          org_id?: string
          posted_at?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
        }
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
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          id: string
          journal_entry_id: string
          memo: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_entry_id: string
          memo?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_entry_id?: string
          memo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
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
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_run_items: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          id: string
          payment_run_id: string
        }
        Insert: {
          amount?: number
          bill_id: string
          created_at?: string
          id?: string
          payment_run_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          id?: string
          payment_run_id?: string
        }
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
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          id?: string
          org_id: string
          payment_method?: string | null
          processed_at?: string | null
          run_date?: string
          run_number: string
          status?: Database["public"]["Enums"]["payment_run_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          id?: string
          org_id?: string
          payment_method?: string | null
          processed_at?: string | null
          run_date?: string
          run_number?: string
          status?: Database["public"]["Enums"]["payment_run_status"]
          total_amount?: number
          updated_at?: string
        }
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
          org_id: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          org_id?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          org_id?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
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
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          org_id: string
          payment_terms?: number | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          org_id?: string
          payment_terms?: number | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_id: { Args: never; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
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
