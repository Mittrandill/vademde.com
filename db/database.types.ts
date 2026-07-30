// Bu dosya `mcp__supabase__generate_typescript_types` ile üretilir; elle düzenlenmez.
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
          bank_code: string | null
          created_at: string
          currency_code: string
          iban: string | null
          id: string
          is_archived: boolean
          name: string
          opening_balance_minor: number
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bank_code?: string | null
          created_at?: string
          currency_code?: string
          iban?: string | null
          id?: string
          is_archived?: boolean
          name: string
          opening_balance_minor?: number
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bank_code?: string | null
          created_at?: string
          currency_code?: string
          iban?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          opening_balance_minor?: number
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_default: boolean
          kind: string
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          kind: string
          name: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparties: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          tax_number: string | null
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counterparties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_extractions: {
        Row: {
          created_at: string
          document_id: string
          id: string
          model: string | null
          provider: string
          raw_text: string | null
          structured_output: Json | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          model?: string | null
          provider?: string
          raw_text?: string | null
          structured_output?: Json | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          model?: string | null
          provider?: string
          raw_text?: string | null
          structured_output?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extractions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_fields: {
        Row: {
          bounding_box: Json | null
          confidence: number | null
          created_at: string
          document_id: string
          field_name: string
          id: string
          is_reviewed: boolean
          normalized_value: string | null
          page_number: number | null
          raw_value: string | null
          workspace_id: string
        }
        Insert: {
          bounding_box?: Json | null
          confidence?: number | null
          created_at?: string
          document_id: string
          field_name: string
          id?: string
          is_reviewed?: boolean
          normalized_value?: string | null
          page_number?: number | null
          raw_value?: string | null
          workspace_id: string
        }
        Update: {
          bounding_box?: Json | null
          confidence?: number | null
          created_at?: string
          document_id?: string
          field_name?: string
          id?: string
          is_reviewed?: boolean
          normalized_value?: string | null
          page_number?: number | null
          raw_value?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_fields_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_fields_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_line_items: {
        Row: {
          amount_minor: number
          created_at: string
          description: string | null
          document_id: string
          id: string
          kind: string
          occurred_at: string | null
          quantity: number | null
          remaining_minor: number | null
          sort_order: number
          tax_minor: number | null
          unit_price_minor: number | null
          workspace_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          description?: string | null
          document_id: string
          id?: string
          kind: string
          occurred_at?: string | null
          quantity?: number | null
          remaining_minor?: number | null
          sort_order?: number
          tax_minor?: number | null
          unit_price_minor?: number | null
          workspace_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          description?: string | null
          document_id?: string
          id?: string
          kind?: string
          occurred_at?: string | null
          quantity?: number | null
          remaining_minor?: number | null
          sort_order?: number
          tax_minor?: number | null
          unit_price_minor?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_line_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_line_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_processing_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          document_id: string
          id: string
          last_error: string | null
          started_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          document_id: string
          id?: string
          last_error?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          document_id?: string
          id?: string
          last_error?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_processing_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_documents: {
        Row: {
          counterparty_name: string | null
          created_at: string
          currency_code: string | null
          direction: string | null
          document_number: string | null
          document_type: string | null
          due_date: string | null
          extracted_summary: Json | null
          file_name: string
          file_size_bytes: number | null
          id: string
          issue_date: string | null
          mime_type: string
          obligation_id: string | null
          overall_confidence: number | null
          retain_original: boolean
          status: string
          storage_path: string
          suggested_category_id: string | null
          total_amount_minor: number | null
          transaction_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          counterparty_name?: string | null
          created_at?: string
          currency_code?: string | null
          direction?: string | null
          document_number?: string | null
          document_type?: string | null
          due_date?: string | null
          extracted_summary?: Json | null
          file_name: string
          file_size_bytes?: number | null
          id?: string
          issue_date?: string | null
          mime_type: string
          obligation_id?: string | null
          overall_confidence?: number | null
          retain_original?: boolean
          status?: string
          storage_path: string
          suggested_category_id?: string | null
          total_amount_minor?: number | null
          transaction_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          counterparty_name?: string | null
          created_at?: string
          currency_code?: string | null
          direction?: string | null
          document_number?: string | null
          document_type?: string | null
          due_date?: string | null
          extracted_summary?: Json | null
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          issue_date?: string | null
          mime_type?: string
          obligation_id?: string | null
          overall_confidence?: number | null
          retain_original?: boolean
          status?: string
          storage_path?: string
          suggested_category_id?: string | null
          total_amount_minor?: number | null
          transaction_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_documents_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_suggested_category_id_fkey"
            columns: ["suggested_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          amount_minor: number
          created_at: string
          due_date: string
          id: string
          installment_number: number
          obligation_id: string
          remaining_amount_minor: number
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          obligation_id: string
          remaining_amount_minor?: number
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          obligation_id?: string
          remaining_amount_minor?: number
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      obligations: {
        Row: {
          account_id: string | null
          bank_code: string | null
          category_id: string | null
          counterparty_id: string | null
          created_at: string
          currency_code: string
          direction: string
          document_type: string
          due_date: string | null
          id: string
          notes: string | null
          remaining_amount_minor: number
          status: string
          title: string
          total_amount_minor: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          bank_code?: string | null
          category_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          currency_code?: string
          direction: string
          document_type: string
          due_date?: string | null
          id?: string
          notes?: string | null
          remaining_amount_minor?: number
          status?: string
          title: string
          total_amount_minor: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          bank_code?: string | null
          category_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          currency_code?: string
          direction?: string
          document_type?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          remaining_amount_minor?: number
          status?: string
          title?: string
          total_amount_minor?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obligations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          account_id: string | null
          amount_minor: number
          created_at: string
          id: string
          installment_id: string | null
          notes: string | null
          obligation_id: string | null
          paid_at: string
          transaction_id: string | null
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          amount_minor: number
          created_at?: string
          id?: string
          installment_id?: string | null
          notes?: string | null
          obligation_id?: string | null
          paid_at?: string
          transaction_id?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          amount_minor?: number
          created_at?: string
          id?: string
          installment_id?: string | null
          notes?: string | null
          obligation_id?: string | null
          paid_at?: string
          transaction_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          currency_code: string
          full_name: string | null
          id: string
          locale: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          currency_code?: string
          full_name?: string | null
          id: string
          locale?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          currency_code?: string
          full_name?: string | null
          id?: string
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          id: string
          notification_identifier: string | null
          obligation_id: string
          remind_at: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_identifier?: string | null
          obligation_id: string
          remind_at: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_identifier?: string | null
          obligation_id?: string
          remind_at?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: true
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount_minor: number
          category_id: string | null
          counterparty_id: string | null
          created_at: string
          currency_code: string
          description: string | null
          direction: string
          id: string
          occurred_at: string
          transfer_to_account_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          amount_minor: number
          category_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          currency_code?: string
          description?: string | null
          direction: string
          id?: string
          occurred_at?: string
          transfer_to_account_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          amount_minor?: number
          category_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          currency_code?: string
          description?: string | null
          direction?: string
          id?: string
          occurred_at?: string
          transfer_to_account_id?: string | null
          updated_at?: string
          workspace_id?: string
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
            foreignKeyName: "transactions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_to_account_id_fkey"
            columns: ["transfer_to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          type: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_workspace_member: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      recompute_installment_progress: {
        Args: { target_installment_id: string }
        Returns: undefined
      }
      recompute_obligation_progress: {
        Args: { target_obligation_id: string }
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
    Enums: {},
  },
} as const
