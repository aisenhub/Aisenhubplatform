export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      plans: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          features: Json;
          id: string;
          kind: string;
          name: string;
          platform_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          features?: Json;
          id?: string;
          kind: string;
          name: string;
          platform_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          features?: Json;
          id?: string;
          kind?: string;
          name?: string;
          platform_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plans_platform_id_fkey';
            columns: ['platform_id'];
            isOneToOne: false;
            referencedRelation: 'platforms';
            referencedColumns: ['id'];
          },
        ];
      };
      platform_accounts: {
        Row: {
          activated_at: string;
          anonymized_at: string | null;
          closed_at: string | null;
          created_at: string;
          id: string;
          last_login_at: string | null;
          platform_id: string;
          status: string;
          suspended_at: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          activated_at?: string;
          anonymized_at?: string | null;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          last_login_at?: string | null;
          platform_id: string;
          status?: string;
          suspended_at?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          activated_at?: string;
          anonymized_at?: string | null;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          last_login_at?: string | null;
          platform_id?: string;
          status?: string;
          suspended_at?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_accounts_platform_id_fkey';
            columns: ['platform_id'];
            isOneToOne: false;
            referencedRelation: 'platforms';
            referencedColumns: ['id'];
          },
        ];
      };
      platform_auth_origins: {
        Row: {
          created_at: string;
          email_confirmation_url: string;
          environment: string;
          id: string;
          oauth_callback_url: string;
          origin: string;
          password_reset_url: string;
          platform_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email_confirmation_url: string;
          environment: string;
          id?: string;
          oauth_callback_url: string;
          origin: string;
          password_reset_url: string;
          platform_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email_confirmation_url?: string;
          environment?: string;
          id?: string;
          oauth_callback_url?: string;
          origin?: string;
          password_reset_url?: string;
          platform_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_auth_origins_platform_id_fkey';
            columns: ['platform_id'];
            isOneToOne: false;
            referencedRelation: 'platforms';
            referencedColumns: ['id'];
          },
        ];
      };
      platform_preferences: {
        Row: {
          platform_account_id: string;
          preferences: Json;
          row_version: number;
          updated_at: string;
        };
        Insert: {
          platform_account_id: string;
          preferences?: Json;
          row_version?: number;
          updated_at?: string;
        };
        Update: {
          platform_account_id?: string;
          preferences?: Json;
          row_version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_preferences_platform_account_id_fkey';
            columns: ['platform_account_id'];
            isOneToOne: true;
            referencedRelation: 'platform_accounts';
            referencedColumns: ['id'];
          },
        ];
      };
      platform_profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          locale: string | null;
          metadata: Json;
          platform_account_id: string;
          row_version: number;
          timezone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          locale?: string | null;
          metadata?: Json;
          platform_account_id: string;
          row_version?: number;
          timezone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          locale?: string | null;
          metadata?: Json;
          platform_account_id?: string;
          row_version?: number;
          timezone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_profiles_platform_account_id_fkey';
            columns: ['platform_account_id'];
            isOneToOne: true;
            referencedRelation: 'platform_accounts';
            referencedColumns: ['id'];
          },
        ];
      };
      platforms: {
        Row: {
          allow_activation: boolean;
          code: string;
          config: Json;
          created_at: string;
          default_locale: string | null;
          default_plan_id: string | null;
          default_plan_kind: string;
          id: string;
          name: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          allow_activation?: boolean;
          code: string;
          config?: Json;
          created_at?: string;
          default_locale?: string | null;
          default_plan_id?: string | null;
          default_plan_kind?: string;
          id?: string;
          name: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          allow_activation?: boolean;
          code?: string;
          config?: Json;
          created_at?: string;
          default_locale?: string | null;
          default_plan_id?: string | null;
          default_plan_kind?: string;
          id?: string;
          name?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_default_free_plan_fk';
            columns: ['id', 'default_plan_id', 'default_plan_kind'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['platform_id', 'id', 'kind'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;
type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
