export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      campaign_followups: {
        Row: {
          body: string | null
          campaign_id: string
          created_at: string | null
          delay_days: number
          delay_hours: number | null
          id: string
          step_number: number
          subject: string | null
          template_id: string | null
        }
        Insert: {
          body?: string | null
          campaign_id: string
          created_at?: string | null
          delay_days?: number
          delay_hours?: number | null
          id?: string
          step_number: number
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          body?: string | null
          campaign_id?: string
          created_at?: string | null
          delay_days?: number
          delay_hours?: number | null
          id?: string
          step_number?: number
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_followups_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_followups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sends: {
        Row: {
          campaign_id: string | null
          clicked_at: string | null
          created_at: string | null
          email: string
          error_message: string | null
          id: string
          opened_at: string | null
          prospect_id: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          clicked_at?: string | null
          created_at?: string | null
          email: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          prospect_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          clicked_at?: string | null
          created_at?: string | null
          email?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          prospect_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sends_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          batch_size: number | null
          body: string
          clicked_count: number | null
          created_at: string | null
          email_config_id: string | null
          email_list_id: string | null
          emails_per_hour: number | null
          failed_count: number | null
          bounced_count: number | null
          id: string
          last_batch_sent_at: string | null
          name: string
          opened_count: number | null
          scheduled_at: string | null
          send_delay_minutes: number | null
          sent_count: number | null
          status: string | null
          subject: string
          template_id: string | null
          total_recipients: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          batch_size?: number | null
          body?: string
          clicked_count?: number | null
          created_at?: string | null
          email_config_id?: string | null
          email_list_id?: string | null
          emails_per_hour?: number | null
          failed_count?: number | null
          bounced_count?: number | null
          id?: string
          last_batch_sent_at?: string | null
          name: string
          opened_count?: number | null
          scheduled_at?: string | null
          send_delay_minutes?: number | null
          sent_count?: number | null
          status?: string | null
          subject: string
          template_id?: string | null
          total_recipients?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          batch_size?: number | null
          body?: string
          clicked_count?: number | null
          created_at?: string | null
          email_config_id?: string | null
          email_list_id?: string | null
          emails_per_hour?: number | null
          failed_count?: number | null
          bounced_count?: number | null
          id?: string
          last_batch_sent_at?: string | null
          name?: string
          opened_count?: number | null
          scheduled_at?: string | null
          send_delay_minutes?: number | null
          sent_count?: number | null
          status?: string | null
          subject?: string
          template_id?: string | null
          total_recipients?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_email_list_id_fkey"
            columns: ["email_list_id"]
            isOneToOne: false
            referencedRelation: "email_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_email_config"
            columns: ["email_config_id"]
            isOneToOne: false
            referencedRelation: "email_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_configs: {
        Row: {
          created_at: string | null
          id: string
          imap_host: string
          imap_port: number
          security: string
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_username: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          imap_host?: string
          imap_port?: number
          security?: string
          smtp_host?: string
          smtp_password: string
          smtp_port?: number
          smtp_username: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          imap_host?: string
          imap_port?: number
          security?: string
          smtp_host?: string
          smtp_password?: string
          smtp_port?: number
          smtp_username?: string
          user_id?: string
        }
        Relationships: []
      }
      email_list_prospects: {
        Row: {
          created_at: string
          id: string
          list_id: string
          prospect_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          prospect_id: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_list_prospects_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "email_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_list_prospects_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_messages: {
        Row: {
          body: string | null
          config_id: string
          date: string
          folder: string
          from_email: string
          id: string
          read: boolean | null
          subject: string | null
          to_email: string
          uid: number
          user_id: string
        }
        Insert: {
          body?: string | null
          config_id: string
          date: string
          folder?: string
          from_email: string
          id?: string
          read?: boolean | null
          subject?: string | null
          to_email: string
          uid: number
          user_id: string
        }
        Update: {
          body?: string | null
          config_id?: string
          date?: string
          folder?: string
          from_email?: string
          id?: string
          read?: boolean | null
          subject?: string | null
          to_email?: string
          uid?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "email_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          content: string
          created_at: string | null
          id: string
          is_default: boolean | null
          is_html: boolean
          name: string
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body?: string
          content: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_html?: boolean
          name: string
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          content?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_html?: boolean
          name?: string
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      prospects: {
        Row: {
          company: string | null
          created_at: string
          email: string
          email_list_id: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          email_list_id?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          email_list_id?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospects_email_list_id_fkey"
            columns: ["email_list_id"]
            isOneToOne: false
            referencedRelation: "email_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      recipients: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          current_step: number | null
          email: string
          id: string
          last_email_sent_at: string | null
          message_id: string | null
          name: string | null
          opened_at: string | null
          replied: boolean | null
          bounced: boolean | null
          bounced_at: string | null
          status: string | null
          track_click_link: string | null
          track_open_link: string | null
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          current_step?: number | null
          email: string
          id?: string
          last_email_sent_at?: string | null
          message_id?: string | null
          name?: string | null
          opened_at?: string | null
          replied?: boolean | null
          bounced?: boolean | null
          bounced_at?: string | null
          status?: string | null
          track_click_link?: string | null
          track_open_link?: string | null
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          current_step?: number | null
          email?: string
          id?: string
          last_email_sent_at?: string | null
          message_id?: string | null
          name?: string | null
          opened_at?: string | null
          replied?: boolean | null
          bounced?: boolean | null
          bounced_at?: string | null
          status?: string | null
          track_click_link?: string | null
          track_open_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      smtp_settings: {
        Row: {
          created_at: string | null
          from_email: string
          from_name: string | null
          host: string
          id: string
          password: string
          port: number
          updated_at: string | null
          use_tls: boolean | null
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string | null
          from_email: string
          from_name?: string | null
          host: string
          id?: string
          password: string
          port?: number
          updated_at?: string | null
          use_tls?: boolean | null
          user_id?: string
          username: string
        }
        Update: {
          created_at?: string | null
          from_email?: string
          from_name?: string | null
          host?: string
          id?: string
          password?: string
          port?: number
          updated_at?: string | null
          use_tls?: boolean | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_restart_failed_campaigns: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      fix_campaign_statistics: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      increment_clicked_count: {
        Args: { campaign_id: string }
        Returns: undefined
      }
      increment_opened_count: {
        Args: { campaign_id: string }
        Returns: undefined
      }
      increment_bounced_count: {
        Args: { campaign_id: string }
        Returns: undefined
      }
      monitor_and_restart_campaigns: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      resume_stuck_campaigns: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      trigger_next_batch: {
        Args: Record<PropertyKey, never>
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
