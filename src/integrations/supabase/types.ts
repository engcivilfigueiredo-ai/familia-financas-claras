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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          color: string
          created_at: string
          currency: string
          current_balance: number
          family_member_id: string | null
          icon: string | null
          id: string
          initial_balance: number
          institution: string | null
          is_active: boolean
          name: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          currency?: string
          current_balance?: number
          family_member_id?: string | null
          icon?: string | null
          id?: string
          initial_balance?: number
          institution?: string | null
          is_active?: boolean
          name: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          currency?: string
          current_balance?: number
          family_member_id?: string | null
          icon?: string | null
          id?: string
          initial_balance?: number
          institution?: string | null
          is_active?: boolean
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          acquisition_date: string | null
          created_at: string
          family_member_id: string | null
          id: string
          name: string
          type: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          acquisition_date?: string | null
          created_at?: string
          family_member_id?: string | null
          id?: string
          name: string
          type?: string
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          acquisition_date?: string | null
          created_at?: string
          family_member_id?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "assets_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          file_type: string | null
          file_url: string
          id: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_type?: string | null
          file_url: string
          id?: string
          transaction_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_type?: string | null
          file_url?: string
          id?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          category_id: string
          created_at: string
          family_member_id: string | null
          id: string
          limit_amount: number
          month_reference: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          family_member_id?: string | null
          id?: string
          limit_amount?: number
          month_reference: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          family_member_id?: string | null
          id?: string
          limit_amount?: number
          month_reference?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          created_at: string
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          type: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          type?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          brand: string | null
          closing_day: number
          color: string
          created_at: string
          credit_limit: number
          due_day: number
          family_member_id: string | null
          id: string
          institution: string | null
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          closing_day?: number
          color?: string
          created_at?: string
          credit_limit?: number
          due_day?: number
          family_member_id?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          closing_day?: number
          color?: string
          created_at?: string
          credit_limit?: number
          due_day?: number
          family_member_id?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_config: {
        Row: {
          created_at: string
          name: string
          token: string
        }
        Insert: {
          created_at?: string
          name: string
          token?: string
        }
        Update: {
          created_at?: string
          name?: string
          token?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          avatar_url: string | null
          color: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          relationship: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          relationship?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          relationship?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_goals: {
        Row: {
          category: string | null
          created_at: string
          current_amount: number
          family_member_id: string | null
          goal_kind: string
          goal_year: number | null
          id: string
          monthly_contribution_needed: number | null
          name: string
          target_amount: number
          target_date: string | null
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          current_amount?: number
          family_member_id?: string | null
          goal_kind?: string
          goal_year?: number | null
          id?: string
          monthly_contribution_needed?: number | null
          name: string
          target_amount?: number
          target_date?: string | null
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          current_amount?: number
          family_member_id?: string | null
          goal_kind?: string
          goal_year?: number | null
          id?: string
          monthly_contribution_needed?: number | null
          name?: string
          target_amount?: number
          target_date?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_goals_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          category_id: string | null
          created_at: string
          credit_card_id: string | null
          family_member_id: string | null
          id: string
          installment_count: number
          purchase_date: string
          purchase_description: string
          total_amount: number
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          family_member_id?: string | null
          id?: string
          installment_count: number
          purchase_date?: string
          purchase_description: string
          total_amount: number
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          family_member_id?: string | null
          id?: string
          installment_count?: number
          purchase_date?: string
          purchase_description?: string
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_transactions: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          date: string
          id: string
          investment_id: string
          ir_type: string | null
          quantity: number | null
          rate_per_share: number | null
          type: string
          user_id: string
          yield_percent: number | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          date?: string
          id?: string
          investment_id: string
          ir_type?: string | null
          quantity?: number | null
          rate_per_share?: number | null
          type?: string
          user_id: string
          yield_percent?: number | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          date?: string
          id?: string
          investment_id?: string
          ir_type?: string | null
          quantity?: number | null
          rate_per_share?: number | null
          type?: string
          user_id?: string
          yield_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_transactions_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          application_date: string
          average_price: number | null
          beneficiary: string | null
          created_at: string
          current_amount: number
          family_member_id: string | null
          id: string
          institution: string | null
          invested_amount: number
          last_quote: number | null
          liquidity: string | null
          maturity_date: string | null
          name: string
          plan_type: string | null
          quantity: number | null
          quote_updated_at: string | null
          status: string
          tax_regime: string | null
          ticker: string | null
          type: string
          updated_at: string
          user_id: string
          withhold_ir: boolean | null
        }
        Insert: {
          application_date?: string
          average_price?: number | null
          beneficiary?: string | null
          created_at?: string
          current_amount?: number
          family_member_id?: string | null
          id?: string
          institution?: string | null
          invested_amount?: number
          last_quote?: number | null
          liquidity?: string | null
          maturity_date?: string | null
          name: string
          plan_type?: string | null
          quantity?: number | null
          quote_updated_at?: string | null
          status?: string
          tax_regime?: string | null
          ticker?: string | null
          type?: string
          updated_at?: string
          user_id: string
          withhold_ir?: boolean | null
        }
        Update: {
          application_date?: string
          average_price?: number | null
          beneficiary?: string | null
          created_at?: string
          current_amount?: number
          family_member_id?: string | null
          id?: string
          institution?: string | null
          invested_amount?: number
          last_quote?: number | null
          liquidity?: string | null
          maturity_date?: string | null
          name?: string
          plan_type?: string | null
          quantity?: number | null
          quote_updated_at?: string | null
          status?: string
          tax_regime?: string | null
          ticker?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          withhold_ir?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "investments_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          closing_date: string
          created_at: string
          credit_card_id: string
          due_date: string
          id: string
          reference_month: string
          status: string
          total_amount: number
          user_id: string
        }
        Insert: {
          closing_date: string
          created_at?: string
          credit_card_id: string
          due_date: string
          id?: string
          reference_month: string
          status?: string
          total_amount?: number
          user_id: string
        }
        Update: {
          closing_date?: string
          created_at?: string
          credit_card_id?: string
          due_date?: string
          id?: string
          reference_month?: string
          status?: string
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      liabilities: {
        Row: {
          created_at: string
          due_day: number | null
          family_member_id: string | null
          id: string
          monthly_payment: number
          name: string
          remaining_amount: number
          total_amount: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_day?: number | null
          family_member_id?: string | null
          id?: string
          monthly_payment?: number
          name: string
          remaining_amount?: number
          total_amount?: number
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_day?: number | null
          family_member_id?: string | null
          id?: string
          monthly_payment?: number
          name?: string
          remaining_amount?: number
          total_amount?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liabilities_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          due_date: string | null
          id: string
          is_read: boolean
          message: string
          related_entity_id: string | null
          related_entity_type: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          id?: string
          is_read?: boolean
          message: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          id?: string
          is_read?: boolean
          message?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          currency: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          currency?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          currency?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget_amount: number
          budget_date: string | null
          city: string | null
          closing_date: string | null
          contract_amount: number
          created_at: string
          id: string
          name: string
          notes: string | null
          project_number: string
          received_amount: number
          state: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_amount?: number
          budget_date?: string | null
          city?: string | null
          closing_date?: string | null
          contract_amount?: number
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          project_number: string
          received_amount?: number
          state?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_amount?: number
          budget_date?: string | null
          city?: string | null
          closing_date?: string | null
          contract_amount?: number
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          project_number?: string
          received_amount?: number
          state?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_transactions: {
        Row: {
          account_id: string | null
          alert_days: number
          amount: number
          category_id: string | null
          created_at: string
          credit_card_id: string | null
          description: string
          due_day: number | null
          end_date: string | null
          family_member_id: string | null
          frequency: string
          id: string
          investment_id: string | null
          is_active: boolean
          is_investment_contribution: boolean | null
          is_variable_amount: boolean
          start_date: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          alert_days?: number
          amount: number
          category_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          description: string
          due_day?: number | null
          end_date?: string | null
          family_member_id?: string | null
          frequency?: string
          id?: string
          investment_id?: string | null
          is_active?: boolean
          is_investment_contribution?: boolean | null
          is_variable_amount?: boolean
          start_date?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          alert_days?: number
          amount?: number
          category_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          description?: string
          due_day?: number | null
          end_date?: string | null
          family_member_id?: string | null
          frequency?: string
          id?: string
          investment_id?: string | null
          is_active?: boolean
          is_investment_contribution?: boolean | null
          is_variable_amount?: boolean
          start_date?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          bf_expense_type: string | null
          category_id: string | null
          created_at: string
          credit_card_id: string | null
          date: string
          description: string
          family_member_id: string | null
          id: string
          installment_id: string | null
          installment_number: number | null
          invoice_month: string | null
          is_recurring: boolean
          notes: string | null
          payment_method: string | null
          project_id: string | null
          recurring_id: string | null
          status: string
          tags: string[]
          transfer_group_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          bf_expense_type?: string | null
          category_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          date?: string
          description: string
          family_member_id?: string | null
          id?: string
          installment_id?: string | null
          installment_number?: number | null
          invoice_month?: string | null
          is_recurring?: boolean
          notes?: string | null
          payment_method?: string | null
          project_id?: string | null
          recurring_id?: string | null
          status?: string
          tags?: string[]
          transfer_group_id?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          bf_expense_type?: string | null
          category_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          date?: string
          description?: string
          family_member_id?: string | null
          id?: string
          installment_id?: string | null
          installment_number?: number | null
          invoice_month?: string | null
          is_recurring?: boolean
          notes?: string | null
          payment_method?: string | null
          project_id?: string | null
          recurring_id?: string | null
          status?: string
          tags?: string[]
          transfer_group_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_installment_purchase: {
        Args: { p_invoices: Json; p_parent: Json; p_rows: Json }
        Returns: string
      }
      next_project_number: { Args: never; Returns: string }
      register_investment_move: {
        Args: {
          p_account_id?: string
          p_amount: number
          p_date: string
          p_family_member_id?: string
          p_investment_id: string
          p_investment_name: string
          p_ir_type?: string
          p_quantity?: number
          p_recurring_id?: string
          p_type: string
          p_unit_price?: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
